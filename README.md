# SmartNavora - AI 智能导航网站 v1.44.12

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.44.12-brightgreen.svg)](https://github.com/zczy-k/SmartNavora/releases)
[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Security](https://img.shields.io/badge/Security-Enhanced-success.svg)](docs/SECURITY.md)

SmartNavora 是一款自托管的 AI 智能导航站：**浏览器新标签页**与**卡片化导航页**一体化，内置 AI 自动补全、多级缓存、SSE 实时同步与浏览器扩展，数据全部保存在你自己的机器上。

- **自托管**：SQLite 单文件存储，无外部依赖，数据不出本机
- **快**：骨架屏 + 启动画面 + 壁纸预载 + 哈希资源长期缓存，新版部署后前端自动对齐，不残留旧界面
- **可部署在任何地方**：Docker / Linux / 免费主机（Serv00），对 CDN（EdgeOne、Cloudflare 等）友好
- **AI 与扩展深度集成**：多模型批量生成卡片信息；扩展接管新标签页、右键收藏、书签管理

---

## 🌟 功能亮点

### 体验

- **⚡ 极速加载** — 数据并行请求、localStorage 缓存优先渲染、启动画面 + 骨架屏、卡片淡入，新标签页无白屏闪烁
- **🖼️ 壁纸预载** — 记住上次使用的背景图并在 `<head>` 内提前预加载，非默认壁纸也不黑屏
- **📦 缓存分层** — 哈希静态资源长期缓存（`immutable`）、HTML 不缓存、图标 30 天 + `stale-while-revalidate`
- **🔄 版本自愈** — 构建戳比对：旧 HTML 引用了已清理的资源时自动静默刷新一次，升级后界面立即生效

### 内容管理

- **🤖 AI 赋能** — 内置多模型适配器（DeepSeek / OpenAI / Claude / GLM 等），批量补全标题、描述、标签、分类与图标
- **📂 三层架构** — 菜单 → 子菜单 → 卡片，拖拽排序、分组折叠，折叠状态服务端持久化
- **🔥 常用卡片** — 按 7 天窗口内的点击频率与最近访问时间衰减排序，自动刷新
- **🔍 拼音搜索** — 全站拼音模糊搜索，输入首字母即可定位卡片
- **🎨 本地图标服务** — `/icons/:host` 统一抓取并本地缓存站点图标，抓取失败自动字母兜底，卡片支持自定义 logo

### 集成与安全

- **🧩 浏览器扩展** — 接管新标签页（每个窗口**有且只有一个**导航页并固定在标签栏顶部）、右键一键收藏、内置书签管理器
- **📡 SSE 实时同步** — 后台修改数据后，已打开的导航页实时更新，无需手动刷新
- **🔒 数据安全** — bcrypt + JWT + 审计日志 + 紧急重置令牌 + 频率限制
- **💾 自动备份** — 本地定时备份 + WebDAV 云端同步

---

## 📸 界面预览

<div align="center">
  <img width="90%" alt="首页预览" src="https://github.com/user-attachments/assets/3b974405-312b-4cb1-9c16-5b87d45e79e5" />
  <p><i>渐进式卡片首页，支持分组折叠与常用卡片推荐</i></p>

  <img width="45%" alt="管理后台" src="https://github.com/user-attachments/assets/b3a4bac2-f7b8-4742-8982-11a7381782cb" />
  <img width="45%" alt="AI 配置" src="https://github.com/user-attachments/assets/e34ab03c-fe3a-43d2-835a-775b5ceb61ed" />
</div>

---

## 🚀 快速部署

部署完成后访问 `http://你的IP:3000/`，管理后台 `http://你的IP:3000/admin`，默认账号 **`admin / 123456`**（首次登录后立即修改）。

| 环境 | 推荐方式 |
| :--- | :--- |
| **Docker / NAS** | Docker Compose（多架构镜像，amd64 + arm64） |
| **Linux 服务器** | 一键脚本（PM2 进程守护） |
| **Serv00 / CT8** | Serv00 脚本（免费主机） |

> 可选：在 Nginx / CDN 前加一层静态缓存。HTML 建议 `no-cache`，`/assets/*` 可长期缓存，`/api/*` 不缓存；即使不做任何缓存配置，构建戳自愈也会保证升级后界面正确。

---

### 🐳 Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
services:
  SmartNavora:
    image: ghcr.io/zczy-k/smartnavora:latest
    container_name: SmartNavora
    ports:
      - "3000:3000"
    environment:
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: 123456
      JWT_SECRET: change-this-secret
      CRYPTO_SECRET: change-this-too
      AUTO_BACKUP_ENABLED: "true"
    volumes:
      - ./database:/app/database
      - ./backups:/app/backups
      - ./config:/app/config
    restart: unless-stopped
```

```bash
docker compose pull
docker compose up -d
```

> 务必持久化 `database/`、`backups/`、`config/` 三个目录，否则容器重建会丢失数据。低配机器上若备份任务引发重启，可设 `AUTO_BACKUP_ENABLED: "false"`。

---

### 🐳 Docker Run

```bash
docker run -d \
  --name SmartNavora \
  -p 3000:3000 \
  -v $(pwd)/database:/app/database \
  -v $(pwd)/backups:/app/backups \
  -v $(pwd)/config:/app/config \
  -e ADMIN_PASSWORD=123456 \
  --restart unless-stopped \
  ghcr.io/zczy-k/smartnavora:latest
```

镜像由 GitHub Actions 在每次推送后自动构建并发布到 `ghcr.io/zczy-k/smartnavora`（`latest` + 分支/tag + commit 摘要标签）。

---

### 🐧 Linux 一键安装

```bash
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/SmartNavora/main/scripts/manage-linux.sh)
```

---

### 🌐 Serv00 免费主机

```bash
# 使用系统默认域名
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/SmartNavora/main/scripts/manage-serv00.sh)

