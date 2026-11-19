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

// 首屏就绪后撤掉 index.html 里的内联启动遮罩；
// 若被新标签页扩展以 iframe 嵌入，同时通知外层立即收起加载动画（不等图标全部加载完）
router.isReady().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const splash = document.getElementById('boot-splash');
      if (splash) {
        splash.classList.add('out');
        setTimeout(() => splash.remove(), 260);
      }
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'navora:ready' }, '*');
        } catch {}
      }
    });
  });
});
// 路由异常时兜底，避免遮罩卡死
setTimeout(() => {
  const splash = document.getElementById('boot-splash');
  if (splash) splash.remove();
}, 4000);
