## 选择适合你的安装包

为确保每位用户都能获得最佳体验，我们提供四种安装包。请根据你的使用场景和偏好，参考以下说明进行选择。

### 快速下载

{{DOWNLOAD_TABLE}}

<details>
<summary><b>🍎 macOS</b></summary>

**`.dmg`（推荐 macOS 用户使用）**：这是 macOS 上的标准安装方式。下载后双击打开，将应用图标拖入「应用程序」文件夹即可完成安装，体验最原生、最简洁。

> **说明**：默认 Release 提供 Apple Silicon（M1 / M2 / M3 / M4）版本。如需 Intel Mac 版本，可通过 CI 手动构建获取。

</details>

<details>
<summary><b>💻 Windows</b></summary>

1. **`setup.exe`（推荐 Windows 用户使用）**：这是 Windows 上最常见的安装程序。它会引导你完成安装，并自动在开始菜单和桌面创建快捷方式，提供最完整的集成体验。

2. **`.zip`（便携版，无需安装）**：这是绿色免安装版本。解压后直接运行 `nrm-desktop.exe` 即可——不会在系统中写入注册表或配置文件。适合 U 盘携带或快速试用。

3. **`.msi`（Windows 批量部署 / 管理员）**：这是标准的 Windows Installer 安装包，主要面向企业 IT 管理员或需要静默安装、批量部署的高级用户。支持通过组策略等方式进行无人值守安装。

</details>

### 系统要求

- **macOS**：macOS 10.15 或更高版本（Apple Silicon）
- **Windows**：Windows 10 / 11 x64，需安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
