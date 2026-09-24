/**
 * 网页元数据抓取模块
 * 轻量级提取网页 <head> 中的结构化元数据，用于增强 AI 生成质量
 * 设计原则：失败静默降级，不影响主流程
 */
const axios = require('axios');
const cheerio = require('cheerio');

// 抓取配置
const FETCH_TIMEOUT = 4000;       // 超时 4 秒（Discourse 等重型站点需要更长时间）
const MAX_BODY_SIZE = 500 * 1024; // 最多下载 500KB（Discourse 等 SPA 框架 <head> 可达 200KB+）
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 简单内存缓存：URL → 成功抓取的元数据（仅缓存成功结果，失败不缓存以便重试）
const metadataCache = new Map();
const METADATA_CACHE_MAX = 300;

/**
 * 抓取网页元数据
 * @param {string} url 目标网址
 * @returns {Promise<Object|null>} 元数据对象，失败返回 null
 */
async function fetchMetadata(url) {
  if (!url) return null;
  if (metadataCache.has(url)) return metadataCache.get(url);

  try {
    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT,
      maxContentLength: MAX_BODY_SIZE,
      maxRedirects: 3,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      responseType: 'text',
      // 只下载 <head> 区域即可，但 axios 不支持按标签截断
      // 通过 maxContentLength 限制总下载量
      transformResponse: [(data) => {
        // 如果返回的不是 HTML，直接丢弃
        if (typeof data !== 'string') return null;
        // 优化：取到 </head> 后额外保留 10KB body 内容（用于提取可见品牌名）
        const headEnd = data.indexOf('</head>');
        if (headEnd > 0) {
          const bodyBudget = Math.min(10000, data.length - headEnd - 7);
          return data.substring(0, headEnd + 7 + bodyBudget);
        }
        // 没有 </head>，取前 40KB（覆盖 head + 部分 body）
        return data.substring(0, 40000);
      }]
    });

    if (!response.data || typeof response.data !== 'string') {
      return null;
    }

    const meta = parseMetadata(response.data, url);
    if (meta) {
      if (metadataCache.size >= METADATA_CACHE_MAX) metadataCache.clear();
      metadataCache.set(url, meta);
    }
    return meta;
  } catch (error) {
    // 所有错误静默处理，返回 null
    return null;
  }
}

/**
 * 从 HTML 中解析元数据
 * @param {string} html HTML 字符串（至少包含 <head>）
 * @param {string} sourceUrl 来源 URL（用于日志）
 * @returns {Object} 解析后的元数据
 */
