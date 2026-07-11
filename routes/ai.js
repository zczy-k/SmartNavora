/**
 * AI 功能路由
 * 提供 AI 配置管理、批量生成任务等功能
 * 支持自适应并发处理策略
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const db = require('../db');
const { AI_PROVIDERS, callAI, probeBaseUrl } = require('../utils/aiProvider');
const { encrypt, decrypt } = require('../utils/crypto');
const { fetchMetadata, extractKeyInfo } = require('../utils/metadataFetcher');
const EventEmitter = require('events');

// ==================== 统一字段生成服务 ====================

/**
 * 核心生成函数：处理单个卡片的指定字段
 * @param {Object} config AI 配置
 * @param {Object} card 卡片对象
 * @param {Array} types 需要生成的字段类型 ['name', 'description']
 * @param {Object} strategy 生成策略 { mode: 'fill'|'overwrite', style: 'default'|..., customPrompt: '' }
 * @returns {Promise<Object>} 处理结果 { updated: boolean, data: Object, error?: string }
 */
async function generateCardFields(config, card, types, strategy = {}) {
  let updated = false;
  const isFillMode = strategy.mode !== 'overwrite';
  const resultData = { name: null, description: null };
  const unchanged = {}; // 记录哪些字段生成成功但与原值相同
  const fieldErrors = []; // 记录各字段的错误

  // 1. 过滤出真正需要生成的字段
  const neededTypes = types.filter(type => {
    if (type === 'name') {
      return !(isFillMode && !checkIsDirtyName(card.title, card.url));
    }
    if (type === 'description') {
      return !(isFillMode && !checkIsDirtyDesc(card.desc, card.title, card.url));
    }
    return true;
  });

  if (neededTypes.length === 0) return { updated: false, data: resultData };

  // 抓取网页元数据（失败静默降级为 null，不影响主流程）
  let metadata = null;
  try {
    metadata = await fetchMetadata(card.url);
  } catch (e) {
    // 静默失败
  }

  // 2. 尝试使用统一 Prompt 处理多字段（效率更高）
  if (neededTypes.length > 1) {
    try {
      const prompt = buildPromptWithStrategy(buildUnifiedPrompt(card, neededTypes, metadata), strategy);
      const aiResponse = await callAI(config, prompt);
      const parsed = parseUnifiedResponse(aiResponse, neededTypes);

      if (parsed.name && parsed.name !== card.title) {
        await db.updateCardName(card.id, parsed.name);
        resultData.name = parsed.name;
        card.title = parsed.name;
        updated = true;
      }
      if (parsed.description && parsed.description !== card.desc) {
        await db.updateCardDescription(card.id, parsed.description);
        resultData.description = parsed.description;
        card.desc = parsed.description;
        updated = true;
      }
      return { updated, data: resultData };
    } catch (e) {
      console.warn(`Unified prompt failed for card ${card.id}, falling back to individual calls:`, e.message);
    }
  }

  // 3. 逐个字段处理（降级逻辑或单字段请求）
  for (const type of neededTypes) {
    try {
      let prompt, aiResponse, cleaned;
      if (type === 'name') {
        prompt = buildPromptWithStrategy(buildNamePrompt(card, metadata), strategy);
        aiResponse = await callAI(config, prompt);
        cleaned = cleanName(aiResponse);
        if (!cleaned) {
          throw new Error('AI 返回内容无效（可能是思考过程文本）');
        }
        if (cleaned !== card.title) {
            await db.updateCardName(card.id, cleaned);
            resultData.name = cleaned;
            card.title = cleaned;
            updated = true;
          } else {
            unchanged.name = true;
            resultData.name = cleaned;
          }
        } else if (type === 'description') {
        prompt = buildPromptWithStrategy(buildDescriptionPrompt(card, metadata), strategy);
        aiResponse = await callAI(config, prompt);
        cleaned = cleanDescription(aiResponse);
        if (!cleaned) {
          throw new Error('AI 返回内容无效（可能是思考过程文本）');
        }
        if (cleaned !== card.desc) {
            await db.updateCardDescription(card.id, cleaned);
            resultData.description = cleaned;
            card.desc = cleaned;
            updated = true;
          } else {
            unchanged.description = true;
            resultData.description = cleaned;
          }
        }
    } catch (e) {
      console.error(`Failed to generate field ${type} for card ${card.id}:`, e.message);
      fieldErrors.push({ field: type, error: e.message });
      // 单字段请求时直接抛出错误
      if (neededTypes.length === 1) throw e;
    }
  }

  // 如果有部分字段失败，抛出包含详细信息的错误
  if (fieldErrors.length > 0 && !updated && Object.keys(unchanged).length === 0) {
    // 全部失败
    throw new Error(fieldErrors.map(e => `${e.field}: ${e.error}`).join('; '));
  }
  
  // 部分成功：返回结果，但附带警告信息
  if (fieldErrors.length > 0 && (updated || Object.keys(unchanged).length > 0)) {
    return { 
      updated, 
      data: resultData,
      unchanged: Object.keys(unchanged).length > 0 ? unchanged : undefined,
      partialError: fieldErrors.map(e => `${e.field}失败`).join(', ')
    };
  }

  return { updated, data: resultData, unchanged: Object.keys(unchanged).length > 0 ? unchanged : undefined };
}

// ==================== 自适应并发批量任务管理器 ====================
class BatchTaskManager extends EventEmitter {
  constructor() {
    super();
    this.task = null;
    this.abortController = null;
    // 并发控制参数
    this.minConcurrency = 1;
    this.maxConcurrency = 5;
    this.initialConcurrency = 3;
    // 限流重试配置
    this.maxAutoRetries = 3;
    this.rateLimitBaseDelay = 5000;
  }

  // 获取任务状态
  getStatus() {
    if (!this.task) {
      return { running: false };
    }
    return {
      running: this.task.running,
      types: this.task.types,
      current: this.task.current,
      total: this.task.total,
      successCount: this.task.successCount,
      failCount: this.task.failCount,
      currentCard: this.task.currentCard,
      startTime: this.task.startTime,
      concurrency: this.task.concurrency,
      isRateLimited: this.task.isRateLimited,
      retryQueueSize: this.task.retryQueue?.length || 0,
      autoRetryRound: this.task.autoRetryRound || 0,
      errors: this.task.errors.slice(-100)
    };
  }

  // 检查是否正在运行
  isRunning() {
    return this.task && this.task.running;
  }

  // 发送更新事件
  emitUpdate() {
    this.emit('update', this.getStatus());
  }

  // 启动任务
  async start(config, cards, types, strategy = {}) {
    if (this.isRunning()) {
      throw new Error('已有任务在运行中');
    }

    this.abortController = new AbortController();
    this.task = {
      running: true,
      types: Array.isArray(types) ? types : [types],
      strategy,
      current: 0,
      total: cards.length,
      successCount: 0,
      failCount: 0,
      currentCard: '准备启动...',
      startTime: Date.now(),
      errors: [],
      // 自适应并发状态
      concurrency: this.initialConcurrency,
      isRateLimited: false,
      consecutiveSuccesses: 0,
      rateLimitCount: 0,
      // 自动重试队列
      retryQueue: [],
      autoRetryRound: 0,
      processedCardIds: new Set()
    };

    this.emitUpdate();

    // 异步执行任务
    this.runTask(config, cards).catch(err => {
      console.error('Batch task error:', err);
      if (this.task) {
        this.task.running = false;
        this.task.errors.push({
          cardId: 0,
          cardTitle: '系统任务',
          error: err.message || '任务异常中断',
          time: Date.now()
        });
        this.emitUpdate();
      }
    });

    return { total: cards.length };
  }

