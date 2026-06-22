// background.js - 后台服务脚本
// 用于处理右键菜单、快速添加到导航页、分类子菜单

// 缓存的菜单数据
let cachedMenus = [];
let lastMenuFetchTime = 0;
const MENU_CACHE_MS = 5 * 60 * 1000; // 5分钟缓存
let isLoadingMenus = false; // 防止并发请求
let menuRetryTimer = null; // 菜单获取重试定时器
let menuRetryAttempts = 0;
const MENU_RETRY_INTERVAL = 60 * 1000; // 1分钟重试间隔
const MAX_MENU_RETRY_ATTEMPTS = 3;

// 强制刷新限频机制（每分钟最多15次）
let forceRefreshCount = 0;
let forceRefreshResetTime = 0;
const FORCE_REFRESH_LIMIT = 15;
const TOKEN_VERIFY_CACHE_MS = 30 * 1000;
let lastTokenVerifyCache = {
    token: '',
    time: 0,
    result: null
};

function getCachedTokenVerifyResult(token) {
    if (!token || !lastTokenVerifyCache.result) return null;
    if (lastTokenVerifyCache.token !== token) return null;
    if (Date.now() - lastTokenVerifyCache.time > TOKEN_VERIFY_CACHE_MS) return null;
    return lastTokenVerifyCache.result;
}

function setCachedTokenVerifyResult(token, result) {
    lastTokenVerifyCache = {
        token: token || '',
        time: Date.now(),
        result
    };
}

function clearTokenVerifyCache() {
    lastTokenVerifyCache = {
        token: '',
        time: 0,
        result: null
    };
}

function isAccessibleStatus(status) {
    return status >= 200 && status < 400;
}

function isRetryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isManualReviewStatus(status) {
    return [401, 403, 405, 406, 409, 421, 451, 468].includes(status);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isCloudflareChallenge(response, bodyText = '') {
    const server = (response.headers.get('server') || '').toLowerCase();
    const cfRay = response.headers.get('cf-ray');
    const text = String(bodyText || '').toLowerCase();

    if (cfRay) return true;
    if (server.includes('cloudflare') && response.status >= 400) return true;

    return [
        'attention required! | cloudflare',
        'just a moment...',
        'checking your browser before accessing',
        '/cdn-cgi/challenge-platform/',
        'cf-browser-verification',
        'cf-chl-',
        '__cf_bm'
    ].some(marker => text.includes(marker));
}

async function readResponseTextSafe(response) {
    try {
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return '';
        return await response.text();
    } catch {
        return '';
    }
}

async function checkUrlFromExtension(card) {
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

    const tryFetch = async (method) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            return await fetch(url, {
                method,
                redirect: 'follow',
                cache: 'no-store',
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const tryFetchRoot = async () => {
        const rootUrl = `${parsedUrl.origin}/`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            return await fetch(rootUrl, {
                method: 'GET',
                redirect: 'follow',
                cache: 'no-store',
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const tryFetchHttpRoot = async () => {
        if (parsedUrl.protocol !== 'https:') return null;
        const httpUrl = `http://${parsedUrl.host}/`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            return await fetch(httpUrl, {
                method: 'GET',
                redirect: 'manual',
                cache: 'no-store',
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }
    };

    try {
        let response;
        let usedHead = true;
        try {
            response = await tryFetch('HEAD');
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            usedHead = false;
            response = await tryFetch('GET');
        }

        const status = response.status;
        if (isAccessibleStatus(status)) {
            return { id, title, url, menuName, subMenuName, bucket: 'valid', reason: '访问正常', detail: `HTTP ${status}`, statusCode: status };
        }
        if (status === 404 || status === 410) {
            try {
                const confirmResponse = usedHead ? await tryFetch('GET') : response;
                const confirmStatus = confirmResponse.status;
                if (isAccessibleStatus(confirmStatus)) {
                    return { id, title, url, menuName, subMenuName, bucket: 'valid', reason: '访问正常', detail: `HEAD ${status}，GET 确认恢复为 HTTP ${confirmStatus}`, statusCode: confirmStatus };
                }
                if (confirmStatus === 404 || confirmStatus === 410) {
                    return { id, title, url, menuName, subMenuName, bucket: 'safe_to_delete', reason: confirmStatus === 404 ? '页面不存在' : '页面已永久删除', detail: `HEAD/GET 均确认 HTTP ${confirmStatus}`, statusCode: confirmStatus };
                }
                return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', reason: `HTTP ${confirmStatus}`, detail: `HEAD ${status}，GET 返回 ${confirmStatus}`, statusCode: confirmStatus };
            } catch (error) {
                if (error.name === 'AbortError') {
                    return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', reason: '连接超时', detail: 'GET 二次确认超时', statusCode: null };
                }
            }
        }

        if (status === 403 || status === 429) {
            try {
                const getResponse = usedHead ? await tryFetch('GET') : response;
                const bodyText = await readResponseTextSafe(getResponse.clone());
                if (isCloudflareChallenge(getResponse, bodyText)) {
                    return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'cloudflare', reason: 'Cloudflare 人机验证', detail: `HTTP ${getResponse.status}，需要人工验证`, statusCode: getResponse.status };
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'unreachable', reason: '连接超时', detail: 'GET 二次确认超时', statusCode: null };
                }
            }
        }

        if (isRetryableStatus(status)) {
            await delay(600);
            try {
                const retryResponse = await tryFetch('GET');
                const rs = retryResponse.status;
                const retryBody = await readResponseTextSafe(retryResponse.clone());
                if (isCloudflareChallenge(retryResponse, retryBody)) {
                    return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'cloudflare', reason: 'Cloudflare 人机验证', detail: `重试后命中 Cloudflare 验证页，HTTP ${rs}`, statusCode: rs };
                }
                if (isAccessibleStatus(rs)) {
                    return { id, title, url, menuName, subMenuName, bucket: 'valid', reason: '访问正常', detail: `重试后恢复，HTTP ${rs}`, statusCode: rs };
                }
                if (rs === 404 || rs === 410) {
                    return { id, title, url, menuName, subMenuName, bucket: 'safe_to_delete', reason: rs === 404 ? '页面不存在' : '页面已永久删除', detail: `重试后确认，HTTP ${rs}`, statusCode: rs };
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'unreachable', reason: '连接超时', detail: '15秒内未响应', statusCode: null };
                }
            }
        }

        if (isManualReviewStatus(status)) {
            return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'manual_review', reason: `HTTP ${status}`, detail: '站点返回了登录/拦截/自定义保护状态，建议人工确认', statusCode: status };
        }

        try {
            const rootResponse = await tryFetchRoot();
            const rootBody = await readResponseTextSafe(rootResponse.clone());

            if (isCloudflareChallenge(rootResponse, rootBody)) {
                return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'cloudflare', reason: 'Cloudflare 人机验证', detail: `目标链接无法直接确认，站点根路径命中 Cloudflare 验证，HTTP ${rootResponse.status}`, statusCode: rootResponse.status };
            }

            if (isAccessibleStatus(rootResponse.status)) {
                return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'manual_review', reason: `HTTP ${status}`, detail: `站点根路径可访问（HTTP ${rootResponse.status}），但当前链接异常，建议人工验证`, statusCode: status };
            }

            if (isManualReviewStatus(rootResponse.status)) {
                return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'manual_review', reason: `HTTP ${status}`, detail: `站点根路径返回保护/登录状态（HTTP ${rootResponse.status}），建议人工验证`, statusCode: status };
            }

            return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'unreachable', reason: `HTTP ${status}`, detail: `站点根路径也异常（HTTP ${rootResponse.status}）`, statusCode: status };
        } catch (error) {
            if (error.name === 'AbortError') {
                return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'unreachable', reason: '连接超时', detail: '站点根路径复测超时', statusCode: null };
            }
        }

        return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'unreachable', reason: `HTTP ${status}`, detail: '服务器返回错误状态码', statusCode: status };
    } catch (error) {
        if (error.name === 'AbortError') {
            return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'unreachable', reason: '连接超时', detail: '15秒内未响应', statusCode: null };
        }

        try {
            const httpRootResponse = await tryFetchHttpRoot();
            if (httpRootResponse) {
                const location = httpRootResponse.headers.get('location') || '';
                if ((httpRootResponse.status === 301 || httpRootResponse.status === 302 || httpRootResponse.status === 307 || httpRootResponse.status === 308) && /^https:/i.test(location)) {
                    return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'manual_review', reason: '证书/TLS 异常', detail: `HTTP 可正常跳转到 HTTPS（${httpRootResponse.status} -> ${location}），但 HTTPS 握手失败，可能是证书过期或 TLS 配置异常`, statusCode: httpRootResponse.status };
                }
                return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'manual_review', reason: 'HTTPS 异常', detail: `HTTPS 访问失败，但 HTTP 根路径返回了 ${httpRootResponse.status}，可能是证书或握手问题`, statusCode: httpRootResponse.status };
            }
        } catch {
            // ignore
        }

        const message = error.message || '网络错误';
        if (parsedUrl.protocol === 'https:' && /failed to fetch|networkerror|load failed/i.test(message)) {
            return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'manual_review', reason: 'HTTPS 异常', detail: '浏览器/扩展无法完成 HTTPS 握手，可能是证书、TLS 或安全拦截问题，建议人工确认', statusCode: null };
        }

        return { id, title, url, menuName, subMenuName, bucket: 'maybe_invalid', subtype: 'unreachable', reason: '无法连接', detail: message, statusCode: null };
    }
}

