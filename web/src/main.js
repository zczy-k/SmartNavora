import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      }
    } catch {
      // Ignore cleanup failures for previously registered PWA assets.
    }
  });
}

const app = createApp(App);
app.use(router);
app.mount('#app');

// 被新标签页扩展以 iframe 嵌入时，路由就绪即通知外层收起加载动画（站点自己的启动画面接手）
router.isReady().then(() => {
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'navora:ready' }, '*');
    } catch {}
  }
});

// 内联启动画面由站点自己决定何时撤：页面在"卡片已渲染 + 背景图已解码"后派发
// navora:content-ready；没等到（异常/无事件）则 3 秒兜底，避免遮罩卡死
let splashRemoved = false;
function removeSplash() {
  if (splashRemoved) return;
  splashRemoved = true;
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 260);
}
window.addEventListener('navora:content-ready', removeSplash, { once: true });
setTimeout(removeSplash, 3000);

// 旧 HTML 引用的 chunk 被清理后会加载失败：自动重载一次拿新入口，避免白屏
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('nav_chunk_retry')) return;
  sessionStorage.setItem('nav_chunk_retry', '1');
  location.reload();
});