  // 停止任务
  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.task) {
      this.task.running = false;
      this.task.currentCard = '已停止';
      this.emitUpdate();
    }
    return { stopped: true };
  }

  // 执行任务（自适应并发 + 自动重试队列）
  async runTask(config, cards) {
    const { notifyDataChange } = require('../utils/autoBackup');
    const types = this.task?.types || ['name'];
    const strategy = this.task?.strategy || {};
    
    try {
      const rawConfig = await db.getAIConfig();
      const baseDelay = Math.max(500, Math.min(10000, parseInt(rawConfig.requestDelay) || 1500));

      // 第一轮：处理所有卡片
      await this.processBatch(config, cards, types, strategy, baseDelay);

      // 自动重试轮次：处理限流失败的卡片
      while (
        this.task?.retryQueue?.length > 0 && 
        this.task.autoRetryRound < this.maxAutoRetries &&
        this.task?.running &&
        !this.abortController?.signal.aborted
      ) {
        this.task.autoRetryRound++;
        const retryCards = [...this.task.retryQueue];
        this.task.retryQueue = [];
        
        // 重试前增加等待时间（指数退避）
        const retryWaitTime = this.rateLimitBaseDelay * Math.pow(2, this.task.autoRetryRound - 1);
        this.task.currentCard = `⏳ 限流等待中 (${Math.round(retryWaitTime/1000)}秒后重试 ${retryCards.length} 个)...`;
        this.task.isRateLimited = true;
        this.emitUpdate();
        
        await this.sleep(retryWaitTime);
        
        if (!this.task?.running || this.abortController?.signal.aborted) break;
        
        // 重试时降低并发
        this.task.concurrency = Math.max(1, Math.floor(this.task.concurrency / 2));
        this.task.currentCard = `🔄 自动重试第 ${this.task.autoRetryRound} 轮 (${retryCards.length} 个)`;
        this.task.isRateLimited = false;
        this.emitUpdate();
        
        // 从错误列表中移除即将重试的卡片
        const retryCardIds = new Set(retryCards.map(c => c.id));
        this.task.errors = this.task.errors.filter(e => !retryCardIds.has(e.cardId) || e.isWarning);
        // 重试的卡片失败计数减少
        this.task.failCount = Math.max(0, this.task.failCount - retryCards.length);
        
        await this.processBatch(config, retryCards, types, strategy, baseDelay * 2);
      }

    } catch (err) {
      console.error('runTask internal error:', err);
      if (this.task) {
        this.task.errors.push({ cardId: 0, cardTitle: '系统', error: err.message, time: Date.now() });
      }
    } finally {
      // 任务结束
      if (this.task) {
        await new Promise(r => setTimeout(r, 500));
        this.task.running = false;
        this.task.currentCard = '';
        this.emitUpdate();
        
        try {
          notifyDataChange();
        } catch (e) {
          console.warn('Final notifyDataChange failed:', e.message);
        }
      }
    }
  }

  // 处理一批卡片
  async processBatch(config, cards, types, strategy, baseDelay) {
    const { notifyDataChange } = require('../utils/autoBackup');
    let index = 0;
    const totalCards = cards.length;

    while (index < totalCards) {
      if (this.abortController?.signal.aborted || !this.task?.running) {
        break;
      }

      const currentConcurrency = this.task.concurrency;
      const batch = cards.slice(index, index + currentConcurrency);
      
      this.task.currentCard = batch.map(c => c.title || extractDomain(c.url)).join(', ');
      this.emitUpdate();

      const results = await Promise.allSettled(
        batch.map(card => this.processCardWithRetry(config, card, types, strategy))
      );

      let batchSuccess = 0;
      let batchFail = 0;
      let hasRateLimit = false;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const card = batch[i];
        
        // 只有首次处理才增加 current
        if (!this.task.processedCardIds.has(card.id)) {
          this.task.current++;
          this.task.processedCardIds.add(card.id);
        }

        if (result.status === 'fulfilled') {
          if (result.value.success) {
            batchSuccess++;
            this.task.successCount++;
            if (result.value.partialError) {
              this.task.errors.push({
                cardId: card.id,
                cardTitle: card.title || card.url,
                error: `部分成功: ${result.value.partialError}`,
                time: Date.now(),
                isWarning: true
              });
            }
            notifyDataChange();
          } else if (result.value.rateLimited) {
            hasRateLimit = true;
            batchFail++;
            this.task.failCount++;
            // 加入重试队列
            if (!this.task.retryQueue.some(c => c.id === card.id)) {
              this.task.retryQueue.push(card);
            }
            this.task.errors.push({
              cardId: card.id,
              cardTitle: card.title || card.url,
              error: `API 请求受限，已加入自动重试队列 (第${this.task.autoRetryRound + 1}轮)`,
              time: Date.now(),
              isRateLimited: true
            });
          } else {
            batchFail++;
            this.task.failCount++;
            this.task.errors.push({
              cardId: card.id,
              cardTitle: card.title || card.url,
              error: result.value.error || '未知错误',
              time: Date.now()
            });
          }
        } else {
          batchFail++;
          this.task.failCount++;
          this.task.errors.push({
            cardId: card.id,
            cardTitle: card.title || card.url,
            error: result.reason?.message || '未知错误',
            time: Date.now()
          });
        }
      }

      this.adjustConcurrency(batchSuccess, batchFail, hasRateLimit);
      this.emitUpdate();

      index += batch.length;

      if (index < totalCards && this.task?.running) {
        const delay = this.calculateDelay(baseDelay, hasRateLimit);
        await this.sleep(delay);
      }
    }
  }

  // 自适应调整并发数
  adjustConcurrency(successCount, failCount, hasRateLimit) {
    if (!this.task) return;

    if (hasRateLimit) {
      // 触发限流，降低并发
      this.task.rateLimitCount++;
      this.task.consecutiveSuccesses = 0;
      this.task.isRateLimited = true;
      
      // 每次限流降低一半并发，最低为1
      this.task.concurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.task.concurrency / 2)
      );
    } else if (successCount > 0 && failCount === 0) {
      // 全部成功，尝试增加并发
      this.task.consecutiveSuccesses++;
      this.task.isRateLimited = false;
      
      // 连续3批成功后尝试增加并发
      if (this.task.consecutiveSuccesses >= 3 && this.task.concurrency < this.maxConcurrency) {
        this.task.concurrency = Math.min(this.maxConcurrency, this.task.concurrency + 1);
        this.task.consecutiveSuccesses = 0;
      }
    } else {
      // 有失败但非限流，保持当前并发
      this.task.consecutiveSuccesses = 0;
    }
  }

  // 计算延迟时间
  calculateDelay(baseDelay, hasRateLimit) {
    if (!this.task) return baseDelay;

    if (hasRateLimit) {
      // 限流时增加延迟：基础延迟 * (2 ^ 限流次数)，最大30秒
      const multiplier = Math.pow(2, Math.min(this.task.rateLimitCount, 4));
      return Math.min(baseDelay * multiplier, 30000);
    }

    if (this.task.concurrency === 1) {
      // 串行模式，使用基础延迟
      return baseDelay;
    }

    // 并行模式，延迟可以稍短
    return Math.max(200, baseDelay / 2);
  }

  // 带重试的卡片处理
  async processCardWithRetry(config, card, types, strategy = {}, retryCount = 0) {
    const maxRetries = 2;
    
    try {
      const result = await generateCardFields(config, card, types, strategy);
      // 部分成功也算成功，但记录警告
      return { 
        success: true, 
        updated: result.updated, 
        rateLimited: false,
        partialError: result.partialError // 可能为 undefined
      };
    } catch (error) {
      const isRateLimit = this.isRateLimitError(error);
      
      if (isRateLimit && retryCount < maxRetries) {
        // 限流错误，等待后重试
        const retryDelay = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s
        await this.sleep(retryDelay);
        return this.processCardWithRetry(config, card, types, strategy, retryCount + 1);
      }
      
      return { 
        success: false, 
        rateLimited: isRateLimit,
        error: error.message 
      };
    }
  }

  // 检测是否为限流错误
  isRateLimitError(error) {
    if (!error) return false;
    const message = error.message || '';
    const status = error.status || error.statusCode;
    
    // HTTP 429 或包含限流关键词
    return status === 429 || 
           message.includes('429') ||
           message.includes('rate limit') ||
           message.includes('Rate limit') ||
           message.includes('too many requests') ||
           message.includes('Too Many Requests') ||
           message.includes('quota exceeded') ||
           message.includes('请求过于频繁');
  }

  // 延迟函数
  sleep(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

// 全局任务管理器实例
const taskManager = new BatchTaskManager();

// ==================== 辅助函数 ====================

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/**
 * 检查名称是否为"脏数据"（低质量数据，需要 AI 优化）
 * 核心原则：宁可多优化，也不遗漏——AI 的价值在于智能提炼，不是简单清洗
 */
function checkIsDirtyName(title, url) {
  if (!title) return true;
  const domain = extractDomain(url);
  const lowerTitle = title.toLowerCase();
  const lowerDomain = domain.toLowerCase();

  // 1. 基础垃圾特征（必须优化）
  const hasGarbage = (
    title.includes('://') || 
    title.startsWith('www.') ||
    /[\|\-\_·–—]{1,}/.test(title) // 包含任何分隔符（通常是 SEO 拼接）
  );

  // 2. 纯功能性词汇（无品牌信息）
  const isPureFunctional = /^(首页|官网|Home|Official|Login|Signin|Sign in|Welcome|欢迎光临|未命名|新建卡片|Dashboard|Console)$/i.test(title.trim());

  // 3. 包含需要清洗的词汇
  const needsCleaning = /首页|官网|官方网站|Home|Official|Login|Signin|Sign in|Welcome|欢迎|Documentation|Docs/i.test(title);

  // 4. 标题过长（超过15字通常包含冗余信息，需要 AI 提炼精简）
  const isTooLong = title.length > 15;

  // 5. 看起来像完整的 HTML title（通常包含品牌名 + 页面描述的组合）
  const looksLikeHtmlTitle = (
    /[·\|:\-–—]/.test(title) || // 包含常见的 title 分隔符
    title.includes(' - ') ||
    title.includes(' | ') ||
    title.includes(' · ')
  );

  // 6. 纯域名或域名简写
  const isDomainOnly = (
    (lowerTitle === lowerDomain) ||
    (lowerDomain.includes(lowerTitle) && title.length < 4)
  );

  return (
    hasGarbage || 
    isPureFunctional ||
    needsCleaning ||
    isTooLong ||
    looksLikeHtmlTitle ||
    isDomainOnly
  );
}

/**
 * 检查描述是否为"脏数据"（需要 AI 优化）
 * 核心原则：导航站描述应该精炼、有价值，而非网页原始 meta description
 */
function checkIsDirtyDesc(desc, title, url) {
  if (!desc) return true;
  const domain = extractDomain(url);
  
  // 1. 扩展生成的低质量描述
  const isExtensionGenerated = title && (desc.includes(title) && desc.includes(domain));
  
  // 2. SEO 关键词堆砌
  const isSEOSpam = (desc.match(/,|，|\|/g) || []).length > 3;
  
  // 3. 无意义的描述模式
  const isGenericDesc = /请提供|无法访问|描述如下|网站介绍|站点简介|本页面|该网站|点击访问|欢迎访问|欢迎来到|最新|最好|最全|一站式/i.test(desc);
  
  // 4. 过短（信息量不足）或过长（需要精炼）
  const isBadLength = desc.length < 15 || desc.length > 80;
  
  // 5. 看起来像原始 meta description（通常包含品牌名重复、网址、或营销语言）
  const looksLikeMeta = (
    desc.includes(domain) ||
    desc.includes('http') ||
    /官方|官网|正版|权威|领先|专业的|优质的|最大的/i.test(desc)
  );

  return (
    isExtensionGenerated ||
    isSEOSpam ||
    isGenericDesc ||
    isBadLength ||
    looksLikeMeta
  );
}

async function getDecryptedAIConfig() {
  const config = await db.getAIConfig();
  
  if (config.apiKey) {
    try {
      const encrypted = JSON.parse(config.apiKey);
      config.apiKey = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
    } catch {
      // 可能是未加密的旧数据
    }
  }
  
  return config;
}

function validateAIConfig(config) {
  if (!config.provider) {
    return { valid: false, message: '请先配置 AI 服务' };
  }
  
  const providerConfig = AI_PROVIDERS[config.provider];
  if (!providerConfig) {
    return { valid: false, message: `不支持的提供商: ${config.provider}` };
  }
  
  if (providerConfig.needsApiKey && !config.apiKey) {
    return { valid: false, message: '请先配置 API Key' };
  }
  
  if (providerConfig.needsBaseUrl && !config.baseUrl) {
    return { valid: false, message: '请先配置 Base URL' };
  }
  
  return { valid: true };
}


// ==================== 智能页面类型分析系统 ====================

/**
 * 分析 URL 并返回详细的页面类型信息
 * @param {string} url 网站地址
 * @param {string} title 页面标题（可选）
 * @returns {Object} 页面类型分析结果
 */
function analyzePageType(url, title = '') {
  const result = {
    type: 'homepage',       // homepage | subpage | functional | content | special
    category: '',           // docs | blog | login | dashboard | tool | product | download | api | forum | ...
    brand: '',              // 从域名或URL提取的品牌名
    hints: [],              // 给AI的提示信息
    confidence: 'low'       // low | medium | high
  };

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    const pathname = urlObj.pathname;
    const search = urlObj.search;
    const pathParts = pathname.split('/').filter(p => p.length > 0);

    // 1. 提取品牌名（从域名）
    const domainParts = hostname.split('.');
    if (domainParts.length >= 2) {
      // 处理子域名情况（如 docs.example.com, api.example.com）
      if (['docs', 'api', 'app', 'blog', 'help', 'support', 'status', 'dev', 'auth', 'login', 'console', 'dashboard', 'admin'].includes(domainParts[0])) {
        result.brand = domainParts[1];
        result.category = domainParts[0];
        result.type = 'subpage';
        result.hints.push(`子域名表明这是 ${domainParts[0]} 类型页面`);
      } else {
        result.brand = domainParts[0];
      }
    }

    // 2. 分析路径模式
      const pathPatterns = {
        docs: ['/docs', '/documentation', '/guide', '/guides', '/manual', '/wiki', '/reference', '/api-docs', '/api-reference', '/git-guides', '/docs-v', '/docs/v', '/learn', '/tutorial', '/handbook', '/getting-started'],
        blog: ['/blog', '/posts', '/post/', '/articles', '/article/', '/news', '/updates', '/changelog', '/release-notes', '/p/', '/notes/', '/stories', '/archive'],
        login: ['/login', '/signin', '/sign-in', '/auth', '/authenticate', '/sso', '/oauth', '/register', '/signup', '/sign-up', '/account/login', '/join', '/onboarding'],
        dashboard: ['/dashboard', '/console', '/admin', '/panel', '/manage', '/workspace', '/hub', '/portal', '/overview', '/analytics'],
        tool: ['/tool', '/tools', '/app', '/editor', '/generator', '/converter', '/calculator', '/playground', '/workbench', '/studio', '/sandbox', '/demo'],
        product: ['/product', '/products', '/pricing', '/plans', '/features', '/solutions', '/enterprise', '/about', '/tour', '/showcase', '/case-studies'],
        download: ['/download', '/downloads', '/release', '/releases', '/install', '/get-started', '/setup'],
        api: ['/api/', '/v1/', '/v2/', '/v3/', '/graphql', '/rest/', '/endpoints', '/developers', '/developer'],
        forum: ['/forum', '/community', '/discuss', '/discussions', '/questions', '/question/', '/answers', '/threads', '/topic/', '/issues', '/r/', '/t/', '/latest', '/top', '/categories', '/new', '/bbs', '/board', '/thread/', '/message'],
        support: ['/support', '/help', '/faq', '/contact', '/feedback', '/tickets', '/kb', '/knowledge-base'],
        legal: ['/terms', '/privacy', '/legal', '/policy', '/cookies', '/gdpr', '/tos', '/eula', '/license'],
        profile: ['/profile', '/user/', '/account', '/settings', '/preferences', '/u/', '/@', '/me', '/my'],
        video: ['/video/', '/watch', '/play/', '/v/', '/shorts/', '/live', '/stream'],
        shop: ['/shop', '/store', '/cart', '/checkout', '/order', '/buy', '/purchase', '/item/', '/goods'],
        search: ['/search', '/explore', '/discover', '/browse', '/find'],
        i18n: ['/en/', '/zh/', '/zh-cn/', '/zh-tw/', '/ja/', '/ko/', '/fr/', '/de/', '/es/', '/pt/', '/ru/', '/ar/']
      };


    for (const [category, patterns] of Object.entries(pathPatterns)) {
      if (patterns.some(p => pathname.toLowerCase().includes(p))) {
        result.category = category;
        result.type = ['login', 'dashboard', 'profile'].includes(category) ? 'functional' : 
                      ['docs', 'blog', 'forum', 'video'].includes(category) ? 'content' : 
                      ['shop', 'search'].includes(category) ? 'functional' :
                      category === 'i18n' ? result.type : 'subpage';
        if (category !== 'i18n') {
          result.confidence = 'high';
          result.hints.push(`路径包含 ${category} 相关关键词`);
        }
        break;
      }
    }

    // 3. 分析 URL 参数特征
    if (search) {
      const paramPatterns = {
        redirect: ['continueUrl', 'redirect', 'returnUrl', 'next', 'callback', 'return_to', 'redirect_uri'],
        search: ['q', 'query', 'search', 'keyword', 'keywords', 's'],
        session: ['session', 'token', 'sid', 'csesidx', 'wiffid'],
        pagination: ['page', 'offset', 'limit', 'cursor']
      };

      for (const [type, params] of Object.entries(paramPatterns)) {
        if (params.some(p => search.toLowerCase().includes(p + '='))) {
          if (type === 'redirect' || type === 'session') {
            result.type = 'functional';
            result.category = result.category || 'login';
            result.hints.push('URL 参数表明这是登录/认证流程页面');
            result.confidence = 'high';
          } else if (type === 'search') {
            result.type = 'functional';
            result.category = 'search';
            result.hints.push('这是搜索结果页面');
          }
          break;
        }
      }
    }

    // 4. 分析路径深度和结构
    if (pathParts.length === 0 && !search) {
      result.type = 'homepage';
      result.confidence = 'high';
      result.hints.push('根路径，极可能是网站首页');
    } else if (pathParts.length > 3) {
      result.type = result.type === 'homepage' ? 'content' : result.type;
      result.hints.push('路径层级较深，可能是具体内容页');
    }

    // 5. 分析标题特征（如果有）
    if (title) {
      const titlePatterns = {
        login: /login|sign.?in|登录|登入|注册|sign.?up/i,
        docs: /documentation|docs|指南|教程|文档|manual|guide|tutorial/i,
        blog: /blog|post|article|文章|博客|新闻/i,
        error: /404|not.?found|error|错误|找不到/i,
        welcome: /welcome|欢迎|首页|home/i
      };

      for (const [type, pattern] of Object.entries(titlePatterns)) {
        if (pattern.test(title)) {
          if (type === 'login' && result.category !== 'login') {
            result.category = 'login';
            result.type = 'functional';
          } else if (type === 'docs' && !result.category) {
            result.category = 'docs';
            result.type = 'content';
          }
          result.hints.push(`标题包含 ${type} 相关关键词`);
          break;
        }
      }
    }

    // 6. 特殊域名识别
    const knownPlatforms = {
      // 代码托管
      'github.com': { brand: 'GitHub', defaultCategory: 'code' },
      'gitlab.com': { brand: 'GitLab', defaultCategory: 'code' },
      'gitee.com': { brand: 'Gitee', defaultCategory: 'code' },
      'bitbucket.org': { brand: 'Bitbucket', defaultCategory: 'code' },
      'codeberg.org': { brand: 'Codeberg', defaultCategory: 'code' },
      // 云服务与部署
      'vercel.com': { brand: 'Vercel', defaultCategory: 'deploy' },
      'netlify.com': { brand: 'Netlify', defaultCategory: 'deploy' },
      'heroku.com': { brand: 'Heroku', defaultCategory: 'deploy' },
      'railway.app': { brand: 'Railway', defaultCategory: 'deploy' },
      'render.com': { brand: 'Render', defaultCategory: 'deploy' },
      'fly.io': { brand: 'Fly.io', defaultCategory: 'deploy' },
      'aws.amazon.com': { brand: 'AWS', defaultCategory: 'cloud' },
      'cloud.google.com': { brand: 'Google Cloud', defaultCategory: 'cloud' },
      'azure.microsoft.com': { brand: 'Azure', defaultCategory: 'cloud' },
      'cloudflare.com': { brand: 'Cloudflare', defaultCategory: 'network' },
      // 数据库
      'supabase.com': { brand: 'Supabase', defaultCategory: 'database' },
      'firebase.google.com': { brand: 'Firebase', defaultCategory: 'database' },
      'planetscale.com': { brand: 'PlanetScale', defaultCategory: 'database' },
      'mongodb.com': { brand: 'MongoDB', defaultCategory: 'database' },
      'neon.tech': { brand: 'Neon', defaultCategory: 'database' },
      // 设计工具
      'figma.com': { brand: 'Figma', defaultCategory: 'design' },
      'canva.com': { brand: 'Canva', defaultCategory: 'design' },
      'sketch.com': { brand: 'Sketch', defaultCategory: 'design' },
      'dribbble.com': { brand: 'Dribbble', defaultCategory: 'design' },
      'behance.net': { brand: 'Behance', defaultCategory: 'design' },
      // 生产力工具
      'notion.so': { brand: 'Notion', defaultCategory: 'productivity' },
      'airtable.com': { brand: 'Airtable', defaultCategory: 'productivity' },
      'coda.io': { brand: 'Coda', defaultCategory: 'productivity' },
      'clickup.com': { brand: 'ClickUp', defaultCategory: 'productivity' },
      'monday.com': { brand: 'Monday', defaultCategory: 'productivity' },
      'trello.com': { brand: 'Trello', defaultCategory: 'productivity' },
      'asana.com': { brand: 'Asana', defaultCategory: 'productivity' },
      'linear.app': { brand: 'Linear', defaultCategory: 'productivity' },
      // 搜索与AI
      'google.com': { brand: 'Google', defaultCategory: 'search' },
      'bing.com': { brand: 'Bing', defaultCategory: 'search' },
      'baidu.com': { brand: '百度', defaultCategory: 'search' },
      'openai.com': { brand: 'OpenAI', defaultCategory: 'ai' },
      'anthropic.com': { brand: 'Anthropic', defaultCategory: 'ai' },
      'gemini.google': { brand: 'Gemini', defaultCategory: 'ai' },
      'claude.ai': { brand: 'Claude', defaultCategory: 'ai' },
      'chat.openai.com': { brand: 'ChatGPT', defaultCategory: 'ai' },
      'huggingface.co': { brand: 'Hugging Face', defaultCategory: 'ai' },
      'midjourney.com': { brand: 'Midjourney', defaultCategory: 'ai' },
      'stability.ai': { brand: 'Stability AI', defaultCategory: 'ai' },
      // 视频平台
      'youtube.com': { brand: 'YouTube', defaultCategory: 'video' },
      'bilibili.com': { brand: '哔哩哔哩', defaultCategory: 'video' },
      'vimeo.com': { brand: 'Vimeo', defaultCategory: 'video' },
      'twitch.tv': { brand: 'Twitch', defaultCategory: 'video' },
      'douyin.com': { brand: '抖音', defaultCategory: 'video' },
      'ixigua.com': { brand: '西瓜视频', defaultCategory: 'video' },
      // 社交平台
      'twitter.com': { brand: 'Twitter', defaultCategory: 'social' },
      'x.com': { brand: 'X', defaultCategory: 'social' },
      'linkedin.com': { brand: 'LinkedIn', defaultCategory: 'social' },
      'facebook.com': { brand: 'Facebook', defaultCategory: 'social' },
      'instagram.com': { brand: 'Instagram', defaultCategory: 'social' },
      'tiktok.com': { brand: 'TikTok', defaultCategory: 'social' },
      'weibo.com': { brand: '微博', defaultCategory: 'social' },
      'xiaohongshu.com': { brand: '小红书', defaultCategory: 'social' },
      // 论坛与问答
      'reddit.com': { brand: 'Reddit', defaultCategory: 'forum' },
      'zhihu.com': { brand: '知乎', defaultCategory: 'qa' },
      'quora.com': { brand: 'Quora', defaultCategory: 'qa' },
      'stackoverflow.com': { brand: 'Stack Overflow', defaultCategory: 'tech-qa' },
      'segmentfault.com': { brand: 'SegmentFault', defaultCategory: 'tech-qa' },
      'v2ex.com': { brand: 'V2EX', defaultCategory: 'tech-forum' },
      // 博客与内容
      'medium.com': { brand: 'Medium', defaultCategory: 'blog' },
      'dev.to': { brand: 'DEV Community', defaultCategory: 'tech-blog' },
      'hashnode.dev': { brand: 'Hashnode', defaultCategory: 'tech-blog' },
      'juejin.cn': { brand: '掘金', defaultCategory: 'tech-blog' },
      'csdn.net': { brand: 'CSDN', defaultCategory: 'tech-blog' },
      'cnblogs.com': { brand: '博客园', defaultCategory: 'tech-blog' },
      'jianshu.com': { brand: '简书', defaultCategory: 'blog' },
      'substack.com': { brand: 'Substack', defaultCategory: 'newsletter' },
      // 沟通协作
      'discord.com': { brand: 'Discord', defaultCategory: 'community' },
      'slack.com': { brand: 'Slack', defaultCategory: 'communication' },
      'telegram.org': { brand: 'Telegram', defaultCategory: 'communication' },
      'zoom.us': { brand: 'Zoom', defaultCategory: 'communication' },
      'teams.microsoft.com': { brand: 'Microsoft Teams', defaultCategory: 'communication' },
      'feishu.cn': { brand: '飞书', defaultCategory: 'communication' },
      'dingtalk.com': { brand: '钉钉', defaultCategory: 'communication' },
      'weixin.qq.com': { brand: '微信', defaultCategory: 'communication' },
      // 包管理
      'npmjs.com': { brand: 'npm', defaultCategory: 'package' },
      'pypi.org': { brand: 'PyPI', defaultCategory: 'package' },
      'crates.io': { brand: 'crates.io', defaultCategory: 'package' },
      'pkg.go.dev': { brand: 'Go Packages', defaultCategory: 'package' },
      'rubygems.org': { brand: 'RubyGems', defaultCategory: 'package' },
      'packagist.org': { brand: 'Packagist', defaultCategory: 'package' },
      'mvnrepository.com': { brand: 'Maven', defaultCategory: 'package' },
      // 电商
      'amazon.com': { brand: 'Amazon', defaultCategory: 'ecommerce' },
      'ebay.com': { brand: 'eBay', defaultCategory: 'ecommerce' },
      'taobao.com': { brand: '淘宝', defaultCategory: 'ecommerce' },
      'jd.com': { brand: '京东', defaultCategory: 'ecommerce' },
      'pinduoduo.com': { brand: '拼多多', defaultCategory: 'ecommerce' },
      'shopify.com': { brand: 'Shopify', defaultCategory: 'ecommerce' },
      // 科技巨头
      'microsoft.com': { brand: 'Microsoft', defaultCategory: 'tech' },
      'apple.com': { brand: 'Apple', defaultCategory: 'tech' },
      'mozilla.org': { brand: 'Mozilla', defaultCategory: 'tech' },
      // 文档与知识库
      'readthedocs.io': { brand: 'Read the Docs', defaultCategory: 'docs' },
      'gitbook.io': { brand: 'GitBook', defaultCategory: 'docs' },
      'docsify.js.org': { brand: 'Docsify', defaultCategory: 'docs' },
      'docusaurus.io': { brand: 'Docusaurus', defaultCategory: 'docs' },
      'vuepress.vuejs.org': { brand: 'VuePress', defaultCategory: 'docs' }
    };

    for (const [domain, info] of Object.entries(knownPlatforms)) {
      if (hostname.includes(domain)) {
        result.brand = info.brand;
        if (!result.category) result.category = info.defaultCategory;
        result.confidence = 'high';
        break;
      }
    }

  } catch (e) {
    result.hints.push('URL 解析失败');
  }

  return result;
}