async function scanInvalidLinksFromExtension(cards, concurrency = 8) {
    const mergedSafe = [];
    const mergedMaybe = [];
    const mergedSkipped = [];
    let cursor = 0;

    async function worker() {
        while (cursor < cards.length) {
            const currentIndex = cursor;
            cursor += 1;
            const result = await checkUrlFromExtension(cards[currentIndex]);
            if (result.bucket === 'safe_to_delete') mergedSafe.push(result);
            else if (result.bucket === 'maybe_invalid') mergedMaybe.push(result);
            else if (result.bucket === 'skipped') mergedSkipped.push(result);
        }
    }

    const workerCount = Math.min(Math.max(Number(concurrency) || 8, 1), cards.length || 1);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return {
        scannedAt: new Date().toISOString(),
        total: cards.length,
        safeToDelete: mergedSafe.sort((a, b) => b.id - a.id),
        maybeInvalid: mergedMaybe.sort((a, b) => b.id - a.id),
        skipped: mergedSkipped.sort((a, b) => b.id - a.id)
    };
}
const FORCE_REFRESH_WINDOW = 60 * 1000; // 1分钟

function canForceRefresh() {
    const now = Date.now();
    if (now - forceRefreshResetTime > FORCE_REFRESH_WINDOW) {
        forceRefreshCount = 0;
        forceRefreshResetTime = now;
    }
    if (forceRefreshCount >= FORCE_REFRESH_LIMIT) {
        console.log('[导航站扩展] 强制刷新已达上限，使用缓存');
        return false;
    }
    forceRefreshCount++;
    return true;
}

// 数据同步相关（混合策略：Alarms 定期轮询 + 用户交互时立即检查）
let lastDataVersion = 0;
const DATA_SYNC_ALARM = 'nav_data_sync_check';
const DATA_SYNC_INTERVAL_MINUTES = 5; // 5分钟定期检查（作为兜底）
let lastInteractionSyncCheck = 0;
const INTERACTION_SYNC_DEBOUNCE_MS = 30 * 1000;

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(async () => {
    await registerContextMenus();
    startMenuRetryIfNeeded();
    initDataSyncPolling();
    const config = await loadAutoBackupConfig();
    if (config.enabled) {
        initScheduledBackupTimer();
    }
});

// 扩展启动时初始化
chrome.runtime.onStartup.addListener(async () => {
    await registerContextMenus();
    startMenuRetryIfNeeded();
    initDataSyncPolling();
    const config = await loadAutoBackupConfig();
    if (config.enabled) {
        initScheduledBackupTimer();
    }
});