# 使用自定义域名（需先添加 CNAME / A 记录）
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/SmartNavora/main/scripts/manage-serv00.sh)
```

---

### 🔄 维护升级

**Docker**
```bash
docker compose pull && docker compose up -d
```

**Linux / Serv00**
```bash
bash manage-linux.sh update   # Linux
bash manage-serv00.sh update  # Serv00
```

**升级后无需手动清缓存**：前端会在空闲时比对服务端构建戳，发现版本落后自动静默刷新一次；旧资源缺失导致的加载失败也会自动重载重试。

---

## ⚙️ 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP 监听端口 |
| `NODE_ENV` | `production` | 运行模式 |
| `ADMIN_USERNAME` | `admin` | 初始管理员账号（仅首次初始化生效） |
| `ADMIN_PASSWORD` | `123456` | 初始管理员密码（仅首次初始化生效） |
| `JWT_SECRET` | - | JWT 签名密钥，**生产环境务必修改** |
| `CRYPTO_SECRET` | - | 敏感配置加密密钥，**生产环境务必修改** |
| `AUTO_BACKUP_ENABLED` | `true` | 是否启用定时自动备份 |

---

## 🔧 使用指南

### 🌐 浏览器插件

1. 前往 [Releases](https://github.com/zczy-k/SmartNavora/releases) 下载 `smartnavora-extension-v*.zip`
2. Chrome / Edge：解压后打开 `chrome://extensions/`（Edge 为 `edge://extensions/`），开启开发者模式，选择「加载已解压的扩展程序」
3. Firefox：`about:debugging` → 「载入临时附加组件」，选择解压目录中的 `manifest.json`
4. 点击工具栏图标，填入你的导航站地址即可绑定

安装后：

- **新标签页**由扩展接管，每个窗口只保留一个导航页并固定在标签栏顶部，重复新建自动复用
- 在导航页地址栏搜索、跳走时，该页会自动解除固定，顶部始终只保留导航页
- 任意网页右键 → **添加到导航页**，直接选分类保存
- 扩展弹窗内可打开 **书签管理器**，从浏览器书签批量导入