/**
 * 生成页面类型描述字符串（用于提示词）
 */
function getPageTypeDescription(analysis) {
  const typeNames = {
    homepage: '网站首页',
    subpage: '功能子页面',
    functional: '功能性页面（如登录、控制台）',
    content: '内容页面（如文档、博客）',
    special: '特殊页面'
  };

  const categoryNames = {
    docs: '文档/教程',
    blog: '博客/文章',
    login: '登录/认证',
    dashboard: '控制台/后台',
    tool: '在线工具',
    product: '产品介绍',
    download: '下载页',
    api: 'API 接口',
    forum: '论坛/社区',
    support: '帮助/支持',
    legal: '法律条款',
    profile: '用户资料',
    video: '视频内容',
    shop: '电商/购物',
    search: '搜索页面',
    i18n: '多语言版本',
    code: '代码托管',
    deploy: '部署服务',
    cloud: '云服务',
    database: '数据库服务',
    design: '设计工具',
    productivity: '生产力工具',
    ai: 'AI/人工智能',
    social: '社交平台',
    qa: '问答社区',
    'tech-qa': '技术问答',
    'tech-blog': '技术博客',
    'tech-forum': '技术论坛',
    community: '社区',
    communication: '通讯工具',
    package: '包管理',
    ecommerce: '电子商务',
    tech: '科技公司',
    newsletter: '邮件订阅',
    network: '网络服务'
  };

  let desc = typeNames[analysis.type] || '未知类型';
  if (analysis.category && categoryNames[analysis.category]) {
    desc = categoryNames[analysis.category];
  }
  
  return desc;
}

