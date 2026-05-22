# Download Links

Download packages from the [GitHub Releases](https://github.com/coderhsh/nrm-desktop/releases) page.

## macOS

[Apple M chip](https://github.com/coderhsh/nrm-desktop/releases/latest) | [Intel chip](https://github.com/coderhsh/nrm-desktop/releases/latest)

After downloading, double-click the `.dmg` file and drag the app into the Applications folder.

If macOS reports **"nrm-desktop.app is damaged and can't be opened"**, it is usually Gatekeeper blocking an unsigned download, not file corruption. Either:

1. Run in Terminal: `xattr -cr /Applications/nrm-desktop.app`
2. Right-click the app in Finder and choose **Open** once

> **Note**: Default releases include the Apple Silicon build. Intel Mac builds can be produced via the CI build workflow when needed.

## Windows

Windows (Windows 7 not supported)

**Standard (recommended)** [x64 (common)](https://github.com/coderhsh/nrm-desktop/releases/latest) | [ARM64 (uncommon)](https://github.com/coderhsh/nrm-desktop/releases/latest)

**Other formats** [Portable x64](https://github.com/coderhsh/nrm-desktop/releases/latest) | [MSI x64](https://github.com/coderhsh/nrm-desktop/releases/latest)

## Requirements

- **macOS**: macOS 10.15 or later (Apple Silicon)
- **Windows**: Windows 10 / 11 x64 with [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
