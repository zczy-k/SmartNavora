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