// ==================== Prompt 构建函数 ====================

function buildUnifiedPrompt(card, types, metadata = null) {
  const domain = extractDomain(card.url);
  const analysis = analyzePageType(card.url, card.title);
  const pageTypeDesc = getPageTypeDescription(analysis);
  const keyInfo = extractKeyInfo(metadata);

  const currentName = card.title && !card.title.includes('://') && !card.title.startsWith('www.')
    ? card.title : '';

  // 构建结构化上下文信息
  let contextInfo = `【网站URL】${card.url}`;
  if (currentName) contextInfo += `\n【原始标题】${currentName}`;
  if (keyInfo?.brandName) contextInfo += `\n【品牌名】${keyInfo.brandName}`;
  if (keyInfo?.pageTitle && keyInfo.pageTitle !== currentName && keyInfo.pageTitle !== keyInfo.brandName) contextInfo += `\n【页面标题】${keyInfo.pageTitle}`;
  if (keyInfo?.bestDescription) contextInfo += `\n【网站自述】${keyInfo.bestDescription}`;
  if (card.desc && (!keyInfo?.bestDescription || card.desc !== keyInfo.bestDescription)) contextInfo += `\n【当前描述】${card.desc}`;
  contextInfo += `\n【页面类型】${pageTypeDesc}`;
  if (analysis.brand) contextInfo += `\n【品牌识别】${analysis.brand}`;
  if (keyInfo?.siteName && keyInfo.siteName !== analysis.brand && keyInfo.siteName !== keyInfo.brandName) contextInfo += ` (${keyInfo.siteName})`;
  if (analysis.hints.length > 0) contextInfo += `\n【分析提示】${analysis.hints.join('; ')}`;

  const messages = [
    {
      role: 'system',
      content: `你是一个专业的互联网产品分析师和导航站编辑。
任务：根据提供的网站信息（URL、标题、网站自述、页面类型分析），生成高质量、精炼的导航卡片元数据。

## 核心准则

### 1. 名称 (name) 生成规则
按以下优先级依次判断，命中即停：
1. 登录/认证/注册页 → 直接输出品牌名，忽略所有功能词
2. 有明确【品牌名】 → 首页直接使用该品牌名；子页面用 "[品牌名] [主题]"
3. 文档/教程页 → "[品牌] [主题关键词]"
4. 在线工具/应用 → "[品牌] [工具类型]"
5. 具体文章/帖子 → 精简文章标题（去掉作者和站点名）
6. 以上都不匹配 → 从域名提炼核心名称
- 清洗规则：严格剔除 "官网"、"首页"、"官方网站"、"Login"、"Welcome"、"Sign in"、分隔符后的冗余内容
- 长度限制：中文 2-15 字，中英混合 2-40 字符

### 2. 描述 (description) 生成规则
- 回答"这个网站对用户有什么用？"，而非描述网站本身
- 优先使用【网站自述】中的真实信息来提炼，不要凭空编造
- 长度指引：品牌首页 12-25 字；工具/文档页 18-35 字；博客/文章/社区 15-30 字
- 禁止使用的空泛表述："全球领先的..."（除非确实 TOP3）、"一站式...平台"、"致力于..."、"专注于..."、"专业的...服务"、"这是一个"、"本网站"
- 应使用具体描述：说明核心功能、用户价值、差异化定位
- 当【网站自述】只是品牌口号（如"开放、分享、探索"）而非实际描述时，基于页面类型和 URL 推断用途，不要照搬口号
- 论坛/社区类网站：说明社区定位和讨论主题，而非重复 slogan

## 重要提示
- 如果有【网站自述】且包含实际信息，优先基于它来提炼描述
- 如果信息不足，基于 URL 路径和域名做合理推断，不要输出"无法确定"类内容
- 必须输出纯 JSON 对象，严禁包含思考过程、解释说明或 Markdown 标记
- 输出格式：{"name":"名称","description":"描述"}`
    },
    // Few-shot 示例：使用结构化格式，覆盖多种场景
    // 1. 代码托管平台首页（有元数据）
    { role: 'user', content: '【网站URL】https://github.com/\n【原始标题】GitHub: Let\'s build from here · GitHub\n【品牌名】GitHub\n【网站自述】GitHub is where over 100 million developers shape the future of software, together.\n【页面类型】网站首页\n【品牌识别】GitHub' },
    { role: 'assistant', content: '{"name":"GitHub","description":"全球最大的代码托管与开源协作开发平台"}' },

    // 2. 技术文档页（有元数据）
    { role: 'user', content: '【网站URL】https://vuejs.org/guide/introduction.html\n【原始标题】Introduction | Vue.js\n【品牌名】Vue.js\n【网站自述】Vue.js - The Progressive JavaScript Framework\n【页面标题】Introduction\n【页面类型】文档/教程\n【品牌识别】Vue' },
    { role: 'assistant', content: '{"name":"Vue 入门指南","description":"Vue.js 框架核心概念与基础使用方法详解"}' },

    // 3. 登录/认证页面（有元数据，需忽略登录行为）
    { role: 'user', content: '【网站URL】https://auth.example.com/login?redirect=/dashboard\n【原始标题】Sign In - Example Platform\n【品牌名】Example Platform\n【页面类型】登录/认证\n【品牌识别】Example\n【分析提示】URL 参数表明这是登录/认证流程页面' },
    { role: 'assistant', content: '{"name":"Example Platform","description":"企业级协作与项目管理平台"}' },

    // 4. 在线工具（有元数据）
    { role: 'user', content: '【网站URL】https://tinypng.com/\n【原始标题】TinyPNG – Compress WebP, PNG and JPEG images intelligently\n【品牌名】TinyPNG\n【网站自述】Optimize your images with a perfect balance of quality and file size.\n【页面类型】在线工具\n【品牌识别】TinyPNG' },
    { role: 'assistant', content: '{"name":"TinyPNG","description":"智能压缩 PNG/JPEG/WebP 图片，最高减少 80% 体积"}' },

    // 5. 问答社区
    { role: 'user', content: '【网站URL】https://www.zhihu.com/question/12345678\n【原始标题】如何学习编程？ - 知乎\n【页面类型】问答社区\n【品牌识别】知乎' },
    { role: 'assistant', content: '{"name":"知乎","description":"中文互联网高质量问答社区与知识分享平台"}' },

    // 6. AI 产品
    { role: 'user', content: '【网站URL】https://chat.openai.com/\n【原始标题】ChatGPT\n【品牌名】ChatGPT\n【网站自述】ChatGPT helps you get answers, find inspiration and be more productive.\n【页面类型】AI/人工智能\n【品牌识别】ChatGPT' },
    { role: 'assistant', content: '{"name":"ChatGPT","description":"OpenAI 开发的智能对话助手，支持问答、写作与编程"}' },

    // 7. 个人博客（信息匮乏场景）
    { role: 'user', content: '【网站URL】https://overreacted.io/a-complete-guide-to-useeffect/\n【原始标题】A Complete Guide to useEffect — overreacted\n【页面类型】博客/文章\n【品牌识别】overreacted' },
    { role: 'assistant', content: '{"name":"useEffect 完全指南","description":"Dan Abramov 深入讲解 React useEffect 的工作原理"}' },

    // 8. 论坛/社区（网站自述只是口号）
    { role: 'user', content: '【网站URL】https://aito.do/latest\n【原始标题】Aito.do - 开放、分享、探索\n【品牌名】Aito.do\n【网站自述】Aito.do - 开放、分享、探索\n【页面类型】论坛/社区\n【品牌识别】Aito.do\n【分析提示】路径包含 forum 相关关键词' },
    { role: 'assistant', content: '{"name":"Aito.do","description":"AI 技术爱好者交流社区，讨论大模型、开发工具与网络配置等话题"}' },

    // 9. 信息极度匮乏场景
    { role: 'user', content: '【网站URL】https://example-tool.com/\n【原始标题】无\n【页面类型】网站首页\n【品牌识别】Example Tool' },
    { role: 'assistant', content: '{"name":"Example Tool","description":"Example Tool 官方网站与产品平台"}' },

    // 实际请求
    { role: 'user', content: contextInfo }
  ];

  return messages;
}