// 初始化数据同步轮询（使用 chrome.alarms，即使 Service Worker 被挂起也能工作）
async function initDataSyncPolling() {
    try {
        // 清除旧的 alarm
        await chrome.alarms.clear(DATA_SYNC_ALARM);
        
        // 创建新的定期 alarm（作为兜底机制）
        chrome.alarms.create(DATA_SYNC_ALARM, {
            delayInMinutes: 1,
            periodInMinutes: DATA_SYNC_INTERVAL_MINUTES
        });
        
        console.log('[导航站扩展] 已启动数据同步轮询（每5分钟检查一次）');
    } catch (e) {
        console.error('[导航站扩展] 初始化数据同步失败:', e);
    }
}

// 当用户展示右键菜单时，立即检查版本更新（关键：用户交互时触发）
chrome.contextMenus.onShown?.addListener(async (info, tab) => {
    const now = Date.now();
    if (now - lastInteractionSyncCheck < INTERACTION_SYNC_DEBOUNCE_MS) {
        return;
    }
    lastInteractionSyncCheck = now;
    await checkDataVersionAndSync();
});

// 监听 alarm 事件
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === DATA_SYNC_ALARM) {
        await checkDataVersionAndSync();
    }
});

// 检查数据版本并同步
async function checkDataVersionAndSync(forceRefresh = false) {
    try {
        const config = await chrome.storage.sync.get(['navUrl']);
        if (!config.navUrl) return false;

        const navServerUrl = config.navUrl.replace(/\/$/, '');
        
        // 获取当前版本号
        const response = await fetch(`${navServerUrl}/api/sse/version?_t=${Date.now()}`, {
            cache: 'no-store'
        });
        
        if (!response.ok) return false;
        
        const data = await response.json();
        const newVersion = data.version;
        
        // 首次获取版本号时只记录，不刷新
        if (lastDataVersion === 0) {
            lastDataVersion = newVersion;
            console.log('[导航站扩展] 初始数据版本:', newVersion);
            return false;
        }
        
        // 版本号变化，触发刷新
        if (newVersion !== lastDataVersion || forceRefresh) {
            console.log(`[导航站扩展] 数据版本变更: ${lastDataVersion} -> ${newVersion}，正在刷新菜单...`);
            lastDataVersion = newVersion;
            await refreshCategoryMenus();
            return true;
        }
        return false;
    } catch (e) {
        // 网络错误时静默失败，等待下次轮询
        console.debug('[导航站扩展] 检查版本失败:', e.message);
        return false;
    }
}

// 当缓存为空时，定期尝试获取菜单数据
function startMenuRetryIfNeeded() {
    // 如果已有定时器，不重复创建
    if (menuRetryTimer) return;
    
    // 如果缓存不为空，不需要重试
    if (cachedMenus.length > 0 || menuRetryAttempts >= MAX_MENU_RETRY_ATTEMPTS) return;
    
    console.log('[导航站扩展] 菜单缓存为空，启动定期重试...');
    
    menuRetryTimer = setTimeout(async () => {
        menuRetryTimer = null;

        if (cachedMenus.length > 0) {
            console.log('[导航站扩展] 菜单获取成功，停止重试');
            return;
        }

        menuRetryAttempts++;
        console.log(`[导航站扩展] 第 ${menuRetryAttempts} 次尝试获取菜单数据...`);
        await refreshCategoryMenus();

        if (cachedMenus.length === 0) {
            startMenuRetryIfNeeded();
        }
    }, MENU_RETRY_INTERVAL);
}

// 注册基础右键菜单（简化为单入口，点击后打开快速添加弹窗）
async function registerContextMenus() {
    try {
        await chrome.contextMenus.removeAll();
        
        // 只保留一个入口，点击后打开快速添加弹窗
        chrome.contextMenus.create({
            id: 'nav_quick_dialog',
            title: '🚀 SmartNavora - 新标签页',
            contexts: ['page', 'link']
        });
        
    } catch (e) {
        console.error('注册右键菜单失败:', e);
    }
}

