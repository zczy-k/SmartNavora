import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'fs';
import { resolve, join } from 'path';

// 递归复制目录
function copyRecursive(src, dest) {
  const exists = existsSync(src);
  const stats = exists && statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
    }
    readdirSync(src).forEach(childItemName => {
      copyRecursive(
        join(src, childItemName),
        join(dest, childItemName)
      );
    });
  } else {
    copyFileSync(src, dest);
  }
}

export default defineConfig({
  // Force rebuild: 202511211700
  plugins: [
    vue(),
    {
      name: 'copy-to-public',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        const publicDir = resolve(__dirname, '..', 'public');
        const publicAssetsDir = resolve(publicDir, 'assets');
        
        try {
          // 1. 只清理 7 天前的旧 assets
          // 不整体清空：EdgeOne 会给 HTML 做短时边缘缓存，旧 HTML 可能仍引用旧 hash 的 chunk，
          // 立刻删文件会让那部分用户吃到 404；保留 7 天远大于任何缓存 TTL。
          if (existsSync(publicAssetsDir)) {
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            let pruned = 0;
            for (const name of readdirSync(publicAssetsDir)) {
              const filePath = join(publicAssetsDir, name);
              try {
                const stats = statSync(filePath);
                if (stats.isFile() && stats.mtimeMs < cutoff) {
                  rmSync(filePath, { force: true });
                  pruned++;
                }
              } catch {}
            }
            console.log(`🧹 已清理 ${pruned} 个 7 天前的旧构建文件（保留近期文件供边缘缓存命中）`);
          }
          
          // 2. 然后将整个 dist 目录复制到 public 目录
          console.log('🔄 正在复制构建文件到 public 目录...');
          copyRecursive(distDir, publicDir);
          console.log('✅ 构建文件已自动复制到 public 目录');
        } catch (err) {
          console.error('❌ 文件复制失败:', err.message);
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false
  }
});