function buildNamePrompt(card, metadata = null) {
  const domain = extractDomain(card.url);
  const analysis = analyzePageType(card.url, card.title);
  const pageTypeDesc = getPageTypeDescription(analysis);
  const keyInfo = extractKeyInfo(metadata);

  const commonRules = '\n\n## 强制要求\n- 严禁输出任何思考过程、解释或反问\n- 严禁输出"请提供"、"如果您能"、"我需要"等请求信息的内容\n- 必须直接输出名称文本，不要任何前缀或后缀\n- 即使信息有限，也必须基于已有信息做出合理推断并输出结果';

  // 构建结构化上下文
  let contextStr = `网站地址：${card.url}\n当前抓取名：${card.title || '无'}`;
  if (keyInfo?.brandName) contextStr += `\n品牌名：${keyInfo.brandName}`;
  if (keyInfo?.pageTitle && keyInfo.pageTitle !== card.title && keyInfo.pageTitle !== keyInfo.brandName) contextStr += `\n页面标题：${keyInfo.pageTitle}`;
  if (keyInfo?.siteName && keyInfo.siteName !== analysis.brand && keyInfo.siteName !== keyInfo.brandName) contextStr += `\n站点名称：${keyInfo.siteName}`;
  contextStr += `\n页面类型：${pageTypeDesc}`;
  if (analysis.brand) contextStr += `\n品牌：${analysis.brand}`;
  if (analysis.hints.length > 0) contextStr += `\n分析提示：${analysis.hints.join('; ')}`;
  contextStr += '\n输出名称：';

  return [
    {
      role: 'system',
      content: `你是一个精炼的网站命名专家。你的任务是根据网站信息提取或生成最简洁准确的名称。

## 命名决策树（按优先级依次判断，命中即停）

1. **登录/认证/注册页** → 直接输出品牌名，忽略所有功能词
2. **有"品牌名"字段** → 首页直接使用该品牌名；子页面用 "[品牌名] [主题]"
3. **文档/教程/指南页** → "[品牌] [主题关键词]"
4. **在线工具/应用** → "[品牌] [工具类型]"
5. **具体文章/帖子** → 精简文章标题（去掉作者名和站点名）
6. **电商/商品页** → 输出平台品牌名，不输出商品名
7. **以上都不匹配** → 从域名提炼核心名称

## 清洗规则
- 严格剔除：官网、首页、官方网站、Home、Official、Login、Welcome、Sign in、注册、|、-、· 后的冗余内容
- 去除 SEO 堆砌词汇和重复的品牌名

## 错误示例（禁止输出类似内容）
- ❌ "GitHub官网" → 含"官网"冗余词
- ❌ "Sign in - GitHub" → 未清洗登录页标题
- ❌ "Welcome to Notion" → 未提取核心品牌名
- ❌ "TinyPNG – Compress WebP, PNG and JPEG" → 照搬原标题未精简

## 长度限制
- 中文：2-15 字
- 中英混合：2-40 字符${commonRules}`
    },
    // Few-shot 示例（覆盖更多场景）
    { role: 'user', content: '网站地址：https://github.com/\n当前抓取名：GitHub: Let\'s build from here · GitHub\n品牌名：GitHub\n页面类型：代码托管\n品牌：GitHub\n输出名称：' },
    { role: 'assistant', content: 'GitHub' },
    { role: 'user', content: '网站地址：https://auth.business.gemini.google/login\n当前抓取名：Sign in - Gemini\n品牌名：Gemini\n页面类型：登录/认证\n品牌：Gemini\n分析提示：URL 参数表明这是登录/认证流程页面\n输出名称：' },
    { role: 'assistant', content: 'Gemini' },
    { role: 'user', content: '网站地址：https://react.dev/learn/tutorial-tic-tac-toe\n当前抓取名：Tutorial: Tic-Tac-Toe – React\n品牌名：React\n页面标题：Tutorial: Tic-Tac-Toe\n页面类型：文档/教程\n品牌：React\n输出名称：' },
    { role: 'assistant', content: 'React 井字棋教程' },
    { role: 'user', content: '网站地址：https://www.taobao.com/\n当前抓取名：淘宝网 - 淘！我喜欢\n品牌名：淘宝\n页面类型：电子商务\n品牌：淘宝\n输出名称：' },
    { role: 'assistant', content: '淘宝' },
    { role: 'user', content: '网站地址：https://example.com/\n当前抓取名：无\n页面类型：网站首页\n品牌：Example\n输出名称：' },
    { role: 'assistant', content: 'Example' },
    { role: 'user', content: '网站地址：https://docs.github.com/en/actions\n当前抓取名：GitHub Actions documentation - GitHub Docs\n品牌名：GitHub Docs\n页面标题：GitHub Actions documentation\n页面类型：文档/教程\n品牌：GitHub\n输出名称：' },
    { role: 'assistant', content: 'GitHub Actions 文档' },
    // 实际请求
    {
      role: 'user',
      content: contextStr
    }
  ];
}

