const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const ICON_DIR = process.env.ICON_DIR || path.join(__dirname, '../data/icons');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 256 * 1024;
const SOURCE_TIMEOUT_MS = 2500;
const TOTAL_BUDGET_MS = 6000;
const HOST_COOLDOWN_MS = 10 * 60 * 1000;
const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_MS = 30 * 60 * 1000;
const MAX_OUTBOUND = 8;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Node 18+ 自带全局 fetch；低版本回退到 undici（若安装在位），都没有则直接走字母兜底
let fetchImpl = typeof fetch === 'function' ? fetch : null;
if (!fetchImpl) {
  try { fetchImpl = require('undici').fetch; } catch (e) { fetchImpl = null; }
}

const SOURCES = [
  { id: 'google', url: (h) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=128` },
  { id: 'iconhorse', url: (h) => `https://icon.horse/icon/${encodeURIComponent(h)}` },
  { id: 'faviconim', url: (h) => `https://favicon.im/${encodeURIComponent(h)}?larger=true` },
  { id: 'xinac', url: (h) => `https://api.xinac.net/icon/?url=${encodeURIComponent('https://' + h)}&sz=128` },
  { id: 'afmax', url: (h) => `https://api.afmax.cn/so/ico/index.php?r=${encodeURIComponent('https://' + h)}&sz=128` },
];

const LEGACY_ICON_PATTERN = /(api\.xinac\.net\/icon|api\.afmax\.cn\/so\/ico|favicon\.im\/|icon\.horse\/icon|google\.com\/s2\/favicons)|^\/icons\//i;

const breakers = new Map();
const hostCooldowns = new Map();
const inflight = new Map();
let outbound = 0;
let googleGlobeHash = null;

fs.mkdirSync(ICON_DIR, { recursive: true });

function normalizeHost(raw) {
  const host = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  if (!host || host.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) return null;
  return host;
}

function hostOf(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

function sanitizeLogoUrl(value) {
  const logo = String(value || '').trim();
  if (!logo) return null;
  if (LEGACY_ICON_PATTERN.test(logo)) return null;
  if (!/^https?:\/\//i.test(logo) && !logo.startsWith('/')) return null;
  return logo;
}

function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02) && buf[3] === 0x00) return 'image/x-icon';
  return null;
}

async function fetchBytes(url, timeoutMs) {
  if (!fetchImpl) return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), Math.max(500, timeoutMs)) : null;
  try {
    const res = await fetchImpl(url, {
      signal: controller ? controller.signal : undefined,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return null;
    return buf;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isBreakerOpen(id) {
  const b = breakers.get(id);
  return !!(b && b.openUntil > Date.now());
}

function recordSourceFailure(id) {
  const b = breakers.get(id) || { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= BREAKER_THRESHOLD) {
    b.openUntil = Date.now() + BREAKER_OPEN_MS;
    b.fails = 0;
    console.log(`[icons] source ${id} 熔断 ${Math.round(BREAKER_OPEN_MS / 60000)} 分钟`);
  }
  breakers.set(id, b);
}

function recordSourceSuccess(id) {
  breakers.set(id, { fails: 0, openUntil: 0 });
}

function warmGoogleGlobeHash() {
  const probe = `https://www.google.com/s2/favicons?domain=invalid-${Date.now()}-probe.invalid&sz=128`;
  fetchBytes(probe, SOURCE_TIMEOUT_MS)
    .then((buf) => {
      if (buf) googleGlobeHash = buf.toString('base64');
    })
    .catch(() => {});
}

async function fetchFromSources(host) {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (const source of SOURCES) {
    if (Date.now() >= deadline) break;
    if (isBreakerOpen(source.id)) continue;
    if (outbound >= MAX_OUTBOUND) break;

    outbound += 1;
    const buf = await fetchBytes(source.url(host), Math.min(SOURCE_TIMEOUT_MS, deadline - Date.now()));
    outbound -= 1;

    if (!buf) {
      recordSourceFailure(source.id);
      continue;
    }
    if (!sniffImageType(buf)) continue;
    if (source.id === 'google' && googleGlobeHash && buf.toString('base64') === googleGlobeHash) continue;

    recordSourceSuccess(source.id);
    return buf;
  }
  return null;
}

function readCached(host) {
  try {
    const file = path.join(ICON_DIR, host);
    const stat = fs.statSync(file);
    const buf = fs.readFileSync(file);
    const type = sniffImageType(buf);
    if (!type) return null;
    return { buf, type, fresh: Date.now() - stat.mtimeMs < CACHE_TTL_MS };
  } catch {
    return null;
  }
}

function getOrFetch(host) {
  if (inflight.has(host)) return inflight.get(host);
  const task = (async () => {
    const buf = await fetchFromSources(host);
    if (!buf) return null;
    try {
      fs.writeFileSync(path.join(ICON_DIR, host), buf);
    } catch (e) {
      console.error('[icons] 写入缓存失败:', e.message);
    }
    return buf;
  })().finally(() => inflight.delete(host));
  inflight.set(host, task);
  return task;
}

async function ensureIcon(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  const cached = readCached(normalized);
  if (cached && cached.fresh) return cached.buf;
  return getOrFetch(normalized);
}

function sendIcon(res, type, buf) {
  res.set('Content-Type', type);
  res.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800, immutable');
  res.send(buf);
}

function sweepExpired() {
  fs.readdir(ICON_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach((name) => {
      const file = path.join(ICON_DIR, name);
      fs.stat(file, (statErr, stat) => {
        if (statErr || !stat.isFile()) return;
        if (now - stat.mtimeMs > CACHE_TTL_MS * 2) fs.unlink(file, () => {});
      });
    });
  });
}

const iconLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:host', iconLimiter, async (req, res) => {
  const host = normalizeHost(req.params.host);
  if (!host) return res.status(400).set('Cache-Control', 'no-store').end();

  const cached = readCached(host);
  if (cached && cached.fresh) return sendIcon(res, cached.type, cached.buf);

  if ((hostCooldowns.get(host) || 0) > Date.now()) {
    if (cached) return sendIcon(res, cached.type, cached.buf);
    return res.status(404).set('Cache-Control', 'no-store').end();
  }

  try {
    const buf = await getOrFetch(host);
    if (buf) {
      const type = sniffImageType(buf);
      if (type) return sendIcon(res, type, buf);
    }
  } catch (e) {
    console.error('[icons] 取图异常:', e.message);
  }

  if (cached) return sendIcon(res, cached.type, cached.buf);
  hostCooldowns.set(host, Date.now() + HOST_COOLDOWN_MS);
  res.status(404).set('Cache-Control', 'no-store').end();
});

warmGoogleGlobeHash();
sweepExpired();
setInterval(sweepExpired, SWEEP_INTERVAL_MS).unref();

module.exports = router;
module.exports.hostOf = hostOf;
module.exports.normalizeHost = normalizeHost;
module.exports.sanitizeLogoUrl = sanitizeLogoUrl;
module.exports.ensureIcon = ensureIcon;