// 加载分类并创建子菜单
async function loadAndCreateCategoryMenus() {
    try {
        const config = await chrome.storage.sync.get(['navUrl']);
        if (!config.navUrl) {
            console.warn('未配置导航站地址，跳过加载分类菜单');
            return;
        }
        
        const navServerUrl = config.navUrl.replace(/\/$/, '');
        
        // 检查缓存
        if (cachedMenus.length > 0 && Date.now() - lastMenuFetchTime < MENU_CACHE_MS) {
            createCategorySubMenus(cachedMenus);
            return;
        }
        
        // 防止并发请求
        if (isLoadingMenus) {
            return;
        }
        
        isLoadingMenus = true;
        
        // 获取菜单数据（带超时）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
        
        try {
            // 添加时间戳参数绕过浏览器缓存
            const response = await fetch(`${navServerUrl}/api/menus?_t=${Date.now()}`, {
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const menus = await response.json();
            
            // 验证数据格式
            if (!Array.isArray(menus)) {
                throw new Error('菜单数据格式错误');
            }
            
            cachedMenus = menus;
            lastMenuFetchTime = Date.now();
            menuRetryAttempts = 0;
            
            // 成功获取菜单后，停止重试定时器
            if (menuRetryTimer) {
                clearTimeout(menuRetryTimer);
                menuRetryTimer = null;
                console.log('[导航站扩展] 菜单获取成功，已停止重试');
            }
            
            // 持久化缓存到storage（离线可用）
            await chrome.storage.local.set({ 
                cachedMenus: menus,
                lastMenuFetchTime: Date.now()
            });
            
            createCategorySubMenus(menus);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            // 如果网络失败，尝试从storage加载缓存
            if (cachedMenus.length === 0) {
                const stored = await chrome.storage.local.get(['cachedMenus', 'lastMenuFetchTime']);
                if (stored.cachedMenus && Array.isArray(stored.cachedMenus)) {
                    cachedMenus = stored.cachedMenus;
                    lastMenuFetchTime = stored.lastMenuFetchTime || 0;
                    menuRetryAttempts = 0;
                    createCategorySubMenus(cachedMenus);
                    return;
                }
            }
            
            throw fetchError;
        }
    } catch (e) {
        console.error('加载分类菜单失败:', e.message);
        // 即使失败也创建基础菜单，保证功能可用
    } finally {
        isLoadingMenus = false;
    }
}

// 创建分类子菜单
function createCategorySubMenus(menus) {
    if (!menus || menus.length === 0) {
        console.warn('没有可用的分类菜单');
        return;
    }
    
    // 最多显示12个常用分类
    const topMenus = menus.slice(0, 12);
    
    topMenus.forEach((menu) => {
        try {
            // 如果有子分类，创建父级菜单（可展开）
            if (menu.subMenus && Array.isArray(menu.subMenus) && menu.subMenus.length > 0) {
                // 创建主分类作为父级
                chrome.contextMenus.create({
                    id: `nav_menu_parent_${menu.id}`,
                    parentId: 'nav_category_parent',
                    title: menu.name || '未命名分类',
                    contexts: ['page', 'link']
                });
                
                // 添加"添加到主菜单（不选子分类）"选项
                chrome.contextMenus.create({
                    id: `nav_menu_${menu.id}`,
                    parentId: `nav_menu_parent_${menu.id}`,
                    title: `📁 ${menu.name}（主菜单）`,
                    contexts: ['page', 'link']
                });
                
                // 添加分隔线
                chrome.contextMenus.create({
                    id: `nav_sep_${menu.id}`,
                    parentId: `nav_menu_parent_${menu.id}`,
                    type: 'separator',
                    contexts: ['page', 'link']
                });
                
                // 创建子菜单选项（最多显示8个）
                menu.subMenus.slice(0, 8).forEach(subMenu => {
                    chrome.contextMenus.create({
                        id: `nav_submenu_${menu.id}_${subMenu.id}`,
                        parentId: `nav_menu_parent_${menu.id}`,
                        title: `📄 ${subMenu.name || '未命名子分类'}`,
                        contexts: ['page', 'link']
                    });
                });
            } else {
                // 没有子分类，直接作为可点击的菜单项
                chrome.contextMenus.create({
                    id: `nav_menu_${menu.id}`,
                    parentId: 'nav_category_parent',
                    title: menu.name || '未命名分类',
                    contexts: ['page', 'link']
                });
            }
        } catch (e) {
            console.error(`创建菜单项失败 (${menu.name}):`, e.message);
        }
    });
}

// 刷新分类菜单
async function refreshCategoryMenus() {
    try {
        const config = await chrome.storage.sync.get(['navUrl']);
        if (!config.navUrl) return;
        
        // 强制清空所有缓存
        lastMenuFetchTime = 0;
        cachedMenus = [];
        await chrome.storage.local.remove(['cachedMenus', 'lastMenuFetchTime']);
        
        // 重新注册所有菜单（会自动获取最新数据）
        await registerContextMenus();
    } catch (e) {
        console.error('刷新分类菜单失败:', e);
    }
}

// 处理右键菜单点击（打开快速添加弹窗）
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        let url = info.linkUrl || tab?.url || info.pageUrl;
        let title = info.linkText || tab?.title || '';
        const tabId = tab?.id;
        
        if (!url) {
            console.warn('无法获取URL');
            return;
        }
        
        // 过滤特殊协议
        if (url.startsWith('chrome://') || url.startsWith('edge://') || 
            url.startsWith('about:') || url.startsWith('chrome-extension://')) {
            showNotification('无法添加', '不支持添加浏览器内部页面');
            return;
        }
        
        // 打开快速添加弹窗
        if (info.menuItemId === 'nav_quick_dialog') {
            // 先尝试注入 content script（如果尚未注入）
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                });
            } catch (e) {
                // 注入失败（可能已注入或页面不支持），忽略
            }
            
            // 稍等一下确保 content script 已加载
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 发送消息给 content script 打开弹窗
            try {
                await chrome.tabs.sendMessage(tabId, {
                    type: 'openQuickAddDialog',
                    url: url,
                    title: title
                });
            } catch (e) {
                // content script 可能未加载，打开备用页面
                console.warn('无法打开弹窗，使用备用方式:', e.message);
                const bookmarksUrl = chrome.runtime.getURL('bookmarks.html') + 
                    `?addToNav=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
                chrome.tabs.create({ url: bookmarksUrl });
            }
            return;
        }
    } catch (e) {
        console.error('处理右键菜单失败:', e);
        showNotification('操作失败', e.message || '请稍后重试');
    }
});

// 添加到指定分类
async function addToSpecificCategory(menuItemId, url, title, tabId = null, section = '') {
    try {
        let menuId, subMenuId = null;
        
        if (menuItemId.startsWith('nav_submenu_')) {
            // nav_submenu_menuId_subMenuId
            const parts = menuItemId.replace('nav_submenu_', '').split('_');
            menuId = parseInt(parts[0]);
            subMenuId = parseInt(parts[1]);
        } else {
            // nav_menu_menuId
            menuId = parseInt(menuItemId.replace('nav_menu_', ''));
        }
        
        const config = await chrome.storage.sync.get(['navUrl']);
        const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
        
        if (!config.navUrl) {
          throw { needAuth: false, error: '请先配置导航站地址' };
        }
        
      if (!token) {
        throw { needAuth: true, error: '需要登录' };
      }
        
        const navServerUrl = config.navUrl.replace(/\/$/, '');
        
        // 构建卡片数据（包含自动生成的描述）
        const card = await buildCardData(url, title, tabId);
        if (section) card.section = section;

        const response = await fetch(`${navServerUrl}/api/batch/add`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                menu_id: menuId,
                sub_menu_id: subMenuId,
                cards: [card]
            })
        });
        
        if (!response.ok) {
      if (response.status === 401) {
          await chrome.storage.local.remove(['navAuthToken']);
          throw { needAuth: true, error: '登录已过期' };
        }
            throw new Error('添加失败');
        }
        
        const result = await response.json();
        
        // 保存为上次使用的分类
        await chrome.storage.sync.set({ lastMenuId: menuId.toString(), lastSubMenuId: subMenuId?.toString() || '' });
        
      if (result.added > 0) {
          showNotification('添加成功', `已添加到导航页`);
          return { success: true, added: result.added };
        } else if (result.skipped > 0) {
          showNotification('已跳过', '该网站已存在于导航页');
          return { success: true, skipped: result.skipped };
        }
        
        return { success: true };
  } catch (e) {
        console.error('添加到分类失败:', e);
        if (e.needAuth !== undefined) {
          throw e;
        }
        showNotification('添加失败', e.message);
        throw e;
    }
}

// 快速添加（使用上次分类）
async function quickAddToNav(url, title, tabId = null) {
    try {
        const config = await chrome.storage.sync.get(['navUrl', 'lastMenuId', 'lastSubMenuId']);
        const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
        
        if (!config.navUrl || !config.lastMenuId) {
            throw { needAuth: false, error: '请先添加一次书签以设置默认分类' };
        }
        
        if (!token) {
            throw { needAuth: true, error: '需要登录' };
        }
        
        const navServerUrl = config.navUrl.replace(/\/$/, '');
        
        // 构建卡片数据（包含自动生成的描述）
        const card = await buildCardData(url, title, tabId);
        
        const response = await fetch(`${navServerUrl}/api/batch/add`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                menu_id: parseInt(config.lastMenuId),
                sub_menu_id: config.lastSubMenuId ? parseInt(config.lastSubMenuId) : null,
                cards: [card]
            })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                await chrome.storage.local.remove(['navAuthToken']);
                throw { needAuth: true, error: '登录已过期' };
            }
            throw new Error('添加失败');
        }
        
        const result = await response.json();
        
        if (result.added > 0) {
            showNotification('添加成功', `已添加 "${card.title}" 到导航页`);
            return { success: true, added: result.added };
        } else if (result.skipped > 0) {
            showNotification('已跳过', '该网站已存在于导航页');
            return { success: true, skipped: result.skipped };
        }
        return { success: true };
    } catch (e) {
        console.error('快速添加失败:', e);
        if (e.needAuth !== undefined) {
            throw e;
        }
        showNotification('添加失败', e.message);
        throw e;
    }
}

// 显示通知
function showNotification(title, message) {
    // 检查通知权限
    if (!chrome.notifications) {
        console.warn('通知API不可用');
        return;
    }
    
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: message,
        priority: 1
    }).catch(e => {
        console.warn('创建通知失败:', e.message);
    });
}

// ==================== 自动生成标签和描述 ====================

// 截断文本到指定长度
function truncateText(text, maxLength) {
    if (!text) return '';
    text = text.trim();
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 1) + '…';
}

// 自动生成描述
function generateDescription(title, domain) {
    if (!title && !domain) return '';
    
    let desc = '';
    if (title) {
        desc = title.replace(/[\|\-–—_]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    if (domain && !desc.toLowerCase().includes(domain.toLowerCase())) {
        desc = desc ? `${desc} - ${domain}` : domain;
    }
    
    return truncateText(desc, 100);
}

// 从当前标签页获取网页meta信息
async function getPageMetaInfo(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const getMeta = (name) => {
                    const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
                    return el ? el.getAttribute('content') : '';
                };
                return {
                    description: getMeta('description') || getMeta('og:description') || '',
                    keywords: getMeta('keywords') || '',
                    ogTitle: getMeta('og:title') || '',
                    ogType: getMeta('og:type') || '',
                    category: getMeta('category') || getMeta('article:section') || ''
                };
            }
        });
        return results[0]?.result || {};
    } catch (e) {
        console.warn('获取页面meta失败:', e);
        return {};
    }
}

// 构建卡片数据（包含自动生成的描述）
async function buildCardData(url, title, tabId = null) {
    let logo = '';
    let domain = '';
    let metaInfo = {};
    
    try {
        const urlObj = new URL(url);
        logo = `https://api.xinac.net/icon/?url=${urlObj.origin}&sz=128`;
        domain = urlObj.hostname.replace(/^www\./, '');
    } catch (e) {}
    
    // 尝试获取页面meta信息
    if (tabId) {
        metaInfo = await getPageMetaInfo(tabId);
    }
    
    const cardTitle = truncateText(title || metaInfo.ogTitle || domain || '无标题', 20);
    const description = truncateText(metaInfo.description || generateDescription(title, domain), 100);
    
    return {
        title: cardTitle,
        url,
        logo,
        description
    };
}

