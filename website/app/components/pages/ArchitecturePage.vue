<script setup lang="ts">
const { t } = useSiteState()
</script>

<template>
  <section class="page-hero">
    <div class="section-kicker" data-reveal>
      <span>§03</span>
      <span>{{ t({ en: 'Architecture', zh: '架构' }) }}</span>
    </div>
    <h1 data-reveal>{{ t({ en: 'Vue, Tauri and Rust on a short, direct path.', zh: 'Vue、Tauri 和 Rust 之间走的是一条很短的直线。' }) }}</h1>
    <p data-reveal>
      {{
        t({
          en: 'The project is not a monorepo and does not expose an HTTP backend. Desktop UI, command bridge and Rust modules stay close together and communicate through Tauri invoke calls.',
          zh: '这个项目不是 monorepo，也没有独立 HTTP 后端。桌面 UI、命令桥和 Rust 模块紧密放在一起，通过 Tauri invoke 调用通信。',
        })
      }}
    </p>
  </section>

  <section class="section">
    <div class="section-kicker" data-reveal>
      <span>§04</span>
      <span>{{ t({ en: 'Application layers', zh: '应用分层' }) }}</span>
    </div>
    <div class="feature-grid">
      <article class="feature-item" data-reveal>
        <span>01</span>
        <h3>{{ t({ en: 'Vue surfaces', zh: 'Vue 界面层' }) }}</h3>
        <p>{{ t({ en: '`src/App.vue` composes the main window. Business modules live under `src/components` and reuse composables, store and API wrappers.', zh: '`src/App.vue` 组合主窗口，业务模块位于 `src/components`，并复用 composable、store 和 API 封装。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>02</span>
        <h3>{{ t({ en: 'Invoke boundary', zh: '调用边界' }) }}</h3>
        <p>{{ t({ en: '`src/api/tauri.ts` and related modules keep Tauri invoke calls in one place instead of scattering them across components.', zh: '`src/api/tauri.ts` 及相关模块把 Tauri invoke 调用集中管理，而不是散落在组件里。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>03</span>
        <h3>{{ t({ en: 'Command layer', zh: '命令层' }) }}</h3>
        <p>{{ t({ en: '`src-tauri/src/commands.rs` exposes desktop capabilities to the frontend and wires them into the Tauri handler list.', zh: '`src-tauri/src/commands.rs` 对前端暴露桌面能力，并接入 Tauri handler 列表。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>04</span>
        <h3>{{ t({ en: 'Rust modules', zh: 'Rust 模块层' }) }}</h3>
        <p>{{ t({ en: 'Actual registry, npmrc, proxy and speed-test behavior lives in sibling Rust modules such as `registries.rs`, `npmrc.rs` and `speedtest.rs`.', zh: '真实的源管理、npmrc、代理和测速逻辑位于 `registries.rs`、`npmrc.rs`、`speedtest.rs` 等 Rust 模块。' }) }}</p>
      </article>
    </div>
  </section>

  <section class="section story-section">
    <div class="section-kicker" data-reveal>
      <span>§05</span>
      <span>{{ t({ en: 'Invoke flow', zh: '调用链路' }) }}</span>
    </div>
    <div class="story-copy full-width">
      <article class="story-step" data-reveal>
        <span>01</span>
        <h3>{{ t({ en: 'Component or store requests an action', zh: '组件或 store 发起操作' }) }}</h3>
        <p>{{ t({ en: 'The frontend calls a typed helper rather than invoking Tauri directly from arbitrary UI code.', zh: '前端先走类型化 helper，而不是在任意 UI 代码里直接调用 Tauri。' }) }}</p>
      </article>
      <article class="story-step" data-reveal>
        <span>02</span>
        <h3>{{ t({ en: 'API wrapper invokes the command', zh: 'API 封装调用 command' }) }}</h3>
        <p>{{ t({ en: 'The wrapper sends a command name and payload through the Tauri invoke bridge.', zh: '封装层会把 command 名称和 payload 通过 Tauri invoke 桥发送出去。' }) }}</p>
      </article>
      <article class="story-step" data-reveal>
        <span>03</span>
        <h3>{{ t({ en: 'Rust command coordinates the module', zh: 'Rust command 编排模块' }) }}</h3>
        <p>{{ t({ en: 'The command layer translates the payload into module calls and returns `Result<_, String>` for the frontend to render.', zh: '命令层把 payload 转换成模块调用，并以 `Result<_, String>` 的形式返回给前端展示。' }) }}</p>
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-kicker" data-reveal>
      <span>§06</span>
      <span>{{ t({ en: 'Build and release', zh: '构建与发布' }) }}</span>
    </div>
    <div class="feature-grid two-columns">
      <article class="feature-item" data-reveal>
        <span>CI</span>
        <h3>{{ t({ en: 'Installer workflows', zh: '安装包工作流' }) }}</h3>
        <p>{{ t({ en: 'The repository already uses GitHub Actions to build Windows and macOS installers, publish releases, and sync release commits back into `dev`.', zh: '仓库已经通过 GitHub Actions 构建 Windows 和 macOS 安装包、发布版本，并把 release commit 同步回 `dev`。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>Pages</span>
        <h3>{{ t({ en: 'Website workflow', zh: '官网工作流' }) }}</h3>
        <p>{{ t({ en: 'The new `website/` app is isolated from the desktop code and deploys separately to GitHub Pages.', zh: '新的 `website/` 应用和桌面端代码隔离管理，并单独部署到 GitHub Pages。' }) }}</p>
      </article>
    </div>
  </section>
</template>
