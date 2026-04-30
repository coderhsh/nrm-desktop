# 图标文件说明

本目录用于存放 Tauri 应用在不同场景下使用的图标资源。

## 文件与用途对应

- `icon.png`
  - 用途：托盘图标（见 `src-tauri/tauri.conf.json` 的 `app.trayIcon.iconPath`，或 Rust 侧手动托盘图标来源）。
  - 建议：使用清晰、对比明显的正方形图标，避免细节过小。

- `32x32.png`
  - 用途：Windows/Linux 小尺寸应用图标资源（打包时使用）。
  - 建议：用于任务栏或系统列表小图标显示。

- `128x128.png`
  - 用途：中等尺寸应用图标资源（打包时使用）。
  - 建议：作为常规高分辨率图标来源。

- `128x128@2x.png`
  - 用途：高 DPI 场景图标资源（打包时使用）。
  - 建议：用于高分屏设备，保证显示清晰。

- `icon.ico`
  - 用途：Windows 可执行文件与安装包图标（打包时使用）。
  - 说明：`.ico` 可包含多尺寸图层，适配 Windows 不同显示场景。

- `icon.icns`
  - 用途：macOS 应用图标（打包时使用）。
  - 说明：仅在构建 macOS 目标时生效。

## 配置来源

当前打包图标配置位于：`src-tauri/tauri.conf.json`

- `bundle.icon` 指向：
  - `icons/32x32.png`
  - `icons/128x128.png`
  - `icons/128x128@2x.png`
  - `icons/icon.ico`

如需支持 macOS，可按需把 `icons/icon.icns` 添加到 `bundle.icon` 列表。

## 更新图标建议

方案一： 替换icons/logo.png 后执行 npm run update:logo
方案二：
1. 先准备一份高分辨率母版（建议 1024x1024）。
2. 导出对应尺寸与格式，覆盖本目录同名文件。
3. 重新执行打包命令验证效果：
   - `pnpm build`