function parseMetadata(html, sourceUrl) {
  const $ = cheerio.load(html, { xmlMode: false });

  const metadata = {
    title: '',
    description: '',
    ogTitle: '',
    ogDescription: '',
    ogSiteName: '',
    ogType: '',
    ogImage: '',
    twitterTitle: '',
    twitterDescription: '',
    siteName: '',
    keywords: '',
    lang: '',
    canonical: '',
    jsonLdType: '',
    jsonLdBrandName: '',
    jsonLdPageTitle: '',
    jsonLdDescription: '',
    jsonLdSiteName: ''
  };

  // 1. <title>
  metadata.title = $('title').first().text().trim();

  // 2. <meta name="description">
  metadata.description = getMetaContent($, 'name', 'description');

  // 3. Open Graph 标签
  metadata.ogTitle = getMetaContent($, 'property', 'og:title');
  metadata.ogDescription = getMetaContent($, 'property', 'og:description');
  metadata.ogSiteName = getMetaContent($, 'property', 'og:site_name');
  metadata.ogType = getMetaContent($, 'property', 'og:type');
  metadata.ogImage = getMetaContent($, 'property', 'og:image');

  // 4. Twitter Card 标签
  metadata.twitterTitle = getMetaContent($, 'name', 'twitter:title');
  metadata.twitterDescription = getMetaContent($, 'name', 'twitter:description');

  // 5. 其他 meta 信息
  metadata.siteName = getMetaContent($, 'name', 'site_name') || 
                      getMetaContent($, 'name', 'application-name');
  metadata.keywords = getMetaContent($, 'name', 'keywords');

  // 6. <html lang="...">
  metadata.lang = $('html').attr('lang') || '';

  // 7. <link rel="canonical">
  metadata.canonical = $('link[rel="canonical"]').attr('href') || '';

  // 8. 拆分 HTML <title> 为页面标题部分和站点名称部分
  // 常见格式："页面标题 - 站点名"、"页面标题 | 站点名"、"页面标题 · 站点名"
  metadata.titlePagePart = '';
  metadata.titleBrandPart = '';
  if (metadata.title) {
    const splitResult = splitHtmlTitle(metadata.title);
    metadata.titlePagePart = splitResult.pagePart;
    metadata.titleBrandPart = splitResult.brandPart;
  }

  // 9. 从页面可见内容提取品牌名（h1、logo 文字等），作为补充来源
  metadata.visibleBrand = extractVisibleBrand($);

  // 9.5 解析 JSON-LD 结构化数据：大量中小站/Shopify/WordPress 携带，
  //     提供比路径更可信的品牌名、描述与 @type 分类，是静态抓取此前缺失的关键信息源
  const jsonLd = extractJsonLd($);
  metadata.jsonLdType = jsonLd.type;
  metadata.jsonLdBrandName = jsonLd.brandName;
  metadata.jsonLdPageTitle = jsonLd.pageTitle;
  metadata.jsonLdDescription = jsonLd.description;
  metadata.jsonLdSiteName = jsonLd.siteName;

  // 10. 清理所有字段：去除多余空白和换行
  for (const key of Object.keys(metadata)) {
    metadata[key] = metadata[key]
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 11. 检查是否有有效数据（至少有一个非空字段）
  const hasData = Object.values(metadata).some(v => v.length > 0);
  return hasData ? metadata : null;
}

/**
 * 解析页面内嵌的 JSON-LD 结构化数据
 * 兼容单个对象、对象数组、以及含 @graph 数组的包装结构。
 * 按 @type 区分"品牌类"与"内容类"，提取品牌名、页面标题、描述、站点名与类型。
 * 大量 Shopify/WordPress 及中小站点携带 JSON-LD，是静态抓取的重要信息来源。
 * @param {CheerioStatic} $ cheerio 实例
 * @returns {{type:string,brandName:string,pageTitle:string,description:string,siteName:string}}
 */
function extractJsonLd($) {
  const result = { type: '', brandName: '', pageTitle: '', description: '', siteName: '' };

  // 品牌/机构类 @type：其 name 是品牌名
  const brandTypes = new Set(['Website', 'WebSite', 'Organization', 'Corporation', 'LocalBusiness', 'SoftwareApplication', 'Brand']);
  // 内容类 @type：其 headline/name 是页面标题
  const contentTypes = new Set(['Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'Report', 'VideoObject']);

  const scripts = $('script[type="application/ld+json"]');
  scripts.each((i, el) => {
    let data;
    try {
      data = JSON.parse($(el).text());
    } catch (e) {
      return; // 单段 JSON-LD 解析失败，静默跳过
    }

    // 兼容数组与 @graph 包装：优先取第一个带 @type 的实体
    if (Array.isArray(data)) data = data[0];
    if (data && Array.isArray(data['@graph'])) {
      data = data['@graph'].find(d => d && d['@type']) || data['@graph'][0];
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;

    const t = (data['@type'] || '').toString();
    if (t && !result.type) result.type = t;

    if (!result.description && data.description) result.description = String(data.description);
    if (!result.siteName && data.publisher && data.publisher.name) result.siteName = String(data.publisher.name);

    const name = data.name || data.alternateName;
    if (brandTypes.has(t)) {
      if (name && !result.brandName) result.brandName = String(name);
    } else if (contentTypes.has(t)) {
      const headline = data.headline || name;
      if (headline && !result.pageTitle) result.pageTitle = String(headline);
    }
  });

  return result;
}

/**
 * 拆分 HTML <title> 为页面部分和品牌部分
 * 常见格式："页面标题 - 站点名"、"页面标题 | 站点名"、"站点名: 页面标题"
 * @param {string} title HTML title 标签内容
 * @returns {{ pagePart: string, brandPart: string }}
 */
// 明显不应作为"品牌名/卡片标题"的片段：页面分区名、功能词、UI 词。
// 拆分标题与校验 AI 输出时共用，避免把"客户端下载""登录""首页"等误当品牌。
const NON_BRAND_PATTERNS = [
  /^(客户端)?下载$/,
  /^(登录|登陆|注册|登入|登录注册)$/,
  /^(首页|主页|home)$/i,
  /^(sign\s*(in|up|out)|log\s*in|logout|login|register)$/i,
  /^(搜索|search)$/i,
  /^(导航|菜单|menu|nav|navigation)$/i,
  /^(官方入口|入口|最新入口|镜像|最新镜像)$/,
  /^(关于|about|联系|contact|帮助|help|更多|more|最新|热门|hot)$/,
  /^(文档|docs|博客|blog|论坛|forum|社区|community)$/i
];

function isNonBrandSegment(text) {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  return NON_BRAND_PATTERNS.some(re => re.test(t));
}

function splitHtmlTitle(title) {
  if (!title) return { pagePart: '', brandPart: '' };

  // 按优先级尝试不同分隔符
  const separators = [' | ', ' – ', ' — ', ' · ', ' - ', ' – ', ' — '];
  let parts = null;

  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx > 0) {
      parts = [title.substring(0, idx).trim(), title.substring(idx + sep.length).trim()];
      break;
    }
  }

  // 尝试冒号分隔（如 "GitHub: Let's build from here"）
  if (!parts) {
    const colonIdx = title.indexOf(': ');
    if (colonIdx > 0 && colonIdx < 30) {
      parts = [title.substring(0, colonIdx).trim(), title.substring(colonIdx + 2).trim()];
    }
  }

  if (!parts || parts.length < 2) {
    return { pagePart: title, brandPart: '' };
  }

  const [left, right] = parts;

  // 判断哪部分是品牌名：通常品牌名更短，且出现在末尾
  // 例："Introduction | Vue.js" → pagePart="Introduction", brandPart="Vue.js"
  // 例："GitHub: Let's build" → pagePart="Let's build", brandPart="GitHub"
  // 但"短的是品牌"会误判 "... | 客户端下载"→把"客户端下载"当品牌，故先排除非品牌词
  if (right.length <= left.length) {
    if (isNonBrandSegment(right)) {
      // 右侧是非品牌词(如"客户端下载")，不能当品牌；留空交上层用 og:site_name/域名兜底
      return { pagePart: left, brandPart: '' };
    }
    return { pagePart: left, brandPart: right };
  } else {
    if (isNonBrandSegment(left)) {
      return { pagePart: right, brandPart: '' };
    }
    return { pagePart: right, brandPart: left };
  }
}

/**
 * 从页面可见内容中提取品牌名（h1、logo 文字等）
 * 作为 og:site_name / title 拆分的补充来源
 * @param {CheerioStatic} $ cheerio 实例
 * @returns {string} 提取到的品牌名，未找到返回空字符串
 */
function extractVisibleBrand($) {
  // 通用过滤：排除明显不是品牌名的文本
  const NOISE = /^\s*$/;
  const SKIP_TEXT = /^(home|首页|主页|skip\s*to|menu|nav|search|登录|注册|sign\s*(in|up)|log\s*in)$/i;

  function isClean(text) {
    if (!text) return false;
    const t = text.trim();
    return t.length >= 1 && t.length <= 40 && !NOISE.test(t) && !SKIP_TEXT.test(t);
  }

  // 1. 第一个 <h1>（最常见的站点/品牌标识）
  const h1 = $('h1').first();
  if (h1.length) {
    const text = h1.clone().children('script,style').remove().end().text().trim();
    if (isClean(text)) return text;
  }

  // 2. 常见品牌/Logo 相关的 CSS 选择器（只取文本内容最短且合理的那个）
  const brandSelectors = [
    '.site-name', '.site-title', '.brand', '.logo-text',
    '.navbar-brand', '#site-title', '.blog-title',
    '[class*="site-name"]', '[class*="logo-text"]'
  ];
  let bestCandidate = '';
  for (const sel of brandSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const text = el.clone().children('script,style').remove().end().text().trim();
      if (isClean(text) && (!bestCandidate || text.length <= bestCandidate.length)) {
        bestCandidate = text;
      }
    }
  }
  if (bestCandidate) return bestCandidate;

  // 3. Logo 图片的 alt 文字
  const logoImg = $('img[class*="logo" i], img[src*="logo" i], img[alt*="logo" i]').first();
  if (logoImg.length) {
    const alt = logoImg.attr('alt');
    if (isClean(alt)) return alt.trim();
  }

  return '';
}

/**
 * 获取 meta 标签的 content 属性
 */
function getMetaContent($, attrName, attrValue) {
  // 尝试多种匹配方式（不同网站写法不一）
  const selectors = [
    `meta[${attrName}="${attrValue}"]`,
    `meta[${attrName}="${attrValue.toLowerCase()}"]`,
  ];

  for (const selector of selectors) {
    const content = $(selector).attr('content');
    if (content && content.trim()) {
      return content.trim();
    }
  }
  return '';
}

/**
 * 从元数据中提取最有价值的信息（供提示词使用）
 * @param {Object|null} metadata 元数据对象
 * @returns {Object} 精简后的信息
 */
function extractKeyInfo(metadata) {
  if (!metadata) return null;

  // 品牌名优先级：og:site_name > JSON-LD 品牌名 > 页面可见品牌(h1/logo) > title拆分品牌 > meta site_name
  const brandName = metadata.ogSiteName || metadata.jsonLdBrandName || metadata.visibleBrand || metadata.titleBrandPart || metadata.siteName || '';

  // 页面标题：优先 og:title（先拆分去掉末尾站点名冗余），其次 twitter:title，再 JSON-LD 标题，最后拆分后 title
  const ogTitlePagePart = metadata.ogTitle ? splitHtmlTitle(metadata.ogTitle).pagePart : '';
  const pageTitle = ogTitlePagePart || metadata.twitterTitle || metadata.jsonLdPageTitle || metadata.titlePagePart || metadata.title || '';

  return {
    // 品牌名（用于卡片命名时的品牌识别）
    brandName: brandName,
    // 页面标题（完整的页面级标题）
    pageTitle: pageTitle,
    // 最佳描述（优先级：og:description > twitter:description > JSON-LD > meta description）
    bestDescription: metadata.ogDescription || metadata.twitterDescription || metadata.jsonLdDescription || metadata.description || '',
    // 站点名称
    siteName: metadata.ogSiteName || metadata.jsonLdSiteName || metadata.siteName || '',
    // 页面类型（og:type 优先，JSON-LD @type 兜底）
    pageType: metadata.ogType || metadata.jsonLdType || '',
    // 关键词
    keywords: metadata.keywords || '',
    // 语言
    lang: metadata.lang || ''
  };
}

module.exports = { fetchMetadata, extractKeyInfo, isNonBrandSegment };
