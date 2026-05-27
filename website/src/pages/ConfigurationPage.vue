<script setup lang="ts">
import { t } from '../lib/site'
</script>

<template>
  <section class="page-hero">
    <div class="section-kicker" data-reveal>
      <span>§02</span>
      <span>{{ t({ en: 'Configuration guide', zh: '配置指南' }) }}</span>
    </div>
    <h1 data-reveal>{{ t({ en: 'Know where the app writes state before you trust it.', zh: '在信任工具前，先知道它把状态写到了哪里。' }) }}</h1>
    <p data-reveal>
      {{
        t({
          en: 'This page documents the user-facing locations and settings that matter in nrm desktop: .npmrc, registry metadata, language, theme and close behavior.',
          zh: '这页只讲 nrm desktop 真正会影响使用的状态位置：.npmrc、源元数据、语言、主题和关闭行为。',
        })
      }}
    </p>
  </section>

  <section class="section guide-layout">
    <aside class="guide-toc" data-reveal>
      <h3>{{ t({ en: 'On this page', zh: '本页目录' }) }}</h3>
      <a href="#paths">Paths</a>
      <a href="#npmrc">.npmrc</a>
      <a href="#metadata">{{ t({ en: 'Metadata', zh: '元数据' }) }}</a>
      <a href="#ui">{{ t({ en: 'UI preferences', zh: '界面偏好' }) }}</a>
      <a href="#workflow">{{ t({ en: 'Workflow', zh: '工作流' }) }}</a>
    </aside>

    <div class="guide-body">
      <article id="paths" class="guide-block" data-reveal>
        <h2>{{ t({ en: 'Storage paths', zh: '存储路径' }) }}</h2>
        <p>{{ t({ en: 'The app stores custom registries and metadata under `~/.nrm-desktop/`. That directory also contains the single-instance lock file.', zh: '应用会把自定义源和元数据保存在 `~/.nrm-desktop/` 下，该目录也包含单实例锁文件。' }) }}</p>
        <pre><code>~/.nrm-desktop/
├── custom registries and metadata
└── .instance.lock</code></pre>
      </article>

      <article id="npmrc" class="guide-block" data-reveal>
        <h2>.npmrc</h2>
        <p>{{ t({ en: 'nrm desktop writes npm registry state back to the user `.npmrc`. Source switching therefore affects the same config your CLI tooling reads.', zh: 'nrm desktop 会把 npm 源状态写回用户 `.npmrc`，因此切源结果和命令行工具读取的是同一份配置。' }) }}</p>
      </article>

      <article id="metadata" class="guide-block" data-reveal>
        <h2>{{ t({ en: 'Registry metadata', zh: '源元数据' }) }}</h2>
        <p>{{ t({ en: 'Preset registries ship with the app, while custom categories, ordering and locally managed records live in the app data directory rather than in Git.', zh: '预设源随应用分发，自定义分类、顺序和本地管理记录存放在应用数据目录里，而不是写进 Git 仓库。' }) }}</p>
      </article>

      <article id="ui" class="guide-block" data-reveal>
        <h2>{{ t({ en: 'UI preferences', zh: '界面偏好' }) }}</h2>
        <p>{{ t({ en: 'Theme, language, close behavior and similar local preferences are desktop-side settings. They shape how the app behaves but do not alter release assets or repository code.', zh: '主题、语言、关闭行为等属于桌面端本地偏好设置，会影响应用行为，但不会改动发布资产或仓库代码。' }) }}</p>
      </article>

      <article id="workflow" class="guide-block" data-reveal>
        <h2>{{ t({ en: 'Backup workflow', zh: '备份工作流' }) }}</h2>
        <p>{{ t({ en: 'Prefer the import/export flow when migrating machines or experimenting with mirrors. It is safer than repeatedly editing `.npmrc` by hand.', zh: '在迁移设备或尝试镜像时，优先使用导入导出流程，它比反复手改 `.npmrc` 更稳。' }) }}</p>
      </article>
    </div>
  </section>
</template>
