# 下载地址

请前往 [GitHub Releases](https://github.com/coderhsh/nrm-desktop/releases) 页面下载安装包。

## macOS

[Apple M芯片](https://github.com/coderhsh/nrm-desktop/releases/latest) | [Intel芯片](https://github.com/coderhsh/nrm-desktop/releases/latest)

下载后双击 `.dmg` 文件，将应用拖入「应用程序」文件夹即可完成安装。

若提示「**nrm-desktop.app 已损坏，无法打开**」，通常是 macOS Gatekeeper 拦截未公证的下载包，并非文件损坏。可任选其一：

1. 终端执行：`xattr -cr /Applications/nrm-desktop.app`
2. 在 Finder 中右键应用，选择「打开」一次

> **说明**：默认 Release 提供 Apple Silicon 版本。如需 Intel Mac 版本，可通过 CI 手动构建获取。

## Windows

Windows（不支持 Windows 7）

**正常版本（推荐）** [64位（常用）](https://github.com/coderhsh/nrm-desktop/releases/latest) | [ARM64（不常用）](https://github.com/coderhsh/nrm-desktop/releases/latest)

**其他格式** [便携版（64位）](https://github.com/coderhsh/nrm-desktop/releases/latest) | [MSI（64位）](https://github.com/coderhsh/nrm-desktop/releases/latest)

## 系统要求

- **macOS**：macOS 10.15 或更高版本（Apple Silicon）
- **Windows**：Windows 10 / 11 x64，需安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