function buildDescriptionPrompt(card, metadata = null) {
  const domain = extractDomain(card.url);
  const analysis = analyzePageType(card.url, card.title);
  const pageTypeDesc = getPageTypeDescription(analysis);
  const keyInfo = extractKeyInfo(metadata);

  const commonRules = '\n\n## 强制要求\n- 严禁输出任何思考过程、解释或反问\n- 严禁输出"请提供"、"如果您能"、"我需要"等请求信息的内容\n- 必须直接输出描述文本，不要任何前缀或后缀\n- 即使信息有限，也必须基于已有信息做出合理推断并输出结果';

  // 构建结构化上下文
  let contextStr = `网站名称：${card.title || domain}\n网站地址：${card.url}`;
  if (keyInfo?.brandName) contextStr += `\n品牌名：${keyInfo.brandName}`;
  if (keyInfo?.bestDescription) contextStr += `\n网站自述：${keyInfo.bestDescription}（仅供参考提炼，不要照搬）`;
  if (card.desc && (!keyInfo?.bestDescription || card.desc !== keyInfo.bestDescription)) contextStr += `\n参考描述：${card.desc}`;
  contextStr += `\n页面类型：${pageTypeDesc}`;
  if (analysis.brand) contextStr += `\n品牌：${analysis.brand}`;
  if (keyInfo?.siteName && keyInfo.siteName !== analysis.brand && keyInfo.siteName !== keyInfo.brandName) contextStr += ` (${keyInfo.siteName})`;
  if (analysis.hints.length > 0) contextStr += `\n分析提示：${analysis.hints.join('; ')}`;
  contextStr += '\n输出描述：';

  return [
    {
      role: 'system',
      content: `你是一个资深的导航站文案编辑。你的任务是根据网站信息生成精炼、有价值的描述。
核心原则：回答"这个网站对用户有什么用？"，而非描述网站本身。

## 描述生成指引（按页面类型）

### 品牌/产品首页
- 一句话说明"它是什么"+"核心功能"
- 长度目标：12-25 字

### 工具/在线应用页
- 说明"能做什么"+"解决什么问题"
- 长度目标：18-35 字

### 文档/教程/指南页
- 说明"讲什么内容"+"适合谁看"
- 长度目标：18-35 字

### 问答/社区/论坛
- 说明社区定位、讨论主题和核心价值
- 长度目标：15-30 字
- 如果 URL 包含 /latest、/top、/categories 等路径，说明这是论坛的列表页面，用品牌名作为名称

### 博客/文章页
- 概括核心观点或主题
- 长度目标：15-30 字

### 登录/认证/功能页
- 描述产品核心功能，而非登录行为
- 长度目标：15-30 字

## 识别并跳过无用的网站自述
很多网站的 meta description 只是品牌口号（如"开放、分享、探索"、"让创意 flourish"、"Just do it"），不包含实际信息。
遇到这类情况时，**不要照搬口号**，而是基于以下信息推断网站用途：
1. 页面类型分析（forum → 论坛社区，blog → 博客，tool → 工具）
2. URL 路径特征（/latest → 论坛帖子列表，/t/ → 论坛帖子详情）
3. 域名暗示（如 aito.do 暗示 AI 相关社区）

## 反同质化规则（严格执行）

### 禁止使用的空泛表述
- "全球领先的..."（除非确实是全球 TOP3）
- "一站式...平台"（除非真的整合了多种核心功能）
- "致力于..."、"专注于..."、"提供专业的..."
- "这是一个"、"本网站"、"欢迎来到"

### 应该使用的具体描述
- ✅ "免费压缩 PNG/JPEG/WebP 图片，最高减少 80% 体积"
- ✅ "国内最大的技术问答与知识分享社区"
- ✅ "支持团队协作的在线文档与知识库工具"
- ✅ "开源的 JavaScript 前端框架，用于构建用户界面"

## 数据来源优先级
如果有"网站自述"，优先基于它提炼（比凭空推断更准确），但不要照搬原文${commonRules}`
    },
    // Few-shot 示例
    { role: 'user', content: '网站名称：GitHub\n网站地址：https://github.com/\n网站自述：GitHub is where over 100 million developers shape the future of software, together.\n页面类型：代码托管\n品牌：GitHub\n输出描述：' },
    { role: 'assistant', content: '全球最大的代码托管与开源协作开发平台' },
    { role: 'user', content: '网站名称：Gemini\n网站地址：https://gemini.google/\n网站自述：Get help with writing, planning, learning and more from Google AI.\n页面类型：AI/人工智能\n品牌：Gemini\n输出描述：' },
    { role: 'assistant', content: 'Google 推出的多模态 AI 助手，支持写作、学习与编程' },
    { role: 'user', content: '网站名称：TinyPNG\n网站地址：https://tinypng.com/\n网站自述：Optimize your images with a perfect balance of quality and file size.\n页面类型：在线工具\n品牌：TinyPNG\n输出描述：' },
    { role: 'assistant', content: '智能压缩 PNG/JPEG/WebP 图片，最高减少 80% 体积' },
    { role: 'user', content: '网站名称：知乎\n网站地址：https://www.zhihu.com/\n页面类型：问答社区\n品牌：知乎\n输出描述：' },
    { role: 'assistant', content: '中文互联网高质量问答社区与知识分享平台' },
    { role: 'user', content: '网站名称：Aito.do\n网站地址：https://aito.do/latest\n网站自述：Aito.do - 开放、分享、探索\n页面类型：论坛/社区\n品牌：Aito.do\n分析提示：路径包含 forum 相关关键词\n输出描述：' },
    { role: 'assistant', content: 'AI 技术爱好者交流社区，讨论大模型、开发工具与网络配置等话题' },
    { role: 'user', content: '网站名称：V2EX\n网站地址：https://www.v2ex.com/\n网站自述：V2EX = way to explore\n页面类型：论坛/社区\n品牌：V2EX\n输出描述：' },
    { role: 'assistant', content: '程序员与创意工作者的技术讨论社区' },
    { role: 'user', content: '网站名称：Example\n网站地址：https://example.com/\n页面类型：网站首页\n品牌：Example\n输出描述：' },
    { role: 'assistant', content: 'Example 官方网站与产品平台' },
    // 实际请求
    {
      role: 'user',
      content: contextStr
    }
  ];
}

function parseUnifiedResponse(text, types) {
  const result = { name: '', description: '' };
  if (!text) return result;

  // 先剥离推理模型的思考过程，避免污染 JSON 提取
  text = stripThoughtTags(text);

  try {
    // 增强的 JSON 提取逻辑
    const cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (types.includes('name') && parsed.name) result.name = cleanName(parsed.name);
      if (types.includes('description') && parsed.description) result.description = cleanDescription(parsed.description);
      return result;
    }
  } catch (e) {
    console.error('Failed to parse unified response:', e.message);
  }

  // 降级：如果 JSON 解析完全失败，尝试正则提取
  if (types.includes('name')) {
    const nameMatch = text.match(/"name":\s*"([^"]+)"/);
    if (nameMatch) result.name = cleanName(nameMatch[1]);
  }
  if (types.includes('description')) {
    const descMatch = text.match(/"description":\s*"([^"]+)"/);
    if (descMatch) result.description = cleanDescription(descMatch[1]);
  }

  return result;
}

// ==================== 响应清理函数 ====================

// AI 思考过程的特征模式（需要过滤掉）
// 注意：只匹配明确的思考过程句式，避免误杀正常内容
const AI_THINKING_PATTERNS = [
  /(我需要|让我|由于我|我将|我无法).{0,30}(分析|查看|访问|了解|处理|确认)/,
  /^(我需要|让我|由于我|我将|我无法|好的，|没问题，|当然，)/,
  /^(This|I need to|Let me|Since I|I will|I cannot|Okay,|Sure,).{0,30}/i,
  /无法(直接)?访问(该|这个|此)?(网站|链接|页面)/,
  /无法获取(网站|网页|页面)(内容|信息)/,
  /请提供(更多|详细|网站的)?(信息|内容|简介|功能说明)/,
  /抱歉[，,]我无法/,
  /如果您(能|可以)提供/,
  /我可以为您生成/,
  /符合规范的.*字/,
  /请(您)?提供.*我(将|会|可以)/,
  /需要(更多|额外)(的)?信息/,
  /无法确定|无法判断|信息不足/
];

