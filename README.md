# nrm-desktop

[简体中文](./README.zh-CN.md)

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri)](https://v2.tauri.app/)
[![Vue 3](https://img.shields.io/badge/Vue-3-42B883?logo=vue.js)](https://vuejs.org/)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust)](https://www.rust-lang.org/)

A lightweight desktop GUI for npm registry management. Built with **Tauri 2 + Vue 3 + Rust**.

Switch, manage, and test npm registries — without touching the terminal.

## Screenshots

**English UI** shown below. For Simplified Chinese, see [README.zh-CN.md](./README.zh-CN.md#screenshots).

| Light | Dark |
|-------|------|
| ![Light theme](./docs/images/screenshot-light-en.png) | ![Dark theme](./docs/images/screenshot-dark-en.png) |

## Why nrm-desktop

| | nrm-desktop | nrm (CLI) |
|---|---|---|
| Interface | Desktop GUI | Terminal only |
| Speed test | Per-source & bulk, visual results | `nrm test` only |
| Categories | Drag-and-drop category management | Not supported |
| Import/Export | One-click config backup | Manual `.npmrc` editing |
| Tray access | System tray quick switch | Not available |
| Runtime | Tauri (Rust + WebView), ~10 MB footprint | Node.js CLI |

## Features

**Registry Management**
- Add, edit, delete, and switch npm registries in one click
- Preset registries out of the box (npm, yarn, taobao, etc.)
- Custom category groups with drag-and-drop reordering

**Speed Testing**
- Test latency for a single source or all sources at once
- Visual speed indicators for quick comparison

**Workflow Tools**
- Import/export registry configuration
- Registry detail dialog with quick copy (URL, auth token, etc.)
- System tray for fast switching without opening the main window

**Personalization**
- Light / dark / auto theme
- Simplified Chinese / English UI

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20.19+
- [pnpm](https://pnpm.io/)
- [Rust toolchain](https://www.rust-lang.org/tools/install) (`rustup`, `cargo`)
- OS-specific Tauri dependencies — see [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)

<details>
<summary><strong>Windows packaging requirements</strong> (for developers building installers)</summary>

**Runtime** (end users):
- Microsoft Edge WebView2 Runtime — preinstalled on modern Windows, or install via:
  ```bash
  choco install microsoft-edge-webview2-runtime -y
  ```
  [Download page](https://developer.microsoft.com/microsoft-edge/webview2/)

**Build tools** (developers):
- Microsoft Visual Studio C++ Build Tools (MSVC) + Windows 10/11 SDK
- NSIS — `choco install nsis -y` — [Download](https://nsis.sourceforge.io/Download)
- WiX Toolset — `choco install wixtoolset -y` — [Download](https://wixtoolset.org/)

</details>

### Install & Run

```bash
# Install dependencies
pnpm install

# Start in development mode
pnpm dev

# Build production installers
pnpm build
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start desktop app in dev mode (auto port selection) |
| `pnpm build` | Build desktop binaries/installers |
| `pnpm build:win` | Build Windows installer only |
| `pnpm ui:dev` | Start Vite frontend dev server only |
| `pnpm ui:build` | Type-check and build frontend only |
| `pnpm lint` | ESLint check |
| `pnpm test` | Vitest unit tests |
| `pnpm tauri` | Pass-through Tauri CLI |
| `pnpm update:logo` | Generate icon set from `src-tauri/icons/logo.png` |
| `pnpm version` | Sync app version metadata |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3, TypeScript, Pinia, Element Plus, UnoCSS, Vite |
| Desktop | Tauri 2 |
| Backend | Rust (reqwest, tokio) |

## Project Structure

```
src/                    # Vue frontend
  components/           #   UI modules (registry list, cards, dialogs)
  composables/          #   Reusable hooks (i18n, animation, behavior)
  stores/               #   Pinia state management
  api/                  #   Tauri command wrappers
src-tauri/
  src/                  # Rust backend (npmrc ops, speed test, tray, proxy)
  icons/                # App icon assets
scripts/                # Dev/build helpers (auto-port, icon gen, version sync)
docs/images/            # README screenshots
```

## Configuration & Data

| Path | Content |
|------|---------|
| `~/.nrm-desktop/` | Custom registries and metadata |
| `~/.npmrc` | npm config managed by the app |
| `~/.nrm-desktop/.instance.lock` | Single-instance lock |

## Contributing

1. Fork and create a feature branch
2. Make focused changes with clear commit messages
3. Run `pnpm dev` and verify locally
4. Open a PR with a concise description

## License

[Apache-2.0](./LICENSE)
