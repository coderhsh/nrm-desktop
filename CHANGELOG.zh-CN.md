# 更新日志

[English](./CHANGELOG.md)

本文件记录项目的所有重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### Changed

- 测试更新

## [1.1.5] - 2026-05-22

### Changed

- 测试更新

## [1.1.4] - 2026-05-22

### Changed

- 测试更新

## [1.1.3] - 2026-05-22

### Changed

- 测试更新

## [1.1.2] - 2026-05-22

### Changed

- 测试更新

## [1.1.1] - 2026-05-22

### Changed

- 测试更新

## [1.1.0] - 2026-05-22

### 新增

- 应用内自动更新（Tauri updater）：启动时静默检查（最多每 24 小时一次）、设置页手动检查、更新对话框展示发行说明
- 更新对话框支持下载进度、一键安装并重启，以及按版本暂时忽略本次更新
- CI 发布流程生成带签名的 updater 产物，并将 `latest.json` 发布到固定 `updater` Release 供客户端拉取

### 变更

- CI 安装包构建需配置 updater 签名 Secrets，并在构建时写入公钥

## [1.0.1] - 2026-05-21

### 新增

- 源列表搜索关键词高亮（`SearchHighlightText`）
- 分类内源列表右键菜单排序（按名称或延迟）
- 跨分类拖拽调整源顺序
- 导入/导出支持分类与排序信息
- 引入 ESLint、Vitest 及首批单元测试
- Vue / Pinia / Element Plus API 与组件自动导入
- 贡献者文档 `AGENTS.md`、`CLAUDE.md`

### 变更

- 统一 registry 存储模型（移除旧版预设/自定义双轨并支持迁移）
- 工具链升级：Node.js 20.19+、Vite 7、UnoCSS Wind3 预设
- 源详情快速复制项与文档对齐（URL、延迟、分类等）
- 英文 README 效率工具描述与实现一致

### 修复

- macOS 下浅色/深色主题切换过渡
- 滚动与设置抽屉关闭交互
- 分类拖拽、右键菜单在深色模式下的样式

## [1.0.0] - 2026-05-11

首个稳定版本。

### 新增

- npm 源管理桌面客户端（Tauri 2 + Vue 3 + Rust）
- 源的增删改查与一键切换，写入 `~/.npmrc`
- 内置常用源（npm、yarn、taobao 等）与自定义源
- 单源 / 批量测速与可视化延迟展示
- 自定义分类与拖拽排序
- 源详情弹窗与 URL 复制
- 源配置 JSON 导入/导出
- 系统托盘快速切换源
- 浅色 / 深色 / 跟随系统主题，简体中文 / 英文界面
- 开机自启动、关闭行为（最小化到托盘或退出）、单实例锁
- 代理配置后端能力（界面入口可在后续版本开放）

[未发布]: https://github.com/coderhsh/nrm-desktop/compare/v1.1.5...HEAD
[1.1.5]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.5
[1.1.4]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.4
[1.1.3]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.3
[1.1.2]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.2
[1.1.1]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.1
[1.1.0]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.0
[1.0.1]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.0.1
[1.0.0]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.0.0
