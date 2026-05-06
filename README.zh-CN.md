# nrm-desktop 🚀

[English](./README.md)

`nrm-desktop` 是一个用于管理 npm 源的桌面 GUI 工具，基于 **Tauri 2 + Vue 3 + TypeScript + Rust** 构建。

适合经常切换 npm 源、希望用图形界面替代命令行操作的开发者。

## 为什么选择 nrm-desktop ✨

- **切换更高效**：一键切换源，减少命令行记忆和误操作
- **桌面端更轻量**：基于 Tauri（Rust 后端 + WebView），相比很多 Electron 工具体积和资源占用更友好
- **交互更流畅**：分类管理、拖拽移动、测速重测等高频操作都做了可用性优化
- **功能开箱即用**：导入导出、托盘快捷入口、源详情复制、主题与语言设置
- **贴近开发者日常**：支持频繁切源、单源重测、快速回退到可用源

## 核心功能 🧩

- 源管理：新增、编辑、删除、切换
- 预设源 + 自定义源分类管理
- 支持拖拽把源移动到目标分类
- 支持单个测速和全量测速
- 源详情弹窗与复制能力
- 主题切换（浅色 / 深色 / 自动）
- 语言切换（简体中文 / 英语）
- 配置导入 / 导出
- 系统托盘快捷操作

## 性能与体积 📊

当前仓库可直接量化的数据：

- 前端构建产物（`dist/assets`）：
  - JS 包体：`约 993 KB`
  - CSS 包体：`约 357 KB`
- Rust 调试可执行文件（`src-tauri/target/debug/nrm-desktop.exe`）：`约 23 MB`

运行体验特点：

- 基于 Tauri + Rust 原生后端，相比很多 Electron-first 方案有更低运行时开销
- 日常开发与使用场景下启动较快，托盘与后台行为更轻量
- 开发模式使用自动端口脚本，减少端口冲突导致的重启成本

> 说明：最终发布包体积会受系统平台、架构、构建模式和打包参数影响。

## 技术栈 🛠️

- 前端：Vue 3、TypeScript、Pinia、Element Plus、VueUse、UnoCSS、Vite
- 桌面运行时：Tauri 2
- 后端：Rust（命令处理、npmrc 读写、测速逻辑）
- 网络：reqwest + tokio

## 环境要求 📦

本地运行前请确保已安装：

- Node.js 18+
- pnpm
- Rust 工具链（`rustup`、`cargo`）
- 系统对应的 Tauri 依赖

参考文档：  
[Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Windows 运行与打包环境

Windows 场景建议区分「运行环境」与「打包环境」：

- 运行环境（给最终用户）：
  - Microsoft Edge WebView2 Runtime（新版本 Windows 通常自带，缺失时需手动安装）
- 打包环境（给开发者）：
  - Microsoft Visual Studio C++ Build Tools（MSVC 工具链）
  - Windows 10/11 SDK
  - NSIS（用于生成 `nsis` 安装包）
  - WiX Toolset（用于生成 `msi` 安装包；`pnpm build:win` 在 Windows 上会产出 MSI+NSIS）

#### 常见安装命令与官方下载链接

- WebView2 Runtime
  - 常见安装命令（Chocolatey）：
    - `choco install microsoft-edge-webview2-runtime -y`
  - 官方下载：
    - [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
- NSIS
  - 常见安装命令（Chocolatey）：
    - `choco install nsis -y`
  - 官方下载：
    - [NSIS Download](https://nsis.sourceforge.io/Download)
- WiX Toolset
  - 常见安装命令（Chocolatey）：
    - `choco install wixtoolset -y`
  - 官方下载：
    - [WiX Toolset](https://wixtoolset.org/)

## 快速开始 ⚡

安装依赖：

```bash
pnpm install
```

开发模式运行桌面应用：

```bash
pnpm dev
```

构建发布包：

```bash
pnpm build
```

## 可用脚本 📜

- `pnpm dev`：启动桌面开发模式（自动选择可用端口）
- `pnpm build`：构建桌面安装包/可执行文件，并输出构建产物信息
- `pnpm build:win`：仅构建 Windows 安装包/可执行文件
- `pnpm ui:dev`：仅启动 Vite 前端开发服务
- `pnpm ui:build`：仅执行前端类型检查与构建
- `pnpm tauri`：透传调用 Tauri CLI
- `pnpm update:logo`：基于 `src-tauri/icons/logo.png` 生成桌面图标集

## 配置与数据位置 🗂️

应用数据默认位于用户目录：

- 自定义源与元数据：`~/.nrm-desktop/`
- 由应用管理的 npm 源配置：`~/.npmrc`
- 单实例锁文件：`~/.nrm-desktop/.instance.lock`

## 托盘与退出行为 🧷

- 托盘逻辑在 `src-tauri/src/lib.rs`
- 单实例逻辑在 `src-tauri/src/main.rs`
- 开发模式下，`scripts/tauri-dev-auto-port.mjs` 会生成临时配置并移除托盘配置字段，避免双托盘图标

## 图标说明 🎨

图标资源目录：

- `src-tauri/icons/`

图标映射说明文档：

- `src-tauri/icons/README.md`

## 常见问题（Troubleshooting） 🩺

### 1）Windows 右下角出现双托盘图标

- 确认已使用最新代码（托盘只由 Rust 侧创建）
- 停掉旧的 `pnpm dev` 进程后重新启动
- 如仍出现，检查是否有旧进程残留并清理后重启

### 2）开发模式端口被占用

- `pnpm dev` 默认使用自动端口脚本
- 若仍冲突，先停止旧 dev 任务后重启

## 参与贡献 🤝

1. 新建功能分支
2. 保持改动聚焦、提交信息清晰
3. 本地先完成基本验证再提 PR
4. 提交粒度尽量小，方便评审

## 计划（Roadmap 建议） 🗺️

- 完整覆盖所有界面文案国际化
- 增加关键流程 E2E 测试
- 增强导入/导出的兼容与校验
- 支持更多预设源模板管理

