// 单实例 + 置顶：每个窗口只保留一个导航新标签页并固定在标签栏顶部。
// 新建标签页时若本窗口已有导航页，则激活已有的并关掉这个新的，避免越开越多。
// 识别同窗口导航页用三重判据：扩展页 URL、各浏览器 newtab 虚拟 URL、session 注册表，
// 因为 Edge 对被覆盖的新标签页经常回报 edge://newtab/ 而不是扩展地址。
(function () {
    if (!chrome.tabs || !chrome.tabs.getCurrent || !chrome.storage || !chrome.storage.session) return;
    const HOME_URL = chrome.runtime.getURL('newtab.html');
    const NEWTAB_RE = /^(?:chrome|edge|about|brave|vivaldi|opera|yandex):\/\/newtab\/?(?:$|[?#])/i;
    const REG_KEY = 'navora_home_tabs';

    function looksLikeHome(tab) {
        const u = (tab && (tab.url || tab.pendingUrl)) || '';
        return u.indexOf(HOME_URL) === 0 || NEWTAB_RE.test(u);
    }

    function pinTab(id) {
        chrome.tabs.update(id, { pinned: true }, function () { void chrome.runtime.lastError; });
    }

    // 关不掉就退而求其次解除固定，至少不让图标堆在顶部
    function closeTab(id) {
        chrome.tabs.remove(id, function () {
            if (chrome.runtime.lastError) {
                chrome.tabs.update(id, { pinned: false }, function () { void chrome.runtime.lastError; });
            }
        });
    }

    function enforce() {
        chrome.tabs.getCurrent(function (self) {
            if (!self || typeof self.id !== 'number') return;
            chrome.tabs.query({ windowId: self.windowId }, function (tabs) {
                tabs = tabs || [];
                const alive = new Set(tabs.map(t => t.id));

                chrome.storage.session.get({ [REG_KEY]: [] }, function (store) {
                    const stored = Array.isArray(store[REG_KEY]) ? store[REG_KEY] : [];
                    const byId = new Map(tabs.map(t => [t.id, t]));
                    // 注册表里的标签一旦被导航到真实网址就不再算导航页，防止把普通页面当导航页关掉
                    const isNavigatedAway = t => /^(https?|file|ftp):/i.test((t.url || t.pendingUrl) || '');
                    // 其他窗口的注册信息原样保留，不能被本窗口覆盖（否则多窗口互相清空）
                    const others = stored.filter(e => e && e.windowId !== self.windowId && alive.has(e.id));
                    let registry = stored
                        .filter(e => e && alive.has(e.id) && e.windowId === self.windowId)
                        // 导航页被地址栏带到搜索结果等真实网址后不再固定在顶部
                        .filter(e => {
                            const t = byId.get(e.id);
                            if (t && isNavigatedAway(t)) {
                                if (t.pinned) chrome.tabs.update(e.id, { pinned: false }, function () { void chrome.runtime.lastError; });
                                return false;
                            }
                            return true;
                        });
                    if (!registry.some(e => e.id === self.id)) {
                        registry.push({ id: self.id, windowId: self.windowId });
                    }
                    const regIds = new Set(registry.map(e => e.id));

                    const homes = tabs.filter(t =>
                        looksLikeHome(t) || (regIds.has(t.id) && !isNavigatedAway(t))
                    );
                    if (!homes.some(t => t.id === self.id)) homes.push(self);
                    // 幸存者：已固定的优先，其次标签 id 最小（最早创建），保证所有页面算出同一个结果
                    homes.sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (a.id - b.id));
                    const survivor = homes[0];

                    // 登记本窗口所有导航页（幸存者在前），它们之后若被地址栏带到真实网址，可据此解除固定
                    chrome.storage.session.set({
                        [REG_KEY]: others
                            .concat([{ id: survivor.id, windowId: survivor.windowId }])
                            .concat(homes.filter(t => t.id !== survivor.id).map(t => ({ id: t.id, windowId: self.windowId })))
                    });

                    if (survivor.id !== self.id) {
                        if (!survivor.pinned) pinTab(survivor.id);
                        chrome.tabs.update(survivor.id, { active: true }, function () { void chrome.runtime.lastError; });
                        closeTab(self.id);
                        return;
                    }

                    if (!self.pinned) pinTab(self.id);
                    homes.slice(1).forEach(function (t) { closeTab(t.id); });
                });
            });
        });
    }

    enforce();
    // 再跑一次，覆盖"同时新建两个标签页"的竞态
    setTimeout(enforce, 600);
})();

// 检查配置
chrome.storage.sync.get(['navUrl'], function(result) {
    const navFrame = document.getElementById('navFrame');
    const setupContainer = document.getElementById('setupContainer');
    const loadingScreen = document.getElementById('loadingScreen');

    if (result.navUrl) {
        let ready = false;
        let revealed = false;

        const reveal = function() {
            if (revealed) return;
            revealed = true;
            loadingScreen.classList.remove('show');
        };

        const onReady = function() {
            ready = true;
            reveal();
        };

        loadingScreen.classList.add('show');

        // iframe 立即显示（被遮罩盖住）：导航站自己的启动画面先画出来，遮罩一撤即见
        navFrame.style.display = 'block';
        navFrame.src = result.navUrl;

        // 导航站挂载完成后会 postMessage，此时立刻撤遮罩，不等图标等资源全部加载
        window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'navora:ready') onReady();
        });

        navFrame.onload = onReady;
        navFrame.onerror = showLoadError;

        // 最多等 3.5 秒就撤遮罩，显示已绘制的内容
        setTimeout(reveal, 3500);

        // 12 秒仍未就绪视为加载失败
        setTimeout(function() {
            if (!ready) showLoadError();
        }, 12000);

    } else {
        setupContainer.style.display = 'flex';
    }
});

function showLoadError() {
    const navFrame = document.getElementById('navFrame');
    const loadingScreen = document.getElementById('loadingScreen');
    
    loadingScreen.classList.remove('show');
    navFrame.style.display = 'none';
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:white;font-size:18px;">导航页加载失败，请检查网络或导航站地址配置</div>';
}

document.getElementById('saveBtn').addEventListener('click', function() {
    const urlInput = document.getElementById('navUrl');
    const errorDiv = document.getElementById('error');
    const loadingDiv = document.getElementById('loading');
    const url = urlInput.value.trim();
    
    if (!url) {
        errorDiv.textContent = '请输入导航站地址';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const urlObj = new URL(url);
        if (!urlObj.protocol.startsWith('http')) {
            throw new Error('Invalid protocol');
        }
    } catch (e) {
        errorDiv.textContent = '请输入有效的 URL 地址(需包含 http:// 或 https://)';
        errorDiv.style.display = 'block';
        return;
    }
    
    errorDiv.style.display = 'none';
    loadingDiv.style.display = 'block';
    
    chrome.storage.sync.set({ navUrl: url }, function() {
        location.reload();
    });
});

document.getElementById('navUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('saveBtn').click();
    }
});