// 监听来自内容脚本和其他页面的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'quickAddToNav') {
        quickAddToNav(request.url, request.title)
            .then(result => sendResponse({ success: true, ...result }))
            .catch(e => {
                if (e.needAuth !== undefined) {
                    sendResponse({ success: false, needAuth: e.needAuth, error: e.error });
                } else {
                    sendResponse({ success: false, error: e.message });
                }
            });
        return true;
    }
    
    if (request.action === 'addToCategory') {
        const menuItemId = request.subMenuId 
            ? `nav_submenu_${request.menuId}_${request.subMenuId}`
            : `nav_menu_${request.menuId}`;
        addToSpecificCategory(menuItemId, request.url, request.title || document.title, null, request.section || '')
            .then(result => sendResponse({ success: true, ...result }))
            .catch(e => {
                if (e.needAuth !== undefined) {
                    sendResponse({ success: false, needAuth: e.needAuth, error: e.error });
                } else {
                    sendResponse({ success: false, error: e.message });
                }
            });
        return true;
    }

    if (request.action === 'getSections') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站' });
                    return;
                }
                const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
                const navServerUrl = config.navUrl.replace(/\/$/, '');
                const headers = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const resp = await fetch(`${navServerUrl}/api/cards/sections`, { headers });
                if (!resp.ok) {
                    sendResponse({ success: false, error: '获取分组失败' });
                    return;
                }
                const sections = await resp.json();
                sendResponse({ success: true, sections });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
    
    if (request.action === 'getMenus') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站' });
                    return;
                }
                
                const navServerUrl = config.navUrl.replace(/\/$/, '');
                
                // 强制刷新时检查限频
                const shouldForceRefresh = request.forceRefresh && canForceRefresh();
                
                // 如果缓存有效且不是强制刷新，使用缓存
                if (!shouldForceRefresh && cachedMenus.length > 0 && Date.now() - lastMenuFetchTime < MENU_CACHE_MS) {
                    sendResponse({ success: true, menus: cachedMenus, fromCache: true });
                    return;
                }
                
                // 强制刷新时清空缓存
                if (shouldForceRefresh) {
                    cachedMenus = [];
                    lastMenuFetchTime = 0;
                }
                
                // 添加时间戳参数绕过浏览器缓存
                const response = await fetch(`${navServerUrl}/api/menus?_t=${Date.now()}`, {
                    cache: 'no-store'
                });
                if (!response.ok) throw new Error('获取失败');
                
                const menus = await response.json();
                cachedMenus = menus;
                lastMenuFetchTime = Date.now();
                sendResponse({ success: true, menus });
            } catch (e) {
                // 如果请求失败但有缓存，返回缓存
                if (cachedMenus.length > 0) {
                    sendResponse({ success: true, menus: cachedMenus, fromCache: true });
                } else {
                    sendResponse({ success: false, error: e.message });
                }
            }
        })();
        return true;
    }

    if (request.action === 'getCardsForDuplicateCheck') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;

                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站' });
                    return;
                }

                if (!token) {
                    sendResponse({ success: false, needAuth: true, error: '需要登录' });
                    return;
                }

                const navServerUrl = config.navUrl.replace(/\/$/, '');
                const response = await fetch(`${navServerUrl}/api/cards?_t=${Date.now()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store'
                });

                if (response.status === 401) {
                    await chrome.storage.local.remove(['navAuthToken']);
                    sendResponse({ success: false, needAuth: true, error: '登录已过期' });
                    return;
                }

                if (!response.ok) throw new Error('获取卡片失败');

                const data = await response.json();
                const cardsByCategory = data?.cardsByCategory;
                const cards = cardsByCategory && typeof cardsByCategory === 'object'
                    ? Object.values(cardsByCategory).flat().filter(Boolean)
                    : [];
                sendResponse({ success: true, cards });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === 'refreshMenus') {
        // 同步等待刷新完成，确保无延迟
        (async () => {
            try {
                await refreshCategoryMenus();
                sendResponse({ success: true });
            } catch (e) {
                console.error('刷新菜单失败:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true; // 保持消息通道开放，等待异步响应
    }

    if (request.action === 'scanInvalidLinks') {
        (async () => {
            try {
                const result = await scanInvalidLinksFromExtension(request.cards || [], request.concurrency || 8);
                sendResponse({ success: true, ...result });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
    
    if (request.action === 'getConfig') {
        (async () => {
            const config = await chrome.storage.sync.get(['navUrl', 'lastMenuId', 'lastSubMenuId']);
            const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
            sendResponse({ ...config, hasToken: !!token });
        })();
        return true;
    }
    
    // 主动验证 Token 是否有效（密码修改后 Token 会失效）
    if (request.action === 'verifyToken') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
                
                if (!config.navUrl) {
                    sendResponse({ valid: false, reason: 'no_config' });
                    return;
                }
                
                if (!token) {
                    sendResponse({ valid: false, reason: 'no_token' });
                    return;
                }

                const cachedVerifyResult = getCachedTokenVerifyResult(token);
                if (cachedVerifyResult) {
                    sendResponse(cachedVerifyResult);
                    return;
                }
                
                const navServerUrl = config.navUrl.replace(/\/$/, '');
                
                // 调用服务器验证 Token
                const response = await fetch(`${navServerUrl}/api/extension/verify`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Cache-Control': 'no-cache'
                    }
                });
                
                const data = await response.json();
                
                if (data.valid) {
                    const result = { valid: true };
                    setCachedTokenVerifyResult(token, result);
                    sendResponse(result);
                } else {
                    // Token 无效，清除本地存储的 Token
                    await chrome.storage.local.remove(['navAuthToken']);
                    clearTokenVerifyCache();
                    sendResponse({ 
                        valid: false, 
                        reason: data.reason || 'invalid',
                        message: data.message || 'Token已失效'
                    });
                }
            } catch (e) {
                console.error('验证Token失败:', e);
                // 网络错误时不清除 Token，可能只是暂时无法连接
                sendResponse({ valid: false, reason: 'network_error', message: '网络错误' });
            }
        })();
        return true;
    }
    
    if (request.action === 'verifyAdminPassword') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站地址' });
                    return;
                }
                
                const navServerUrl = config.navUrl.replace(/\/$/, '');
                
                // 使用扩展专用登录接口，获取带 type: 'extension' 的长期Token
                const response = await fetch(`${navServerUrl}/api/extension/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: request.password })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    if (response.status === 401) {
                        sendResponse({ success: false, error: data.message || '密码错误' });
                    } else if (response.status === 429) {
                        sendResponse({ success: false, error: data.message || '登录尝试次数过多，请稍后再试' });
                    } else {
                        sendResponse({ success: false, error: data.message || '验证失败，请稍后重试' });
                    }
                    return;
                }
                