### 🤖 AI 智能生成

后台添加一条只填了 URL 的卡片，勾选后点击 **批量 AI 生成**，AI 自动爬取标题、描述、图标并推荐分类。支持 DeepSeek / OpenAI / Claude / GLM 等多模型，可为主流程与备用模型分别配置。

### 🔥 常用卡片

首页默认展示常用卡片，基于 7 天时间窗口的点击频率与最近访问时间智能排序，每 30 秒自动刷新；点击行为由服务端汇总，可跨设备一致。

### 📂 分组管理

菜单 → 子菜单 → 卡片三层结构，支持拖拽排序。卡片支持 Section 级折叠/展开，状态在服务端持久化；子菜单与 Section 的视觉区分用于表达第四级分组。

---

## 🛠️ 技术栈

| 层 | 技术 |
| :--- | :--- |
| **前端** | Vue 3 + Vite + Vue Router |
| **后端** | Node.js 20+ + Express |
| **数据库** | SQLite3（单文件，随目录备份） |
| **实时同步** | Server-Sent Events（`/api/sse/data-sync`） |
| **AI 引擎** | OpenAI / DeepSeek / Claude / GLM 等多模型适配器 |
| **缓存策略** | 哈希资源 `immutable` + HTML `no-store` + 图标 `stale-while-revalidate` + 构建戳自愈 |
| **CI/CD** | GitHub Actions → ghcr.io 多架构镜像 / 扩展打包发布 |
| **部署** | Docker / PM2 / Serv00 |

---

## 💻 本地开发

```bash
npm run install:all      # 安装根目录与 web 依赖
npm run dev              # 并行启动后端 + 前端开发服务器
npm run build            # 构建前端并同步到 public/（生产静态目录）
npm start                # 生产模式启动
npm run start:https      # HTTPS 启动（证书自动生成于 certs/，可用 server.crt / server.key 替换）
```

版本发布辅助：`npm run release:patch` 会自增补丁版本并同步 `README.md`、`package.json`、扩展 `manifest.json` 与 `popup.html` 中的版本号。

---

## 📚 文档

- [密码找回指南](docs/PASSWORD-RECOVERY.md)
- [安全最佳实践](docs/SECURITY.md)

---

## 🔒 安全特性

- bcrypt 密码哈希
- JWT 令牌认证（支持密钥版本轮换）
- 紧急重置令牌（SHA-256 哈希存储，1 小时过期）
- 操作审计日志
- 文件权限保护（0600）
- 请求频率限制与输入清洗
- 敏感配置加密存储（`CRYPTO_SECRET`）

---

## 🆕 v1.44.12 更新内容

- **扩展单实例置顶**：每个浏览器窗口有且只有一个扩展导航页，并固定在标签栏顶部；Edge 虚拟新标签页 URL 也能正确识别
- **地址栏导航自动解钉**：在导航页地址栏搜索或跳转后，该页自动解除固定，顶部不再堆积搜索页
- **多窗口注册表隔离**：多窗口场景下各窗口的导航页状态互不覆盖
- **构建戳自愈**：升级部署后旧 HTML 自动对齐新版本，旧 chunk 失效自动重载
- **图标缓存强化**：`/icons/:host` 30 天缓存 + `stale-while-revalidate` + `immutable`，二次加载不再阻塞
- **壁纸提前预载**：非默认背景图在页面渲染前加载，消除新标签页黑闪

完整历史见 [Releases](https://github.com/zczy-k/SmartNavora/releases)。

---

## 📄 许可证

**Apache License 2.0**

特别感谢 [nav-item](https://github.com/eooce/nav-item) 提供的灵感与基础。

---

## 🤝 贡献与支持

- 欢迎提交 [Issue](https://github.com/zczy-k/SmartNavora/issues) 和 Pull Request
- 更新日志：[Releases](https://github.com/zczy-k/SmartNavora/releases)

⭐ 如果这个项目对你有帮助，请点个 Star 支持一下！
