# nrm-desktop 🚀

[简体中文](./README.zh-CN.md)

`nrm-desktop` is a desktop GUI app for npm registry management, built with **Tauri 2 + Vue 3 + TypeScript + Rust**.

It is designed for developers who frequently switch registries and want a fast visual workflow instead of terminal-only commands.

## Screenshots

UI is shown in **English** below. (For the Simplified Chinese UI, see [README.zh-CN.md](./README.zh-CN.md#界面预览).)

### Light theme

![nrm-desktop main window — light theme, English UI](./docs/images/screenshot-light-en.png)

### Dark theme

![nrm-desktop main window — dark theme, English UI](./docs/images/screenshot-dark-en.png)

## Why nrm-desktop ✨

- **Fast workflow**: switch registries in one click, no command memorization needed
- **Lightweight desktop runtime**: powered by Tauri (Rust backend + WebView), smaller and leaner than many Electron-based tools
- **Responsive UI**: category management, drag-and-drop, and speed test actions are optimized for daily use
- **Practical out-of-box features**: import/export, tray access, source detail copy, and theme/language settings
- **Built for real developer habits**: frequent source switching, single-source retest, and quick fallback between registries

## Core Features 🧩

- Add, edit, delete, and switch npm registries
- Manage preset and custom registries in categories
- Drag-and-drop to move registries across categories
- Test latency for all sources or a single source
- Registry detail dialog with copy actions
- Import/export configuration
- Theme support (light / dark / auto)
- Language support (Simplified Chinese / English)
- System tray integration for quick actions

## Performance & Size 📊

Current measurable footprint in this repository:

- Frontend build output (`dist/assets`):
  - JS bundle: `~993 KB`
  - CSS bundle: `~357 KB`
- Rust debug binary (`src-tauri/target/debug/nrm-desktop.exe`): `~23 MB`

Runtime characteristics:

- Native desktop runtime via Tauri + Rust backend (lower overhead than many Electron-first stacks)
- Fast startup in daily dev usage, with lightweight tray/background behavior
- Auto-port dev startup script helps reduce restart friction during development

> Note: final release installer/package size depends on target OS, architecture, build profile, and bundling options.

## Tech Stack 🛠️

- Frontend: Vue 3, TypeScript, Pinia, Element Plus, VueUse, UnoCSS, Vite
- Desktop runtime: Tauri 2
- Backend: Rust (command handlers, npmrc operations, speed test)
- Networking: reqwest + tokio

## Prerequisites 📦

Install the following before running locally:

- Node.js 18+
- pnpm
- Rust toolchain (`rustup`, `cargo`)
- OS-specific Tauri dependencies

Reference:
[Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Windows packaging/runtime requirements

For Windows users, separate runtime requirements from packaging requirements:

- Runtime (for end users):
  - Microsoft Edge WebView2 Runtime (usually preinstalled on modern Windows; install manually if missing)
- Packaging (for developers):
  - Microsoft Visual Studio C++ Build Tools (MSVC toolchain)
  - Windows 10/11 SDK
  - NSIS (required for `nsis` installer output)
  - WiX Toolset (required for `msi` output; `pnpm build:win` generates MSI+NSIS on Windows)

#### Common install commands and official links

- WebView2 Runtime
  - Common install command (Chocolatey):
    - `choco install microsoft-edge-webview2-runtime -y`
  - Official download:
    - [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
- NSIS
  - Common install command (Chocolatey):
    - `choco install nsis -y`
  - Official download:
    - [NSIS Download](https://nsis.sourceforge.io/Download)
- WiX Toolset
  - Common install command (Chocolatey):
    - `choco install wixtoolset -y`
  - Official download:
    - [WiX Toolset](https://wixtoolset.org/)

## Quick Start ⚡

Install dependencies:

```bash
pnpm install
```

Run desktop app in development:

```bash
pnpm dev
```

Build production bundles:

```bash
pnpm build
```

## Available Scripts 📜

- `pnpm dev` - run desktop app in dev mode (auto port selection)
- `pnpm build` - build desktop binaries/installers with output summary
- `pnpm build:pretty` - alias of `pnpm build` (kept for compatibility)
- `pnpm build:win` - build Windows-only installer/binaries
- `pnpm ui:dev` - run Vite frontend only
- `pnpm ui:build` - type-check and build frontend only
- `pnpm tauri` - pass-through Tauri CLI command
- `pnpm update:logo` - generate desktop icon set from `src-tauri/icons/logo.png`
- `pnpm version` - sync desktop app version metadata
- `pnpm sync:version` - same as `pnpm version`, explicit command name

## Project Structure 📁

Key directories in this repository:

- `src/` - Vue UI, styles, composables, and state logic
- `src/components/` - major interface modules (registry list, cards, dialogs)
- `src/composables/` - reusable composition hooks (i18n, motion, behavior)
- `src-tauri/src/` - Rust backend and Tauri entry points
- `src-tauri/icons/` - icon source files and generated assets
- `scripts/` - dev/build helpers (auto-port startup, build output, icon generation)

## Build Output Notes 📦

- Frontend output is generated under `dist/`
- Tauri build artifacts are generated under `src-tauri/target/`
- Windows installer outputs depend on enabled targets (`nsis` / `msi`)

## Configuration and Data 🗂️

User data is stored under home directory:

- Registry custom data and metadata: `~/.nrm-desktop/`
- npm registry file managed by app: `~/.npmrc`
- Single-instance lock file: `~/.nrm-desktop/.instance.lock`

## Tray and Exit Behavior 🧷

- Tray behavior is implemented in `src-tauri/src/lib.rs`
- App enforces single-instance startup in `src-tauri/src/main.rs`
- In dev mode, `scripts/tauri-dev-auto-port.mjs` creates temporary Tauri config and removes tray config fields to avoid duplicate tray icons

## Icons 🎨

Icon assets live in:

- `src-tauri/icons/`

Icon mapping reference:

- `src-tauri/icons/README.md`

## Troubleshooting 🩺

### 1) Duplicate tray icon in Windows

- Make sure you are using latest code where:
  - tray is created only in Rust (`TrayIconBuilder`)
  - `app.trayIcon` is removed from generated dev config
- Fully stop old processes before restarting:
  - stop `pnpm dev`
  - restart the app

### 2) Dev port already in use

- `pnpm dev` uses auto-port script and should pick an available port
- If stale processes remain, stop the existing dev task and restart

## Contribution 🤝

1. Create a feature branch
2. Make focused changes with clear commit messages
3. Run checks/build locally before opening PR
4. Keep commits small and reviewable

## Roadmap (Suggested) 🗺️

- Complete full UI i18n coverage for all dialogs/messages
- Add E2E test coverage for key workflows
- Improve export/import compatibility checks
- Add optional registry presets sync

