/**
 * 网页元数据抓取模块
 * 轻量级提取网页 <head> 中的结构化元数据，用于增强 AI 生成质量
 * 设计原则：失败静默降级，不影响主流程
 */
const axios = require('axios');
const cheerio = require('cheerio');

// 抓取配置
const FETCH_TIMEOUT = 2000;       // 超时 2 秒
const MAX_BODY_SIZE = 100 * 1024; // 最多下载 100KB（<head> 通常在前 10-20KB）
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 抓取网页元数据
 * @param {string} url 目标网址
 * @returns {Promise<Object|null>} 元数据对象，失败返回 null
 */
async function fetchMetadata(url) {
  if (!url) return null;

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
        // 优化：只取到 </head> 之前的内容（节省内存）
        const headEnd = data.indexOf('</head>');
        if (headEnd > 0) {
          return data.substring(0, headEnd + 7);
        }
        // 没有 </head>，取前 30KB
        return data.substring(0, 30000);
      }]
    });

    if (!response.data || typeof response.data !== 'string') {
      return null;
    }

    return parseMetadata(response.data, url);
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
    canonical: ''
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

  // 8. 清理所有字段：去除多余空白和换行
  for (const key of Object.keys(metadata)) {
    metadata[key] = metadata[key]
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 9. 检查是否有有效数据（至少有一个非空字段）
  const hasData = Object.values(metadata).some(v => v.length > 0);
  return hasData ? metadata : null;
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

  return {
    // 最佳标题（优先级：og:title > site_name > title）
    bestTitle: metadata.ogTitle || metadata.ogSiteName || metadata.siteName || metadata.title || '',
    // 最佳描述（优先级：og:description > twitter:description > meta description）
    bestDescription: metadata.ogDescription || metadata.twitterDescription || metadata.description || '',
    // 站点名称
    siteName: metadata.ogSiteName || metadata.siteName || '',
    // 页面类型（og:type）
    pageType: metadata.ogType || '',
    // 关键词
    keywords: metadata.keywords || '',
    // 语言
    lang: metadata.lang || ''
  };
}

module.exports = { fetchMetadata, extractKeyInfo };