function isAIThinkingText(text) {
  if (!text || text.length < 5) return false;
  
  const clean = text.replace(/<[^>]+>/g, '').trim();
  
  return AI_THINKING_PATTERNS.some(pattern => pattern.test(clean));
}

function stripThoughtTags(text) {
  if (!text) return '';
  let t = text;

  // 推理模型(DeepSeek-R1/QwQ 等)常把思考放在 <think>...</think> 等标签内，
  // 最终答案位于"闭合标签之后"。最稳健做法：若存在任一思考闭合标签，
  // 只保留最后一次出现的闭合标签之后的文本（即最终答案）。
  // 兼容：成对标签、缺省开标签、多段思考等各种情况。
  const closingTags = ['</think>', '</thinking>', '</thought>', '</reasoning>', '</reflection>', '【/思考】'];
  let lastIdx = -1, lastLen = 0;
  for (const tag of closingTags) {
    const idx = t.lastIndexOf(tag);
    if (idx !== -1 && idx + tag.length > lastIdx) {
      lastIdx = idx;
      lastLen = tag.length;
    }
  }
  if (lastIdx !== -1) {
    t = t.slice(lastIdx + lastLen);
  }

  // 兜底：移除残留的成对思考标签
  t = t
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<reflection>[\s\S]*?<\/reflection>/gi, '')
    .replace(/【思考】[\s\S]*?【\/思考】/g, '')
    // 未闭合的开标签：从该标签到末尾都视为思考，移除
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<thinking>[\s\S]*$/gi, '')
    .replace(/<thought>[\s\S]*$/gi, '')
    .replace(/<reasoning>[\s\S]*$/gi, '')
    .trim();

  return t;
}

function cleanName(text) {
  if (!text) return '';
  
  let processed = stripThoughtTags(text);
  
  // 检测是否为 AI 思考过程文本
  if (isAIThinkingText(processed)) {
    console.warn('Detected AI thinking text in name, rejecting:', processed.substring(0, 50));
    return '';
  }
  
  return processed
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '')
    .replace(/^(名称[：:]\s*|网站名[：:]\s*|Name[：:]\s*)/i, '')
    .replace(/[\r\n]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(官网|首页|官方网站|Official|Home)$/i, (match, p1) => {
      return processed.length <= 4 ? match : '';
    })
    .trim()
      .substring(0, 40); // 控制在合理范围
  }
  
function extractUsefulDescription(thinkingText) {
  const lines = thinkingText.split(/[。！？\n]/).map(s => s.trim()).filter(s => s.length > 0);
  
  const descriptionPatterns = [
    /^["'「」『』""''"](.{10,50})["'「」『』""''"]/,
    /(?:描述|简介|建议|推荐|生成)[：:]\s*["'「」『』""''"]?(.{10,50})["'「」『』""''"]?$/,
    /(?:可以(?:写成|使用|表述为|描述为))[：:]?\s*["'「」『』""''"]?(.{10,50})["'「」『』""''"]?/,
    /(?:最终|综上|因此|所以)[，,]?\s*["'「」『』""''"]?(.{10,50})["'「」『』""''"]?$/,
  ];
  
  for (const line of lines.reverse()) {
    for (const pattern of descriptionPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (candidate.length >= 10 && candidate.length <= 60 && !isAIThinkingText(candidate)) {
          return candidate;
        }
      }
    }
  }
  
  const validDescPatterns = [
    /提供.{2,20}(?:服务|功能|工具|平台)/,
    /(?:专注|专业|领先).{2,20}(?:领域|平台|服务)/,
    /(?:一站式|综合性|智能).{2,20}(?:平台|工具|服务)/,
    /.{2,10}(?:开发|设计|管理|协作).{2,20}(?:工具|平台)/,
  ];
  
  for (const line of lines) {
    if (line.length >= 12 && line.length <= 50 && !isAIThinkingText(line)) {
      for (const pattern of validDescPatterns) {
        if (pattern.test(line)) {
          return line.replace(/^[，,、：:]\s*/, '').replace(/[，,、：:]$/, '');
        }
      }
    }
  }
  
  for (const line of lines) {
    const cleanLine = line
      .replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '')
      .replace(/^[，,、：:]\s*/, '')
      .trim();
    
    if (cleanLine.length >= 15 && cleanLine.length <= 45 && !isAIThinkingText(cleanLine)) {
      const hasProductWord = /(?:平台|工具|服务|系统|助手|网站|应用|软件)/.test(cleanLine);
      const hasActionWord = /(?:提供|支持|帮助|实现|打造|构建|管理|开发|设计)/.test(cleanLine);
      const noQuestionMark = !/[？?]/.test(cleanLine);
      
      if (hasProductWord && hasActionWord && noQuestionMark) {
        return cleanLine;
      }
    }
  }
  
  return null;
}

function cleanDescription(text) {
  if (!text) return '';
  
  let processed = stripThoughtTags(text);
  
  if (isAIThinkingText(processed)) {
    const extracted = extractUsefulDescription(processed);
    if (extracted) {
      console.log('Extracted useful description from thinking text:', extracted);
      processed = extracted;
    } else {
      console.warn('Detected AI thinking text, failed to extract useful content:', processed.substring(0, 80));
      return '';
    }
  }
  
  let cleaned = processed
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '')
    .replace(/^(描述[：:]\s*|简介[：:]\s*|网站描述[：:]\s*|Description[：:]\s*)/i, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[。.]+$/, '');
  
  return cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned;
}



// ==================== API 路由 ====================

// 公开接口：获取 AI 状态（无需认证，仅返回是否可用）
router.get('/status', async (req, res) => {
  try {
    const config = await db.getAIConfig();
    res.json({
      success: true,
      data: {
        available: !!(config && config.apiKey),
        provider: config?.provider || null
      }
    });
  } catch (error) {
    res.json({ success: false, data: { available: false } });
  }
});

// 获取 AI 配置
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const { provider } = req.query;
    const config = await db.getAIConfig(provider);
    res.json({
      success: true,
        config: {
          provider: config.provider || 'deepseek',
          hasApiKey: !!config.apiKey,
          baseUrl: config.baseUrl || '',
          model: config.model || '',
          requestDelay: parseInt(config.requestDelay) || 1500,
          autoGenerate: config.autoGenerate === 'true' || config.autoGenerate === true,
          lastTestedOk: config.lastTestedOk === 'true' || config.lastTestedOk === true
        }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取配置失败' });
  }
});

// 验证 AI 配置（用于备份恢复后检查加密密钥是否一致）
router.get('/config/verify', authMiddleware, async (req, res) => {
  try {
    const config = await db.getAIConfig();
    if (!config.apiKey) {
      return res.json({ success: true, status: 'not_configured' });
    }
    
    try {
      const encrypted = JSON.parse(config.apiKey);
      const decrypted = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
      if (decrypted) {
        return res.json({ success: true, status: 'ok' });
      }
    } catch (e) {
      return res.json({ success: true, status: 'decrypt_failed', message: 'API Key 解密失败' });
    }
    
    res.json({ success: true, status: 'decrypt_failed' });
  } catch (error) {
    res.status(500).json({ success: false, message: '验证配置失败' });
  }
});

// 保存 AI 配置
router.post('/config', authMiddleware, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model, requestDelay, autoGenerate, lastTestedOk } = req.body;
    
    if (!provider || !AI_PROVIDERS[provider]) {
      return res.status(400).json({ success: false, message: '无效的 AI 提供商' });
    }
    
    const providerConfig = AI_PROVIDERS[provider];
    
    if (providerConfig.needsApiKey && !apiKey) {
      const existingConfig = await db.getAIConfig();
      if (!existingConfig.apiKey) {
        return res.status(400).json({ success: false, message: 'API Key 不能为空' });
      }
    }
    
    if (providerConfig.needsBaseUrl && !baseUrl) {
      return res.status(400).json({ success: false, message: 'Base URL 不能为空' });
    }
    
    let encryptedApiKey = undefined; // 使用 undefined 触发 db.saveAIConfig 的跳过逻辑
    if (apiKey && apiKey !== '••••••') {
      const encrypted = encrypt(apiKey);
      encryptedApiKey = JSON.stringify(encrypted);
    }
    
    await db.saveAIConfig({
      provider,
      apiKey: encryptedApiKey,
      baseUrl: baseUrl || '',
      model: model || '',
      requestDelay: Math.max(500, Math.min(10000, requestDelay || 1500)),
      autoGenerate: autoGenerate ? 'true' : 'false',
      lastTestedOk: lastTestedOk ? 'true' : 'false'
    });
    
    res.json({ success: true, message: '配置保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存配置失败' });
  }
});

// 清除 AI 配置
router.delete('/config', authMiddleware, async (req, res) => {
  try {
    await db.clearAIConfig();
    res.json({ success: true, message: 'AI 配置已清除' });
  } catch (error) {
    res.status(500).json({ success: false, message: '清除配置失败' });
  }
});