if (data.success && data.token) {
                      // 确保 Token 保存完成后再返回成功
                      try {
                          await chrome.storage.local.set({ navAuthToken: data.token });
                          setCachedTokenVerifyResult(data.token, { valid: true });
                          // 验证 Token 已保存
                          const stored = await chrome.storage.local.get(['navAuthToken']);
                          if (stored.navAuthToken === data.token) {
                              sendResponse({ success: true });
                          } else {
                              sendResponse({ success: false, error: 'Token保存失败，请重试' });
                          }
                      } catch (storageErr) {
                          console.error('保存Token失败:', storageErr);
                          sendResponse({ success: false, error: 'Token保存失败，请重试' });
                      }
                  } else {
                      sendResponse({ success: false, error: data.message || '验证失败' });
                  }
            } catch (e) {
                console.error('验证密码失败:', e);
                sendResponse({ success: false, error: '网络错误，请检查连接' });
            }
        })();
        return true;
    }
    
    // 创建新分类
    if (request.action === 'createCategory') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
                
                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站地址' });
                    return;
                }
                
                if (!token) {
                    sendResponse({ success: false, needAuth: true, error: '请先验证密码' });
                    return;
                }
                
                const navServerUrl = config.navUrl.replace(/\/$/, '');
                
                const response = await fetch(`${navServerUrl}/api/menus`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        name: request.name,
                        afterId: request.afterId ?? null
                    })
                });
                
                if (!response.ok) {
                    if (response.status === 401) {
                        await chrome.storage.local.remove(['navAuthToken']);
                        sendResponse({ success: false, needAuth: true, error: '登录已过期' });
                        return;
                    }
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || '创建失败');
                }
                
                const result = await response.json();
                
                // 清空缓存，强制刷新
                cachedMenus = [];
                lastMenuFetchTime = 0;
                await chrome.storage.local.remove(['cachedMenus', 'lastMenuFetchTime']);
                
                sendResponse({ success: true, menuId: result.id });
            } catch (e) {
                console.error('创建分类失败:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
    
    // 创建新子分类
    if (request.action === 'createSubCategory') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;
                
                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站地址' });
                    return;
                }
                
                if (!token) {
                    sendResponse({ success: false, needAuth: true, error: '请先验证密码' });
                    return;
                }
                
                const navServerUrl = config.navUrl.replace(/\/$/, '');
                
                const response = await fetch(`${navServerUrl}/api/menus/${request.parentId}/submenus`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        name: request.name,
                        afterSubMenuId: request.afterSubMenuId ?? null
                    })
                });
                
                if (!response.ok) {
                    if (response.status === 401) {
                        await chrome.storage.local.remove(['navAuthToken']);
                        sendResponse({ success: false, needAuth: true, error: '登录已过期' });
                        return;
                    }
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || '创建失败');
                }
                
                const result = await response.json();
                
                // 清空缓存，强制刷新
                cachedMenus = [];
                lastMenuFetchTime = 0;
                await chrome.storage.local.remove(['cachedMenus', 'lastMenuFetchTime']);
                
                sendResponse({ success: true, subMenuId: result.id });
            } catch (e) {
                console.error('创建子分类失败:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === 'reorderMenu') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;

                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站地址' });
                    return;
                }

                if (!token) {
                    sendResponse({ success: false, needAuth: true, error: '请先验证密码' });
                    return;
                }

                const navServerUrl = config.navUrl.replace(/\/$/, '');
                const response = await fetch(`${navServerUrl}/api/menus/${request.menuId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ order: request.order })
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        await chrome.storage.local.remove(['navAuthToken']);
                        sendResponse({ success: false, needAuth: true, error: '登录已过期' });
                        return;
                    }
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || '排序失败');
                }

                cachedMenus = [];
                lastMenuFetchTime = 0;
                await chrome.storage.local.remove(['cachedMenus', 'lastMenuFetchTime']);

                sendResponse({ success: true });
            } catch (e) {
                console.error('调整主分类顺序失败:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === 'reorderSubCategory') {
        (async () => {
            try {
                const config = await chrome.storage.sync.get(['navUrl']);
                const token = (await chrome.storage.local.get(['navAuthToken'])).navAuthToken;

                if (!config.navUrl) {
                    sendResponse({ success: false, error: '未配置导航站地址' });
                    return;
                }

                if (!token) {
                    sendResponse({ success: false, needAuth: true, error: '请先验证密码' });
                    return;
                }

                const navServerUrl = config.navUrl.replace(/\/$/, '');
                const response = await fetch(`${navServerUrl}/api/menus/submenus/${request.subMenuId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ order: request.order })
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        await chrome.storage.local.remove(['navAuthToken']);
                        sendResponse({ success: false, needAuth: true, error: '登录已过期' });
                        return;
                    }
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || '排序失败');
                }

                cachedMenus = [];
                lastMenuFetchTime = 0;
                await chrome.storage.local.remove(['cachedMenus', 'lastMenuFetchTime']);

                sendResponse({ success: true });
            } catch (e) {
                console.error('调整子分类顺序失败:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
});


