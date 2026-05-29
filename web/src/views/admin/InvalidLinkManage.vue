<template>
  <div class="invalid-link-manage">
    <div class="section-header">
      <div>
        <h3>失效链接治理</h3>
        <p class="page-desc">扫描全部卡片链接，优先清理明确失效的站点，并把 Cloudflare 验证、真正无法连接、仍需人工确认的链接分开列出。</p>
        <div class="extension-status-inline" :class="extensionAvailable ? 'is-ready' : 'is-missing'">
          <span class="status-dot"></span>
          <span>{{ extensionAvailable ? '扩展已就绪，可直接检测' : '未检测到扩展，需先安装后使用' }}</span>
        </div>
      </div>
      <div class="top-actions">
        <button @click="viewOnlyUnreachable = !viewOnlyUnreachable" class="btn btn-secondary">
          {{ viewOnlyUnreachable ? '显示全部结果' : '仅查看真正断链' }}
        </button>
        <button @click="handleDetectInvalidLinks" class="btn btn-primary" :disabled="detecting || removing">
          {{ detecting ? (detectProgressText || '检测中...') : '🔗 一键检测失效链接' }}
        </button>
      </div>
    </div>

    <div v-if="extensionAvailable === false" class="extension-guide-banner">
      <div>
        <strong>此功能依赖 SmartNavora 浏览器扩展</strong>
        <p>当前未检测到扩展，失效链接治理无法执行。请先安装并启用扩展，再进行检测。</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="showExtensionGuide = true">查看安装指引</button>
        <button class="btn btn-primary" @click="refreshExtensionAvailability">重新检测扩展</button>
      </div>
    </div>

    <div v-if="summary" class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">总卡片数</div>
        <div class="summary-value">{{ summary.total }}</div>
      </div>
      <div class="summary-card success">
        <div class="summary-label">有效链接</div>
        <div class="summary-value">{{ summary.valid }}</div>
      </div>
      <div class="summary-card danger">
        <div class="summary-label">确定失效</div>
        <div class="summary-value">{{ summary.safeToDelete }}</div>
      </div>
      <div class="summary-card warning">
        <div class="summary-label">Cloudflare 验证</div>
        <div class="summary-value">{{ summary.cloudflare }}</div>
      </div>
      <div class="summary-card warning">
        <div class="summary-label">无法连接</div>
        <div class="summary-value">{{ summary.unreachable }}</div>
      </div>
      <div class="summary-card warning">
        <div class="summary-label">人工确认</div>
        <div class="summary-value">{{ summary.manualReview }}</div>
      </div>
      <div class="summary-card muted">
        <div class="summary-label">跳过检测</div>
        <div class="summary-value">{{ summary.skipped }}</div>
      </div>
    </div>

    <div v-if="scannedAt" class="scan-meta">最近检测：{{ formattedScannedAt }}</div>

    <div v-if="detecting" class="progress-card">
      <div class="progress-header">
        <span>{{ detectProgressText || '正在检测...' }}</span>
        <strong>{{ detectProgressPercent }}%</strong>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${detectProgressPercent}%` }"></div>
      </div>
    </div>

    <div v-if="!viewOnlyUnreachable && safeToDelete.length > 0" class="result-section danger-section">
      <div class="result-header">
        <div>
          <h4>确定失效</h4>
          <p>这类链接通常可以直接清理，如域名不存在、HTTP 404/410。</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" @click="toggleSelectAll('safe')">
            {{ allSafeSelected ? '取消全选' : '全选本组' }}
          </button>
          <button class="btn btn-secondary" :disabled="detecting || removing || selectedSafeIds.length === 0" @click="recheckSelected('safe')">
            {{ detecting ? '复检中...' : `重新检测已选 (${selectedSafeIds.length})` }}
          </button>
          <button class="btn btn-danger" :disabled="removing || selectedSafeIds.length === 0" @click="removeSelected('safe')">
            {{ removing ? '删除中...' : `删除已选 (${selectedSafeIds.length})` }}
          </button>
          <button class="btn btn-danger" :disabled="removing" @click="removeAllSafeToDelete">
            {{ removing ? '删除中...' : `一键删除全部确定失效 (${safeToDelete.length})` }}
          </button>
        </div>
      </div>

      <div class="result-list">
        <div v-for="item in safeToDelete" :key="item.id" class="result-item danger">
          <label class="checkbox-wrap">
            <input type="checkbox" :value="item.id" v-model="selectedSafeIds" />
          </label>
          <div class="result-info">
            <div class="result-title-row">
              <strong>{{ item.title || '未命名卡片' }}</strong>
              <span class="reason danger">{{ item.reason }}</span>
            </div>
            <a class="result-url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.url }}</a>
            <div class="result-meta">
              <span>分类：{{ formatCategory(item) }}</span>
              <span v-if="item.detail">说明：{{ item.detail }}</span>
              <span v-if="item.statusCode">状态码：{{ item.statusCode }}</span>
            </div>
          </div>
          <div class="result-actions">
            <button class="link-btn" @click="openLink(item.url)">新标签页打开</button>
            <button class="delete-btn" :disabled="removing" @click="removeCards([item.id], `确定删除「${item.title || '未命名卡片'}」吗？`)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!viewOnlyUnreachable && cloudflareProtected.length > 0" class="result-section warning-section">
      <div class="result-header">
        <div>
          <h4>Cloudflare 人机验证</h4>
          <p>这类链接大概率仍然可用，但当前需要人工验证或盾页挑战，建议先打开确认。</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" @click="toggleSelectAll('cloudflare')">
            {{ allCloudflareSelected ? '取消全选' : '全选本组' }}
          </button>
          <button class="btn btn-secondary" :disabled="detecting || removing || selectedCloudflareIds.length === 0" @click="recheckSelected('cloudflare')">
            {{ detecting ? '复检中...' : `重新检测已选 (${selectedCloudflareIds.length})` }}
          </button>
          <button class="btn btn-warning" :disabled="removing || selectedCloudflareIds.length === 0" @click="removeSelected('cloudflare')">
            {{ removing ? '删除中...' : `删除已选 (${selectedCloudflareIds.length})` }}
          </button>
        </div>
      </div>

      <div class="result-list">
        <div v-for="item in cloudflareProtected" :key="item.id" class="result-item warning">
          <label class="checkbox-wrap">
            <input type="checkbox" :value="item.id" v-model="selectedCloudflareIds" />
          </label>
          <div class="result-info">
            <div class="result-title-row">
              <strong>{{ item.title || '未命名卡片' }}</strong>
              <span class="reason warning">{{ item.reason }}</span>
            </div>
            <a class="result-url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.url }}</a>
            <div class="result-meta">
              <span>分类：{{ formatCategory(item) }}</span>
              <span v-if="item.detail">说明：{{ item.detail }}</span>
              <span v-if="item.statusCode">状态码：{{ item.statusCode }}</span>
            </div>
          </div>
          <div class="result-actions">
            <button class="link-btn" @click="openLink(item.url)">新标签页打开</button>
            <button class="delete-btn warning" :disabled="removing" @click="removeCards([item.id], `确定删除「${item.title || '未命名卡片'}」吗？`)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="unreachableItems.length > 0" class="result-section danger-section">
      <div class="result-header">
        <div>
          <h4>真正无法连接</h4>
          <p>这类链接经过多轮检测后仍无法访问，通常才是真正断链或站点已不可达。</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" @click="toggleSelectAll('unreachable')">
            {{ allUnreachableSelected ? '取消全选' : '全选本组' }}
          </button>
          <button class="btn btn-secondary" :disabled="detecting || removing || selectedUnreachableIds.length === 0" @click="recheckSelected('unreachable')">
            {{ detecting ? '复检中...' : `重新检测已选 (${selectedUnreachableIds.length})` }}
          </button>
          <button class="btn btn-danger" :disabled="removing || selectedUnreachableIds.length === 0" @click="removeSelected('unreachable')">
            {{ removing ? '删除中...' : `删除已选 (${selectedUnreachableIds.length})` }}
          </button>
          <button class="btn btn-danger" :disabled="removing || unreachableItems.length === 0" @click="removeAllUnreachableItems">
            {{ removing ? '删除中...' : `一键删除全部真正断链 (${unreachableItems.length})` }}
          </button>
        </div>
      </div>

      <div class="result-list">
        <div v-for="item in unreachableItems" :key="item.id" class="result-item danger">
          <label class="checkbox-wrap">
            <input type="checkbox" :value="item.id" v-model="selectedUnreachableIds" />
          </label>
          <div class="result-info">
            <div class="result-title-row">
              <strong>{{ item.title || '未命名卡片' }}</strong>
              <span class="reason danger">{{ item.reason }}</span>
            </div>
            <a class="result-url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.url }}</a>
            <div class="result-meta">
              <span>分类：{{ formatCategory(item) }}</span>
              <span v-if="item.detail">说明：{{ item.detail }}</span>
              <span v-if="item.statusCode">状态码：{{ item.statusCode }}</span>
            </div>
          </div>
          <div class="result-actions">
            <button class="link-btn" @click="openLink(item.url)">新标签页打开</button>
            <button class="delete-btn" :disabled="removing" @click="removeCards([item.id], `确定删除「${item.title || '未命名卡片'}」吗？`)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!viewOnlyUnreachable && manualReviewItems.length > 0" class="result-section warning-section">
      <div class="result-header">
        <div>
          <h4>仍需人工确认</h4>
          <p>站点本身仍可访问，但当前具体页面状态异常，建议手动打开确认是否需要保留。</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" @click="toggleSelectAll('manual')">
            {{ allManualSelected ? '取消全选' : '全选本组' }}
          </button>
          <button class="btn btn-secondary" :disabled="detecting || removing || selectedManualIds.length === 0" @click="recheckSelected('manual')">
            {{ detecting ? '复检中...' : `重新检测已选 (${selectedManualIds.length})` }}
          </button>
          <button class="btn btn-warning" :disabled="removing || selectedManualIds.length === 0" @click="removeSelected('manual')">
            {{ removing ? '删除中...' : `删除已选 (${selectedManualIds.length})` }}
          </button>
        </div>
      </div>

      <div class="result-list">
        <div v-for="item in manualReviewItems" :key="item.id" class="result-item warning">
          <label class="checkbox-wrap">
            <input type="checkbox" :value="item.id" v-model="selectedManualIds" />
          </label>
          <div class="result-info">
            <div class="result-title-row">
              <strong>{{ item.title || '未命名卡片' }}</strong>
              <span class="reason warning">{{ item.reason }}</span>
            </div>
            <a class="result-url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.url }}</a>
            <div class="result-meta">
              <span>分类：{{ formatCategory(item) }}</span>
              <span v-if="item.detail">说明：{{ item.detail }}</span>
              <span v-if="item.statusCode">状态码：{{ item.statusCode }}</span>
            </div>
          </div>
          <div class="result-actions">
            <button class="link-btn" @click="openLink(item.url)">新标签页打开</button>
            <button class="delete-btn warning" :disabled="removing" @click="removeCards([item.id], `确定删除「${item.title || '未命名卡片'}」吗？`)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="detected && safeToDelete.length === 0 && cloudflareProtected.length === 0 && unreachableItems.length === 0 && manualReviewItems.length === 0" class="empty-state success-state">
      <h3>没有发现失效链接</h3>
      <p>当前卡片链接整体状态正常。</p>
    </div>

    <div v-else-if="detected && viewOnlyUnreachable && unreachableItems.length === 0" class="empty-state success-state">
      <h3>没有真正断链</h3>
      <p>当前检测结果中，没有识别出“真正无法连接”的卡片。</p>
    </div>

    <div v-else-if="!detected" class="empty-state initial-state">
      <h3>点击“一键检测失效链接”开始扫描</h3>
      <p>系统会自动执行多轮检测，并将结果分为“确定失效”、“Cloudflare 验证”、“真正无法连接”和“仍需人工确认”。</p>
    </div>

    <div v-if="skipped.length > 0" class="skipped-box">
      <strong>已跳过 {{ skipped.length }} 条链接：</strong>
      <span>包含内网、本地地址或非 HTTP 链接，不参与公网连通性判断。</span>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div v-if="showExtensionGuide" class="modal-overlay" @click.self="showExtensionGuide = false">
      <div class="guide-modal">
        <div class="guide-modal-header">
          <h4>安装 SmartNavora 浏览器扩展</h4>
          <button class="guide-close" @click="showExtensionGuide = false">×</button>
        </div>
        <div class="guide-modal-body">
          <p>失效链接治理使用浏览器扩展在本机侧执行检测，因此必须先安装并启用扩展。</p>
          <ol class="guide-steps">
            <li>打开项目中的 `browser-extension/` 目录。</li>
            <li>在 Chrome/Edge 打开扩展管理页，并开启“开发者模式”。</li>
            <li>点击“加载已解压的扩展程序”，选择 `browser-extension/` 目录。</li>
            <li>安装完成后，返回本页面点击“重新检测扩展”。</li>
          </ol>
          <p class="guide-tip">如果你已经安装过扩展，请确认它仍处于启用状态，并且已更新到最新代码。</p>
        </div>
        <div class="guide-modal-actions">
          <button class="btn btn-secondary" @click="showExtensionGuide = false">关闭</button>
          <button class="btn btn-primary" @click="refreshExtensionAvailability">重新检测扩展</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getAllCards, removeManyCards } from '../../api';

const detecting = ref(false);
const removing = ref(false);
const detected = ref(false);
const errorMsg = ref('');
const scannedAt = ref('');
const summary = ref(null);
const safeToDelete = ref([]);
const cloudflareProtected = ref([]);
const unreachableItems = ref([]);
const manualReviewItems = ref([]);
const skipped = ref([]);
const selectedSafeIds = ref([]);
const selectedCloudflareIds = ref([]);
const selectedUnreachableIds = ref([]);
const selectedManualIds = ref([]);
const detectProgressText = ref('');
const detectProgressPercent = ref(0);
const viewOnlyUnreachable = ref(false);
const extensionAvailable = ref(null);
const showExtensionGuide = ref(false);

function isPrivateHostname(hostname) {
  const value = (hostname || '').toLowerCase();
  if (!value || value === 'localhost' || value.endsWith('.local')) return true;
  if (/^10\./.test(value) || /^127\./.test(value) || /^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (/^169\.254\./.test(value)) return true;
  if (value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  return false;
}

function isAccessibleStatus(status) {
  return (status >= 200 && status < 400) || status === 401 || status === 403;
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tryOpaqueFetch(url, method, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { method, mode: 'no-cors', signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkUrlFromBrowser(card) {
  const id = card.id;
  const title = card.title || '未命名卡片';
  const url = card.url;
  const menuName = card.menu_name || card.menuName || '未分类';
  const subMenuName = card.sub_menu_name || card.subMenuName || '';

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { id, title, url, menuName, subMenuName, bucket: 'skipped', reason: '链接格式无效', detail: '无法解析为有效 URL', statusCode: null };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { id, title, url, menuName, subMenuName, bucket: 'skipped', reason: '非 HTTP 链接', detail: parsedUrl.protocol, statusCode: null };
  }

  if (isPrivateHostname(parsedUrl.hostname)) {
    return { id, title, url, menuName, subMenuName, bucket: 'skipped', reason: '内网或本地地址', detail: parsedUrl.hostname, statusCode: null };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(url, { method: 'HEAD', mode: 'cors', signal: controller.signal });
    } catch (corsError) {
      if (corsError.name === 'AbortError') throw corsError;
      // CORS 拦截或服务器拒绝 HEAD → 继续尝试 no-cors / GET 连通性验证
      clearTimeout(timeoutId);
      try {
        const opaque = await tryOpaqueFetch(url, 'HEAD');
        if (opaque.type === 'opaque') {
          return { id, title, url, menuName, subMenuName, bucket: 'valid', reason: '服务器可访问', detail: 'CORS 限制无法获取详细状态码', statusCode: null };
        }
      } catch (headOpaqueError) {
        if (headOpaqueError.name === 'AbortError') throw headOpaqueError;
        try {
          const opaqueGet = await tryOpaqueFetch(url, 'GET');
          if (opaqueGet.type === 'opaque') {
            return { id, title, url, menuName, subMenuName, bucket: 'valid', reason: '服务器可访问', detail: '站点拒绝 HEAD，已通过 GET 连通性验证', statusCode: null };
          }
        } catch (getOpaqueError) {
          if (getOpaqueError.name === 'AbortError') throw getOpaqueError;
        }
        throw corsError;
      }
    }
    clearTimeout(timeoutId);

    if (response.type === 'opaque') {
      return { id, title, url, menuName, subMenuName, bucket: 'valid', reason: '服务器可访问', detail: 'CORS 限制无法获取详细状态码', statusCode: null };
    }

    const status = response.status;
    if (isAccessibleStatus(status)) {
      return { id, title, url, menuName, subMenuName, bucket: 'valid', reason: '访问正常', detail: `HTTP ${status}`, statusCode: status };
    }
    if (status === 404 || status === 410) {
      return { id, title, url, menuName, subMenuName, bucket: 'safe_to_delete', reason: status === 404 ? '页面不存在' : '页面已永久删除', detail: `HTTP ${status}`, statusCode: status };
    }

    if (isRetryableStatus(status)) {
      await delay(600);
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 15000);
      try {
        const retryResponse = await fetch(url, { method: 'GET', mode: 'cors', signal: controller2.signal });
        clearTimeout(timeoutId2);
        if (retryResponse.type !== 'opaque') {
          const rs = retryResponse.status;
          if (isAccessibleStatus(rs)) {
            return { id, title, url, menuName, subMenuName, bucket: 'valid', reason: '访问正常', detail: `重试后恢复，HTTP ${rs}`, statusCode: rs };
          }
          if (rs === 404 || rs === 410) {
            return { id, title, url, menuName, subMenuName, bucket: 'safe_to_delete', reason: rs === 404 ? '页面不存在' : '页面已永久删除', detail: `重试后确认，HTTP ${rs}`, statusCode: rs };
          }
        }
      } catch {
        // retry failed
      }
    }

    return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', reason: `HTTP ${status}`, detail: `服务器返回错误状态码`, statusCode: status };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', reason: '连接超时', detail: '15秒内未响应', statusCode: null };
    }
    return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', reason: '无法连接', detail: error.message || '网络错误', statusCode: null };
  }
}

function handleBeforeUnload(event) {
  if (!detecting.value) return;
  event.preventDefault();
  event.returnValue = '';
}

watch(detecting, (value) => {
  if (typeof window === 'undefined') return;
  window.__smartnavoraInvalidScanActive = value;
  if (value) {
    window.addEventListener('beforeunload', handleBeforeUnload);
  } else {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  }
}, { immediate: true });

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.__smartnavoraInvalidScanActive = false;
    window.removeEventListener('beforeunload', handleBeforeUnload);
  }
});

const formattedScannedAt = computed(() => {
  if (!scannedAt.value) return '';
  return new Date(scannedAt.value).toLocaleString('zh-CN', { hour12: false });
});

const allSafeSelected = computed(() => safeToDelete.value.length > 0 && selectedSafeIds.value.length === safeToDelete.value.length);
const allCloudflareSelected = computed(() => cloudflareProtected.value.length > 0 && selectedCloudflareIds.value.length === cloudflareProtected.value.length);
const allUnreachableSelected = computed(() => unreachableItems.value.length > 0 && selectedUnreachableIds.value.length === unreachableItems.value.length);
const allManualSelected = computed(() => manualReviewItems.value.length > 0 && selectedManualIds.value.length === manualReviewItems.value.length);
let extensionRequestSeed = 0;

function formatCategory(item) {
  return item.subMenuName ? `${item.menuName} / ${item.subMenuName}` : item.menuName;
}

function openLink(url) {
  window.open(url, '_blank', 'noopener');
}

function createExtensionRequestId(prefix) {
  extensionRequestSeed += 1;
  return `${prefix}-${Date.now()}-${extensionRequestSeed}`;
}

function waitForExtensionMessage(expectedType, requestId, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('扩展响应超时'));
    }, timeout);

    function onMessage(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== 'smartnavora-extension') return;
      if (data.type !== expectedType || data.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(data);
    }

    window.addEventListener('message', onMessage);
  });
}

async function isExtensionAvailable() {
  const requestId = createExtensionRequestId('handshake');
  const pending = waitForExtensionMessage('smartnavora-invalid-link-handshake-result', requestId, 1200);
  window.postMessage({
    source: 'smartnavora-page',
    type: 'smartnavora-invalid-link-handshake',
    requestId
  }, '*');

  try {
    const result = await pending;
    return result.available === true;
  } catch {
    return false;
  }
}

async function refreshExtensionAvailability() {
  extensionAvailable.value = await isExtensionAvailable();
  if (extensionAvailable.value) {
    showExtensionGuide.value = false;
  }
}

async function collectDetectionResultsViaExtension(cards, progressPrefix = '正在检测') {
  const mergedSafe = [];
  const mergedMaybe = [];
  const mergedSkipped = [];
  const batchSize = 24;
  let processed = 0;

  detectProgressText.value = `${progressPrefix}，正在调用扩展检测...`;
  detectProgressPercent.value = 0;

  const available = await isExtensionAvailable();
  if (!available) {
    throw new Error('未检测到浏览器扩展，请安装并启用 SmartNavora 扩展后再进行失效链接检测');
  }

  for (let start = 0; start < cards.length; start += batchSize) {
    const batch = cards.slice(start, start + batchSize);
    const requestId = createExtensionRequestId('scan');
    const pending = waitForExtensionMessage('smartnavora-invalid-link-scan-result', requestId, 10 * 60 * 1000);

    detectProgressText.value = `${progressPrefix} ${start + 1}-${Math.min(start + batch.length, cards.length)}/${cards.length}...`;

    window.postMessage({
      source: 'smartnavora-page',
      type: 'smartnavora-invalid-link-scan-request',
      requestId,
      concurrency: 8,
      cards: batch
    }, '*');

    const result = await pending;
    if (!result.response?.success) {
      throw new Error(result.response?.error || '扩展检测失败');
    }

    mergedSafe.push(...(result.response.safeToDelete || []));
    mergedMaybe.push(...(result.response.maybeInvalid || []));
    mergedSkipped.push(...(result.response.skipped || []));
    processed += batch.length;
    detectProgressPercent.value = Math.min(Math.round((processed / cards.length) * 100), 100);
  }

  return {
    scannedAt: new Date().toISOString(),
    total: cards.length,
    safeToDelete: mergedSafe,
    maybeInvalid: mergedMaybe,
    skipped: mergedSkipped
  };
}

function toggleSelectAll(group) {
  if (group === 'safe') {
    selectedSafeIds.value = allSafeSelected.value ? [] : safeToDelete.value.map(item => item.id);
    return;
  }
  if (group === 'cloudflare') {
    selectedCloudflareIds.value = allCloudflareSelected.value ? [] : cloudflareProtected.value.map(item => item.id);
    return;
  }
  if (group === 'unreachable') {
    selectedUnreachableIds.value = allUnreachableSelected.value ? [] : unreachableItems.value.map(item => item.id);
    return;
  }
  selectedManualIds.value = allManualSelected.value ? [] : manualReviewItems.value.map(item => item.id);
}

function resetSelections() {
  selectedSafeIds.value = [];
  selectedCloudflareIds.value = [];
  selectedUnreachableIds.value = [];
  selectedManualIds.value = [];
}

function classifyMaybeInvalid(items = []) {
  return {
    cloudflare: items.filter(item => item.subtype === 'cloudflare'),
    unreachable: items.filter(item => item.subtype === 'unreachable'),
    manualReview: items.filter(item => item.subtype === 'manual_review' || !item.subtype)
  };
}

function refreshSummary(total = summary.value?.total || 0, skippedCount = skipped.value.length) {
  summary.value = {
    total,
    valid: Math.max(total - safeToDelete.value.length - cloudflareProtected.value.length - unreachableItems.value.length - manualReviewItems.value.length - skippedCount, 0),
    safeToDelete: safeToDelete.value.length,
    cloudflare: cloudflareProtected.value.length,
    unreachable: unreachableItems.value.length,
    manualReview: manualReviewItems.value.length,
    skipped: skippedCount
  };
}

function applyDetectionSnapshot(data) {
  scannedAt.value = data.scannedAt || '';
  safeToDelete.value = data.safeToDelete || [];
  const classified = classifyMaybeInvalid(data.maybeInvalid || []);
  cloudflareProtected.value = classified.cloudflare;
  unreachableItems.value = classified.unreachable;
  manualReviewItems.value = classified.manualReview;
  skipped.value = data.skipped || [];
  refreshSummary(data.total || 0, skipped.value.length);
  resetSelections();
  detected.value = true;
}

async function collectDetectionResults(cards, progressPrefix = '正在检测') {
  return await collectDetectionResultsViaExtension(cards, progressPrefix);
}

function removeDetectedItemsLocally(cardIds) {
  safeToDelete.value = safeToDelete.value.filter(item => !cardIds.includes(item.id));
  cloudflareProtected.value = cloudflareProtected.value.filter(item => !cardIds.includes(item.id));
  unreachableItems.value = unreachableItems.value.filter(item => !cardIds.includes(item.id));
  manualReviewItems.value = manualReviewItems.value.filter(item => !cardIds.includes(item.id));
  skipped.value = skipped.value.filter(item => !cardIds.includes(item.id));
  selectedSafeIds.value = selectedSafeIds.value.filter(id => !cardIds.includes(id));
  selectedCloudflareIds.value = selectedCloudflareIds.value.filter(id => !cardIds.includes(id));
  selectedUnreachableIds.value = selectedUnreachableIds.value.filter(id => !cardIds.includes(id));
  selectedManualIds.value = selectedManualIds.value.filter(id => !cardIds.includes(id));
  refreshSummary();
}

function mergeRecheckResults(data, checkedIds) {
  const recheckedItems = [...(data.safeToDelete || []), ...(data.maybeInvalid || [])];
  const validIds = new Set((checkedIds || []).filter(id => !recheckedItems.some(item => item.id === id)));

  safeToDelete.value = [
    ...safeToDelete.value.filter(item => !checkedIds.includes(item.id)),
    ...(data.safeToDelete || [])
  ].sort((a, b) => b.id - a.id);

  const existingMaybe = [
    ...cloudflareProtected.value,
    ...unreachableItems.value,
    ...manualReviewItems.value
  ].filter(item => !checkedIds.includes(item.id));
  const combinedMaybe = classifyMaybeInvalid([...existingMaybe, ...(data.maybeInvalid || [])]);
  cloudflareProtected.value = combinedMaybe.cloudflare.sort((a, b) => b.id - a.id);
  unreachableItems.value = combinedMaybe.unreachable.sort((a, b) => b.id - a.id);
  manualReviewItems.value = combinedMaybe.manualReview.sort((a, b) => b.id - a.id);

  if (validIds.size > 0) {
    errorMsg.value = `已重新检测 ${checkedIds.length} 项，其中 ${validIds.size} 项恢复正常，已从结果中移除。`;
  } else {
    errorMsg.value = `已重新检测 ${checkedIds.length} 项。`;
  }

  refreshSummary();

  selectedSafeIds.value = selectedSafeIds.value.filter(id => !checkedIds.includes(id));
  selectedCloudflareIds.value = selectedCloudflareIds.value.filter(id => !checkedIds.includes(id));
  selectedUnreachableIds.value = selectedUnreachableIds.value.filter(id => !checkedIds.includes(id));
  selectedManualIds.value = selectedManualIds.value.filter(id => !checkedIds.includes(id));
}

async function handleDetectInvalidLinks() {
  detecting.value = true;
  errorMsg.value = '';
  detectProgressText.value = '正在获取卡片列表...';
  detectProgressPercent.value = 0;
  try {
    await refreshExtensionAvailability();
    if (!extensionAvailable.value) {
      showExtensionGuide.value = true;
      return;
    }

    const cardsRes = await getAllCards(true);
    const allCards = Object.values(cardsRes.data?.cardsByCategory || {}).flat().filter(Boolean);

    if (allCards.length === 0) {
      applyDetectionSnapshot({ scannedAt: new Date().toISOString(), total: 0, safeToDelete: [], maybeInvalid: [], skipped: [] });
      return;
    }

    applyDetectionSnapshot(await collectDetectionResults(allCards, '正在检测'));
  } catch (error) {
    errorMsg.value = error.response?.data?.error || error.message || '检测失效链接失败';
  } finally {
    detectProgressText.value = '';
    detectProgressPercent.value = 0;
    detecting.value = false;
  }
}

async function removeCards(cardIds, confirmMessage) {
  if (!Array.isArray(cardIds) || cardIds.length === 0) return;
  if (!confirm(confirmMessage)) return;

  removing.value = true;
  errorMsg.value = '';
  try {
    await removeManyCards(cardIds);
    removeDetectedItemsLocally(cardIds);
  } catch (error) {
    errorMsg.value = error.response?.data?.error || '删除卡片失败';
  } finally {
    removing.value = false;
  }
}

async function recheckSelected(group) {
  const source = group === 'safe'
    ? safeToDelete.value
    : group === 'cloudflare'
      ? cloudflareProtected.value
      : group === 'unreachable'
        ? unreachableItems.value
        : manualReviewItems.value;
  const selectedIds = group === 'safe'
    ? [...selectedSafeIds.value]
    : group === 'cloudflare'
      ? [...selectedCloudflareIds.value]
      : group === 'unreachable'
        ? [...selectedUnreachableIds.value]
        : [...selectedManualIds.value];
  if (selectedIds.length === 0) return;

  detecting.value = true;
  errorMsg.value = '';
  detectProgressPercent.value = 0;
  try {
    await refreshExtensionAvailability();
    if (!extensionAvailable.value) {
      showExtensionGuide.value = true;
      return;
    }

    const cardsToRecheck = source.filter(item => selectedIds.includes(item.id));
    const data = await collectDetectionResults(cardsToRecheck, '正在复检');
    mergeRecheckResults(data, selectedIds);
  } catch (error) {
    errorMsg.value = error.response?.data?.error || error.message || '重新检测失败';
  } finally {
    detectProgressText.value = '';
    detectProgressPercent.value = 0;
    detecting.value = false;
  }
}

async function removeSelected(group) {
  const ids = group === 'safe'
    ? selectedSafeIds.value
    : group === 'cloudflare'
      ? selectedCloudflareIds.value
      : group === 'unreachable'
        ? selectedUnreachableIds.value
        : selectedManualIds.value;
  const message = `确定要删除选中的 ${ids.length} 张卡片吗？此操作不可撤销。`;
  await removeCards(ids, message);
}

async function removeAllSafeToDelete() {
  const ids = safeToDelete.value.map(item => item.id);
  await removeCards(ids, `确定要一键删除全部 ${ids.length} 张“确定失效”卡片吗？此操作不可撤销。`);
}

async function removeAllUnreachableItems() {
  const ids = unreachableItems.value.map(item => item.id);
  await removeCards(ids, `确定要一键删除全部 ${ids.length} 张“真正无法连接”卡片吗？此操作不可撤销。`);
}

onMounted(() => {
  refreshExtensionAvailability();
});
</script>

<style scoped>
.invalid-link-manage {
  padding: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.top-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.page-desc {
  color: #6b7280;
  margin-top: 6px;
}

.extension-status-inline {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
}

.extension-status-inline.is-ready {
  background: #ecfdf5;
  color: #166534;
}

.extension-status-inline.is-missing {
  background: #fff7ed;
  color: #9a3412;
}

.extension-status-inline .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.extension-status-inline.is-ready .status-dot {
  background: #16a34a;
  box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.12);
}

.extension-status-inline.is-missing .status-dot {
  background: #f97316;
  box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.12);
}

.extension-guide-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 18px;
}

.extension-guide-banner p {
  margin: 6px 0 0;
  color: #9a3412;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
  margin-bottom: 12px;
}

.summary-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.06);
}

.summary-card.success {
  border-left: 4px solid #16a34a;
}

.summary-card.danger {
  border-left: 4px solid #dc2626;
}

.summary-card.warning {
  border-left: 4px solid #d97706;
}

.summary-card.muted {
  border-left: 4px solid #6b7280;
}

.summary-label {
  color: #6b7280;
  font-size: 13px;
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  margin-top: 6px;
}

.scan-meta {
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 18px;
}

.progress-card {
  background: #fff;
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 18px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.06);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  color: #374151;
  font-size: 14px;
}

.progress-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #2563eb 0%, #06b6d4 100%);
  transition: width 0.25s ease;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.guide-modal {
  width: min(560px, calc(100vw - 24px));
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}

.guide-modal-header,
.guide-modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
}

.guide-modal-header {
  border-bottom: 1px solid #e5e7eb;
}

.guide-modal-header h4 {
  margin: 0;
}

.guide-close {
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
}

.guide-modal-body {
  padding: 18px;
  color: #374151;
}

.guide-steps {
  margin: 12px 0;
  padding-left: 20px;
}

.guide-steps li {
  margin-bottom: 8px;
}

.guide-tip {
  color: #6b7280;
  font-size: 13px;
  margin-top: 12px;
}

.guide-modal-actions {
  border-top: 1px solid #e5e7eb;
  justify-content: flex-end;
}

.result-section {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.06);
  margin-bottom: 18px;
}

.danger-section {
  border-top: 4px solid #dc2626;
}

.warning-section {
  border-top: 4px solid #d97706;
}

.result-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.result-header h4 {
  margin: 0 0 6px;
}

.result-header p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 14px;
  align-items: start;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
}

.result-item.danger {
  background: #fef2f2;
}

.result-item.warning {
  background: #fffbeb;
}

.checkbox-wrap {
  padding-top: 3px;
}

.result-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.reason {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
}

.reason.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.reason.warning {
  background: #fde68a;
  color: #92400e;
}

.result-url {
  color: #2563eb;
  word-break: break-all;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  color: #6b7280;
  font-size: 13px;
}

.result-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn,
.link-btn,
.delete-btn {
  border: none;
  border-radius: 8px;
  padding: 9px 12px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background: #2563eb;
  color: #fff;
}

.btn-secondary {
  background: #eef2ff;
  color: #374151;
}

.btn-danger,
.delete-btn {
  background: #dc2626;
  color: #fff;
}

.btn-warning,
.delete-btn.warning {
  background: #d97706;
  color: #fff;
}

.link-btn {
  background: #eff6ff;
  color: #2563eb;
}

.btn:disabled,
.delete-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.empty-state,
.skipped-box {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.06);
  margin-bottom: 18px;
}

.success-state {
  border-top: 4px solid #16a34a;
}

.initial-state {
  border-top: 4px solid #9ca3af;
}

.skipped-box {
  text-align: left;
  border-left: 4px solid #6b7280;
  color: #4b5563;
}

.error-msg {
  color: #dc2626;
  margin-top: 12px;
}

@media (max-width: 900px) {
  .section-header,
  .result-header {
    flex-direction: column;
  }

  .result-item {
    grid-template-columns: 24px 1fr;
  }

  .result-actions {
    grid-column: 2;
  }
}
</style>