// 测试 AI 连接
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model } = req.body;
    
    // 1. 获取基础配置
    let config;
    if (provider) {
      // 如果提供了 provider，说明用户可能在尝试新配置
      const savedConfig = await db.getAIConfig();
      
      // 处理 API Key
      let actualApiKey = apiKey;
      if (!apiKey || apiKey === '••••••') {
        // 如果未提供新 Key 或提供的是掩码，且 provider 没变，则使用数据库中的 Key
        if (provider === savedConfig.provider && savedConfig.apiKey) {
          try {
            const encrypted = JSON.parse(savedConfig.apiKey);
            actualApiKey = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
          } catch (e) {
            actualApiKey = savedConfig.apiKey; // 兼容旧数据
          }
        }
      }

      config = {
        provider,
        apiKey: actualApiKey,
        baseUrl: baseUrl || '',
        model: model || ''
      };
    } else {
      // 否则使用已保存的完整配置
      config = await getDecryptedAIConfig();
    }

    // 2. 验证配置
    const validation = validateAIConfig(config);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    // 3. 执行智能测试请求
    const originalBaseUrl = config.baseUrl;
    const probeResult = await probeBaseUrl(config);
    
    if (probeResult.success) {
      // 如果探测返回 401/403，说明 URL 可达但 API Key 无效
      if (probeResult.status === 401 || probeResult.status === 403) {
        await db.saveAIConfig({ lastTestedOk: 'false' });
        return res.status(401).json({
          success: false,
          message: 'Base URL 连接成功，但 API Key 无效或已过期，请检查并重新配置'
        });
      }

      // 测试成功，持久化状态
      await db.saveAIConfig({ lastTestedOk: 'true' });
      
      const resData = { 
        success: true, 
        responseTime: probeResult.responseTime
      };

      // 如果探测出的 working baseUrl 与用户提供的不一致，返回建议
      if (probeResult.baseUrl && probeResult.baseUrl !== originalBaseUrl.replace(/\/+$/, '')) {
        resData.suggestedBaseUrl = probeResult.baseUrl;
      }

      res.json(resData);
    } else {
      throw new Error(probeResult.error || '所有补全方式均无法连接');
    }
  } catch (error) {
    console.error('AI Test Connection Error:', error);
    // 测试失败，持久化状态
    await db.saveAIConfig({ lastTestedOk: 'false' });
    res.status(500).json({ 
      success: false, 
      message: error.message || '连接失败' 
    });
  }
});

// 获取所有统计信息 (优化后的接口)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [nameCards, descCards, allCards] = await Promise.all([
      db.getCardsNeedingAI('name'),
      db.getCardsNeedingAI('description'),
      db.getAllCards()
    ]);
    res.json({
      success: true,
      stats: {
        emptyName: nameCards.length,
        emptyDesc: descCards.length,
        total: allCards.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取统计失败' });
  }
});

// 旧版统计接口 (兼容)
router.get('/empty-cards', authMiddleware, async (req, res) => {
  try {
    const { type, mode } = req.query;
    if (mode === 'all') {
      const cards = await db.getAllCards();
      return res.json({ success: true, cards, total: cards.length });
    }
    const cards = await db.getCardsNeedingAI(type || 'both');
    res.json({ success: true, cards, total: cards.length });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取数据失败' });
  }
});

// 高级筛选卡片
router.post('/filter-cards', authMiddleware, async (req, res) => {
  try {
    const { status = [], menuIds = [], subMenuIds = [] } = req.body;
    const cards = await db.filterCardsForAI({ status, menuIds, subMenuIds });
    res.json({ success: true, cards, total: cards.length });
  } catch (error) {
    res.status(500).json({ success: false, message: '筛选失败' });
  }
});

// AI 预览生成（不保存，仅展示 AI 将生成的内容）
router.post('/preview', authMiddleware, async (req, res) => {
  try {
    const { cardIds, types = ['name', 'description'], strategy = {} } = req.body;
    if (!cardIds?.length) return res.status(400).json({ success: false, message: '请选择卡片' });
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    
    const cards = await db.getCardsByIds(cardIds);

    // 并行抓取所有卡片的元数据（减少总耗时，避免串行累积超时）
    const metadataResults = await Promise.allSettled(
      cards.map(card => fetchMetadata(card.url))
    );
    const metadataMap = new Map();
    cards.forEach((card, i) => {
      if (metadataResults[i].status === 'fulfilled') {
        metadataMap.set(card.id, metadataResults[i].value);
      }
    });

    const previews = [];

    for (const card of cards) {
      const preview = { cardId: card.id, title: card.title, url: card.url, fields: {} };

      // 使用预抓取的元数据（失败为 null，不影响预览）
      const previewMetadata = metadataMap.get(card.id) || null;

      // 预览时强制使用 overwrite 模式，确保总是展示 AI 将生成的内容
      const previewStrategy = { ...strategy, mode: 'overwrite' };

      for (const type of types) {
        try {
          // 直接调用 AI 生成，但不保存到数据库
          let generated = null;

          if (type === 'name') {
            const prompt = buildPromptWithStrategy(buildNamePrompt(card, previewMetadata), previewStrategy);
            const aiResponse = await callAI(config, prompt);
            generated = cleanName(aiResponse);
            preview.fields.name = { original: card.title || '', generated };
          } else if (type === 'description') {
            const prompt = buildPromptWithStrategy(buildDescriptionPrompt(card, previewMetadata), previewStrategy);
            const aiResponse = await callAI(config, prompt);
            generated = cleanDescription(aiResponse);
            preview.fields.description = { original: card.desc || '', generated };
          }
        } catch (e) {
          preview.fields[type] = { original: '', generated: '', error: e.message };
        }
      }
      previews.push(preview);
    }
    res.json({ success: true, previews });
  } catch (error) {
    res.status(500).json({ success: false, message: '预览失败: ' + error.message });
  }
});

// 单个卡片生成并保存
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { type, card } = req.body;
    if (!type || !card?.url) return res.status(400).json({ success: false, message: '参数不完整' });
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    
    const types = type === 'all' ? ['name', 'description'] : type === 'both' ? ['name', 'description'] : [type];
    const { updated, data, unchanged } = await generateCardFields(config, card, types, { mode: 'overwrite' });
    
    res.json({ success: true, ...data, unchanged });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 批量任务 API ====================

router.get('/batch-task/status', authMiddleware, (req, res) => {
  res.json({ success: true, ...taskManager.getStatus() });
});

router.get('/batch-task/stream', authMiddleware, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(taskManager.getStatus())}\n\n`);
  if (res.flush) res.flush();

  const onUpdate = (status) => {
    res.write(`data: ${JSON.stringify(status)}\n\n`);
    if (res.flush) res.flush();
  };
  taskManager.on('update', onUpdate);
  req.on('close', () => taskManager.removeListener('update', onUpdate));
});

router.post('/batch-task/start', authMiddleware, async (req, res) => {
  try {
    const { type, mode, cardIds, types, strategy } = req.body;
    if (taskManager.isRunning()) return res.status(409).json({ success: false, message: '已有任务运行中' });
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    
    let cards;
    let taskTypes;
    let taskStrategy = strategy || {};
    
    if (cardIds?.length) {
      cards = await db.getCardsByIds(cardIds);
      taskTypes = types || ['name', 'description'];
      taskStrategy.mode = taskStrategy.mode || 'fill';
    } else if (type && mode) {
      taskTypes = type === 'all' ? ['name', 'description'] : [type];
      cards = mode === 'all' ? await db.getAllCards() : await db.getCardsNeedingAI(type === 'all' ? 'both' : type);
      taskStrategy.mode = mode === 'all' ? 'overwrite' : 'fill';
    } else {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    if (!cards?.length) return res.json({ success: true, message: '没有卡片', total: 0 });
    const result = await taskManager.start(config, cards, taskTypes, taskStrategy);
    res.json({ success: true, total: result.total, types: taskTypes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/batch-task/stop', authMiddleware, (req, res) => {
  taskManager.stop();
  res.json({ success: true });
});

// ==================== 辅助逻辑 ====================

function buildPromptWithStrategy(basePrompt, strategy = {}) {
  if (!strategy.style || strategy.style === 'default') return basePrompt;
  const styleHints = { concise: '简洁', professional: '专业', friendly: '友好', seo: 'SEO 优化' };
  if (styleHints[strategy.style] && basePrompt[0]?.role === 'system') {
    basePrompt[0].content += `\n风格要求：${styleHints[strategy.style]}`;
  }
  if (strategy.customPrompt && basePrompt[0]?.role === 'system') {
    basePrompt[0].content += `\n额外要求：${strategy.customPrompt}`;
  }
  return basePrompt;
}

// 自动生成供外部调用
async function autoGenerateForCards(cardIds) {
  const { triggerDebouncedBackup } = require('../utils/autoBackup');
  try {
    const rawConfig = await db.getAIConfig();
    if (rawConfig.autoGenerate !== 'true') return;
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) return;
    
    const delay = Math.max(500, parseInt(rawConfig.requestDelay) || 1500);
    let hasUpdates = false;
    
    for (let i = 0; i < cardIds.length; i++) {
      const cards = await db.getCardsByIds([cardIds[i]]);
      if (!cards?.length) continue;
      
      const card = cards[0];
      let cardUpdated = false;
      
        // 智能策略：根据需要生成的字段数量选择方案
        const needsName = checkIsDirtyName(card.title, card.url);
        const needsDesc = checkIsDirtyDesc(card.desc, card.title, card.url);
      
      // Token优化策略：
      // - 需要 name + desc + tags (3个): 统一生成 (~350 tokens)
      // - 需要 name + desc (2个): 统一生成 name+desc，然后单独生成tags (~400 tokens)
      // - 只需要 name 或 desc (1个): 单字段生成 + tags (~300 tokens)
      // - 只需要 tags: 单独生成 (~200 tokens)
      
      if (needsName && needsDesc) {
        try {
          const { updated } = await generateCardFields(config, card, ['name', 'description'], { mode: 'fill' });
          if (updated) cardUpdated = true;
        } catch (e) {
          console.warn(`Auto-generate failed for card ${card.id}:`, e.message);
        }
      } else if (needsName || needsDesc) {
        const fieldType = needsName ? 'name' : 'description';
        try {
          const { updated } = await generateCardFields(config, card, [fieldType], { mode: 'overwrite' });
          if (updated) cardUpdated = true;
        } catch (e) {
          console.warn(`Auto-generate ${fieldType} failed for card ${card.id}:`, e.message);
        }
      }

      if (cardUpdated) hasUpdates = true;

      // 卡片间延迟
      if (i < cardIds.length - 1) await new Promise(r => setTimeout(r, delay));
    }
    if (hasUpdates) triggerDebouncedBackup();
  } catch {}
}

module.exports = router;
module.exports.autoGenerateForCards = autoGenerateForCards;
