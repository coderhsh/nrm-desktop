# nrm-desktop 🚀

[简体中文](./README.zh-CN.md)

`nrm-desktop` is a desktop GUI app for npm registry management, built with **Tauri 2 + Vue 3 + TypeScript + Rust**.

It is designed for developers who frequently switch registries and want a fast visual workflow instead of terminal-only commands.

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
- `pnpm build:win` - build Windows-only installer/binaries
- `pnpm ui:dev` - run Vite frontend only
- `pnpm ui:build` - type-check and build frontend only
- `pnpm tauri` - pass-through Tauri CLI command
- `pnpm update:logo` - generate desktop icon set from `src-tauri/icons/logo.png`

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

### 3) Build fails with TypeScript `TS6133`

- There may be existing unused function warnings in frontend files
- Remove unused symbols or connect them to actual handlers, then rebuild

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

## License 📄

No explicit license file is currently included.  
If this project will be distributed publicly, add a `LICENSE` file first.
