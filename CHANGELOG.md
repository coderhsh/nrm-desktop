# Changelog

[简体中文](./CHANGELOG.zh-CN.md)

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- CI timing summaries for frontend setup/build, installer packaging, artifact upload, release publishing, and updater manifest generation
- `pnpm sync:tags` helper and documentation for recovering from local release tag conflicts during pull

### Changed

- Status bar metadata now includes the pnpm version alongside app, Node, and npm details, with a more compact inline layout

### Fixed

- Reset defaults confirmation copy now consistently says "Reset" instead of "Restore" in the dialog message, confirm button, and success notification

## [1.1.0] - 2026-05-25

### Added

- In-app auto-update via Tauri updater: silent check on startup (at most once every 24 hours), manual check from Settings, and an update dialog with release notes
- Download progress, install-and-restart flow, and per-version dismiss in the update dialog
- CI release pipeline generates signed updater artifacts and publishes `latest.json` to the fixed `updater` release for clients to consume
- Status bar metadata for application version and environment details

### Changed

- Installer builds in CI now require updater signing secrets and embed the updater public key at build time

## [1.0.1] - 2026-05-21

### Added

- Search highlight in the registry list (`SearchHighlightText`)
- Context menu sorting for registries within a category (by name or latency)
- Cross-category drag-and-drop for registry reordering
- Category-aware import/export (registries, categories, and sort order)
- ESLint, Vitest, and initial unit tests
- Auto-import for Vue, Pinia, and Element Plus APIs/components
- `AGENTS.md` / `CLAUDE.md` for contributor onboarding

### Changed

- Unified registry storage model (legacy preset/custom split removed with migration)
- Upgraded toolchain: Node.js 20.19+, Vite 7, UnoCSS Wind3 preset
- Registry detail quick-copy now includes URL, latency, and category (docs aligned with behavior)
- README workflow section updated to match implemented copy actions

### Fixed

- macOS theme transition when switching light/dark
- Scroll behavior and settings drawer close handling
- Dark-mode styles for category drag-and-drop and context menus

## [1.0.0] - 2026-05-11

First stable release.

### Added

- Desktop GUI for npm registry management (Tauri 2 + Vue 3 + Rust)
- Add, edit, delete, and switch registries; write through to `~/.npmrc`
- Built-in presets (npm, yarn, taobao, etc.) and custom registries
- Per-source and bulk latency testing with visual indicators
- Custom categories with drag-and-drop ordering
- Registry detail dialog and URL copy
- Import/export registry configuration (JSON)
- System tray for quick registry switching
- Light / dark / auto theme and Simplified Chinese / English UI
- Autostart, close behavior (minimize to tray or quit), and single-instance lock
- Proxy settings backend (UI entry optional in later releases)

[Unreleased]: https://github.com/coderhsh/nrm-desktop/compare/v1.1.0...HEAD
[1.1.9]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.9
[1.1.8]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.8
[1.1.7]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.7
[1.1.6]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.6
[1.1.5]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.5
[1.1.4]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.4
[1.1.3]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.3
[1.1.2]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.2
[1.1.1]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.1
[1.1.0]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.0
[1.0.1]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.0.1
[1.0.0]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.0.0