// 监听设置变化
chrome.storage.onChanged.addListener((changes, area) => {
    // 监听导航站地址变化，自动刷新右键菜单分类
    if (area === 'sync' && changes.navUrl) {
        console.log('[导航站扩展] 检测到导航站地址变化，正在刷新右键菜单...');
        // 重置版本号，强制下次检查时刷新
        lastDataVersion = 0;
        refreshCategoryMenus();
        // 重新初始化数据同步轮询
        initDataSyncPolling();
    }
});

// 监听手动触发更新的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    // 手动触发书签备份（用于测试）
    if (request.action === 'testBookmarkBackup') {
        performAutoBackup('manual')
            .then(result => {
                sendResponse(result);
            })
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    // 获取自动备份配置状态
    if (request.action === 'getBackupConfig') {
        loadAutoBackupConfig()
            .then(config => sendResponse({
                enabled: config.enabled,
                serverUrl: config.serverUrl ? '已配置' : '未配置',
                hasToken: !!config.token
            }))
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }
});


// ==================== 自动书签云备份 ====================

const DAILY_BACKUP_HOUR = 2; // 每天凌晨2点

// 自动备份配置（使用Token认证）
let autoBackupConfig = {
    enabled: false,
    serverUrl: '',
    deviceName: '',
    token: ''  // 使用Token替代密码
};

// 加载自动备份配置
async function loadAutoBackupConfig() {
    try {
        const result = await chrome.storage.local.get([
            'autoBookmarkBackupEnabled',
            'cloudBackupServer',
            'backupDeviceName',
            'cloudBackupToken'  // 使用Token
        ]);
        
        autoBackupConfig = {
            enabled: result.autoBookmarkBackupEnabled || false,
            serverUrl: result.cloudBackupServer || '',
            deviceName: result.backupDeviceName || '',
            token: result.cloudBackupToken || ''  // 使用Token
        };
        
        return autoBackupConfig;
    } catch (e) {
        console.error('加载自动备份配置失败:', e);
        return autoBackupConfig;
    }
}

