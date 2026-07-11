# SmartNavora - AI 智能导航网站 v1.37.10

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.37.10-brightgreen.svg)](https://github.com/zczy-k/SmartNavora/releases)
[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Security](https://img.shields.io/badge/Security-Enhanced-success.svg)](docs/SECURITY.md)

SmartNavora 是一款面向数字化工作者的 AI 智能导航网站。集 AI 智能生成、卡片化管理、多端同步与浏览器深度集成于一体，提供极速流畅的导航体验。

---

## 🌟 功能亮点

- **⚡ 丝滑体验** — 并行请求 + 多级缓存 + 骨架屏 + 卡片淡入动画，加载无闪烁
- **🤖 AI 赋能** — 内置多模型适配器，一键补全图标、描述、标签与分类
- **📂 三层架构** — 菜单 → 子菜单 → 卡片，支持拖拽排序与分组折叠
- **🔥 常用卡片** — 基于点击频率与时间衰减的智能推荐，默认展示高频卡片
- **🔍 拼音搜索** — 支持全站拼音模糊搜索，快速定位卡片
- **🧩 浏览器插件** — 接管新标签页、右键一键保存、书签同步
- **🔒 数据安全** — bcrypt + JWT + 审计日志 + 紧急重置令牌
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

访问地址 `http://你的IP:3000/`，后台 `http://你的IP:3000/admin`，默认账号 `admin / 123456`（首次登录后务必修改）。

| 环境 | 推荐方式 |
| :--- | :--- |
| **Docker / NAS** | Docker Compose |
| **Linux 服务器** | 一键脚本（PM2 进程守护） |
| **Serv00 / CT8** | Serv00 脚本（免费空间） |

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
      ADMIN_PASSWORD: 123456
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

> 如需自定义 JWT 密钥、加密密钥等高级选项，参考 [完整配置示例](docker-compose.yml)。务必持久化 `database/`、`backups/`、`config/` 三个目录，否则容器重建会丢失数据。

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

---

## 🔧 使用指南

### 🌐 浏览器插件

1. 前往 [Releases](https://github.com/zczy-k/SmartNavora/releases) 下载 `smartnavora-extension-v*.zip`
2. 解压后 Chrome/Edge 进入 `chrome://extensions/`，开启开发者模式，加载已解压的扩展
3. 在插件设置中填入导航站地址即可绑定

### 🤖 AI 智能生成

后台添加一条只填了 URL 的卡片，勾选后点击 **批量 AI 生成**，AI 自动爬取标题、描述、图标并推荐分类，支持 DeepSeek / OpenAI / Claude / GLM 等多模型。

### 🔥 常用卡片

首页默认展示常用卡片，基于 7 天时间窗口的点击频率与最近访问时间智能排序，每 30 秒自动刷新。

### 📂 分组管理

菜单 → 子菜单 → 卡片三层结构，支持拖拽排序。卡片支持 Section 级折叠/展开，状态在服务端持久化。

---

## 🛠️ 技术栈

| 层 | 技术 |
| :--- | :--- |
| **前端** | Vue 3 + Vite + Vue Router |
| **后端** | Node.js + Express |
| **数据库** | SQLite3 |
| **AI 引擎** | OpenAI / DeepSeek / Claude / GLM 等多模型适配器 |
| **CI/CD** | GitHub Actions → ghcr.io Docker Image |
| **部署** | Docker / PM2 / Serv00 |

---

## 📚 文档

- [密码找回指南](docs/PASSWORD-RECOVERY.md)
- [安全最佳实践](docs/SECURITY.md)

---

## 🔒 安全特性

- bcrypt 密码哈希
- JWT 令牌认证（支持版本轮换）
- 紧急重置令牌（SHA-256 哈希存储，1 小时过期）
- 操作审计日志
- 文件权限保护（0600）
- 请求频率限制与输入清洗

---

## 📄 许可证

**Apache License 2.0**

特别感谢 [nav-item](https://github.com/eooce/nav-item) 提供的灵感与基础。

---

⭐ 如果这个项目对你有帮助，请点个 Star 支持一下！

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

## 📞 支持

- [GitHub Issues](https://github.com/zczy-k/SmartNavora/issues)
- [更新日志](https://github.com/zczy-k/SmartNavora/releases)
