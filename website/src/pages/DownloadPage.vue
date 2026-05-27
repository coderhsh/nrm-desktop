<script setup lang="ts">
import DownloadMatrix from '../components/DownloadMatrix.vue'
import { t } from '../lib/site'
</script>

<template>
  <section class="page-hero page-hero-download">
    <div class="section-kicker" data-reveal>
      <span>§01</span>
      <span>{{ t({ en: 'Release downloads', zh: '版本下载' }) }}</span>
    </div>
    <h1 data-reveal>{{ t({ en: 'Choose the right package and keep moving.', zh: '选对安装包，然后继续工作。' }) }}</h1>
    <p data-reveal>
      {{
        t({
          en: 'The download route keeps one job in focus: matching the current release to the right desktop package, with platform notes close by.',
          zh: '下载页专注一件事：把当前版本和正确的桌面安装包对应起来，并把平台说明放在最近的位置。',
        })
      }}
    </p>
  </section>

  <section class="section">
    <DownloadMatrix />
  </section>

  <section class="section install-notes">
    <div class="section-kicker" data-reveal>
      <span>§02</span>
      <span>{{ t({ en: 'Install notes', zh: '安装提示' }) }}</span>
    </div>
    <div class="feature-grid two-columns">
      <article class="feature-item" data-reveal>
        <span>macOS</span>
        <h3>Gatekeeper</h3>
        <p>{{ t({ en: 'If macOS reports the app as damaged, clear quarantine with `xattr -cr /Applications/nrm-desktop.app`, or right-click and choose Open once.', zh: '若 macOS 提示应用已损坏，可执行 `xattr -cr /Applications/nrm-desktop.app` 清除隔离属性，或在 Finder 中右键打开一次。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>Windows</span>
        <h3>WebView2</h3>
        <p>{{ t({ en: 'Windows 10 / 11 x64 is supported. Modern Windows often ships with WebView2 Runtime, but install it manually if the target machine is missing it.', zh: '支持 Windows 10 / 11 x64。多数新系统已带 WebView2 Runtime，缺失时按提示补装即可。' }) }}</p>
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-kicker" data-reveal>
      <span>§03</span>
      <span>{{ t({ en: 'Package intent', zh: '包类型说明' }) }}</span>
    </div>
    <div class="feature-grid">
      <article class="feature-item" data-reveal>
        <span>01</span>
        <h3>{{ t({ en: 'DMG', zh: 'DMG' }) }}</h3>
        <p>{{ t({ en: 'The default macOS distribution. Current public releases primarily target Apple Silicon builds.', zh: '默认 macOS 发布方式。当前公开版本主要覆盖 Apple Silicon 构建。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>02</span>
        <h3>{{ t({ en: 'Setup EXE', zh: '安装版 EXE' }) }}</h3>
        <p>{{ t({ en: 'The default Windows installer for most users. Best fit when you just want to install and start.', zh: '大多数 Windows 用户的默认安装方式，适合直接安装后开始使用。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>03</span>
        <h3>{{ t({ en: 'Portable ZIP and MSI', zh: '便携版 ZIP 与 MSI' }) }}</h3>
        <p>{{ t({ en: 'Portable is convenient for quick trials. MSI is aimed at administrator-controlled deployment.', zh: '便携版适合快速试用，MSI 更适合管理员控制的部署场景。' }) }}</p>
      </article>
    </div>
  </section>
</template>
