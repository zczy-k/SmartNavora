# SmartNavora 浏览器扩展

接管新标签页、右键一键收藏、整理浏览器书签，与自建的 SmartNavora 导航站配合使用。

## 功能

- **新标签页接管** — 打开新标签页直接进入你的导航站
- **每窗口单实例置顶** — 每个浏览器窗口有且只有一个导航页，并固定在标签栏顶部；重复新建自动复用，不会越开越多
- **地址栏导航自动解钉** — 在导航页地址栏搜索或跳转到其它网站时，该页自动解除固定（内容不会丢失），顶部始终只保留导航页
- **右键快速添加** — 右键即可把当前网页或链接添加到导航页，支持选择分类
- **书签管理器** — 搜索、整理浏览器书签并批量导入导航站
- **自定义地址** — 支持任意导航站地址，设置随浏览器账号同步

## 安装

### Chrome / Edge（开发者模式）

1. 从 [Releases](https://github.com/zczy-k/SmartNavora/releases) 下载 `smartnavora-extension-v*.zip` 并解压（或直接使用仓库中的 `browser-extension/` 目录）
2. 打开 `chrome://extensions/`（Edge 为 `edge://extensions/`），开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `browser-extension` 文件夹

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击「临时载入附加组件」，选择 `browser-extension/manifest.json`

> Firefox 需 127 及以上版本（manifest 中的 `gecko.strict_min_version`）。

## 使用

1. 首次打开新标签页，输入导航站地址（如 `https://your-domain.com`），保存后即开始使用
2. 工具栏图标 → 「设置地址」可随时修改；「管理后台」直达站点的 `/admin`
3. 工具栏图标 → 「书签管理器」可整理/导入浏览器书签
4. 任意网页右键 → 「添加到导航页」

## 支持的浏览器

- Google Chrome / Microsoft Edge 等基于 Chromium 的浏览器（MV3）
- Firefox 127+

## 常见问题

**安装后还是显示默认新标签页？**
检查扩展是否启用，以及是否已保存导航站地址。

**可以使用本地部署的导航站吗？**
可以，填入完整地址即可，例如 `http://localhost:3000`。

**设置会跨设备同步吗？**
会。扩展使用 `chrome.storage.sync`，登录浏览器账号并开启同步后自动同步。

**扩展会收集我的数据吗？**
不会。扩展只在浏览器本地保存你填写的导航站地址，数据请求只发向你自己的导航站。

## 文件结构

```
browser-extension/
├── manifest.json      # 扩展配置（MV3）
├── newtab.html        # 新标签页（导航站 iframe + 首次配置）
├── newtab.js          # 新标签页逻辑（单实例置顶、解钉、首次配置）
├── background.js      # 后台脚本（右键菜单、AI 生成、备份同步、解钉监听）
├── content.js         # 页面内快捷添加弹窗
├── popup.html/.js     # 工具栏弹窗
├── options.html/.js   # 扩展选项页
├── bookmarks.html/.js # 书签管理器
├── icons/             # 扩展图标
└── README.md
```

## 许可证

[Apache License 2.0](../LICENSE)。完整更新日志见 [Releases](https://github.com/zczy-k/SmartNavora/releases)。