// 执行自动备份（使用Token认证）
async function performAutoBackup(type = 'auto') {
    try {
        await loadAutoBackupConfig();
        if (!autoBackupConfig.enabled || !autoBackupConfig.serverUrl || !autoBackupConfig.token) {
            console.warn('[书签备份] 跳过: 自动备份未配置或未授权');
            return { success: false, reason: '自动备份未配置或未授权' };
        }
        
        // 获取所有书签
        const tree = await chrome.bookmarks.getTree();
        // 上传备份（使用Token认证）
        const response = await fetch(`${autoBackupConfig.serverUrl}/api/bookmark-sync/upload`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${autoBackupConfig.token}`
            },
            body: JSON.stringify({
                bookmarks: tree,
                deviceName: autoBackupConfig.deviceName || 'Chrome',
                type: type,
                skipIfSame: true
            })
        });
        
        const data = await response.json();
        // 检查Token是否失效
        if (response.status === 401 && data.reason === 'token_invalid') {
            // Token失效，禁用自动备份并通知用户
            await chrome.storage.local.set({ autoBookmarkBackupEnabled: false });
            await chrome.storage.local.remove('cloudBackupToken');
            autoBackupConfig.enabled = false;
            autoBackupConfig.token = '';
            
            // 显示通知提醒用户
            showNotification('自动备份已暂停', '管理密码已更改，请重新授权以恢复自动备份');
            
            console.error('[书签备份] Token已失效');
            return { success: false, reason: 'token_invalid', message: '授权已失效' };
        }
        
        if (data.success) {
            return { success: true, data };
        } else {
            console.error('[书签备份] ❌ 备份失败:', data.message);
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('[书签备份] ❌ 异常:', error.message);
        return { success: false, error: error.message };
    }
}

// 防抖备份常量
const BACKUP_ALARM_NAME = 'bookmarkAutoBackup';
const BACKUP_DEBOUNCE_MINUTES = 5; // 5分钟防抖

// 防抖备份（使用 Chrome Alarms API，即使 Service Worker 休眠也能触发）
async function triggerDebouncedBackup() {
    // 清除之前的定时器
    await chrome.alarms.clear(BACKUP_ALARM_NAME);
    // 创建新的 alarm（分钟为单位）
    chrome.alarms.create(BACKUP_ALARM_NAME, {
        delayInMinutes: BACKUP_DEBOUNCE_MINUTES
    });
}

// 监听 alarm 触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === BACKUP_ALARM_NAME) {
        await performAutoBackup('auto');
    }
    
    // 定时备份 alarm
    if (alarm.name === 'dailyBackupCheck') {
        await checkScheduledBackups();
    }
});

// 监听书签变化
chrome.bookmarks.onCreated.addListener(() => {
    loadAutoBackupConfig().then(config => {
        if (config.enabled) triggerDebouncedBackup();
    });
});

chrome.bookmarks.onRemoved.addListener(() => {
    loadAutoBackupConfig().then(config => {
        if (config.enabled) triggerDebouncedBackup();
    });
});

chrome.bookmarks.onChanged.addListener(() => {
    loadAutoBackupConfig().then(config => {
        if (config.enabled) triggerDebouncedBackup();
    });
});

chrome.bookmarks.onMoved.addListener(() => {
    loadAutoBackupConfig().then(config => {
        if (config.enabled) triggerDebouncedBackup();
    });
});

// 获取周数
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// 检查并执行定时备份（每日/每周/每月）
async function checkScheduledBackups() {
    const now = new Date();
    const hour = now.getHours();
    
    // 只在凌晨2点执行定时备份
    if (hour !== DAILY_BACKUP_HOUR) return;
    
    const today = now.toISOString().slice(0, 10);
    const currentWeek = `${now.getFullYear()}-W${String(getWeekNumber(now)).padStart(2, '0')}`;
    const currentMonth = now.toISOString().slice(0, 7);
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一...
    const dayOfMonth = now.getDate();
    
    const result = await chrome.storage.local.get([
        'lastDailyBackupDate',
        'lastWeeklyBackupWeek',
        'lastMonthlyBackupMonth'
    ]);
    
    // 每日备份
    if (result.lastDailyBackupDate !== today) {
        const backupResult = await performAutoBackup('daily');
        if (backupResult.success) {
            await chrome.storage.local.set({ lastDailyBackupDate: today });
        }
    }
    
    // 每周备份（周一执行）
    if (dayOfWeek === 1 && result.lastWeeklyBackupWeek !== currentWeek) {
        const backupResult = await performAutoBackup('weekly');
        if (backupResult.success) {
            await chrome.storage.local.set({ lastWeeklyBackupWeek: currentWeek });
        }
    }
    
    // 每月备份（每月1号执行）
    if (dayOfMonth === 1 && result.lastMonthlyBackupMonth !== currentMonth) {
        const backupResult = await performAutoBackup('monthly');
        if (backupResult.success) {
            await chrome.storage.local.set({ lastMonthlyBackupMonth: currentMonth });
        }
    }
}

// 初始化定时备份（使用 Chrome Alarms API）
async function initScheduledBackupTimer() {
    // 清除旧的 alarm
    await chrome.alarms.clear('dailyBackupCheck');
    
    // 每小时检查一次是否需要执行定时备份
    chrome.alarms.create('dailyBackupCheck', {
        delayInMinutes: 1,      // 1分钟后首次检查
        periodInMinutes: 60     // 之后每60分钟检查一次
    });
}

// 监听自动备份设置变化
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.autoBookmarkBackupEnabled) {
            const enabled = changes.autoBookmarkBackupEnabled.newValue;
            if (enabled) {
                initScheduledBackupTimer();
            } else {
                // 使用 Chrome Alarms API，清除相关 alarm
                chrome.alarms.clear(BACKUP_ALARM_NAME);
                chrome.alarms.clear('dailyBackupCheck');
            }
        }
    }
});

// 监听手动触发备份的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'triggerAutoBackup') {
        performAutoBackup(request.type || 'manual')
            .then(result => sendResponse(result))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    
    if (request.action === 'getAutoBackupConfig') {
        loadAutoBackupConfig()
            .then(config => sendResponse({ success: true, config }))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
});
