<script setup lang="ts">
const { assetPath, linkTo, siteConfig, t } = useSiteState()

const scrollToDownload = () => {
  document.getElementById('home-download')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <section class="hero">
    <div class="hero-copy">
      <div class="section-kicker" data-reveal>
        <span>§00</span>
        <span>{{ t({ en: 'Desktop npm registry manager', zh: '桌面端 npm 源管理器' }) }}</span>
      </div>

      <h1 data-reveal>
        {{ t({ en: 'A desktop app built for npm registry management.', zh: '为管理 npm 源而生的桌面端应用。' }) }}
      </h1>
      <p data-reveal>
        {{
          t({
            en: 'nrm desktop turns repetitive npm registry work into a visual flow: switch sources, run latency checks, keep backups, and stay one click away from the tray.',
            zh: 'nrm desktop 把重复的 npm 源管理工作转成可视流程：切换源、测速、备份配置，并通过托盘保持一键可达。',
          })
        }}
      </p>

      <div class="hero-actions" data-reveal>
        <button class="button primary" type="button" @click="scrollToDownload">
          {{ t({ en: 'Download', zh: '下载' }) }}
        </button>
        <NuxtLink class="button secondary" :to="linkTo('configuration')">
          {{ t({ en: 'Read configuration guide', zh: '查看配置指南' }) }}
        </NuxtLink>
      </div>

      <dl class="hero-stats" data-reveal>
        <div>
          <dt>{{ t({ en: 'Backend', zh: '后端' }) }}</dt>
          <dd>Rust</dd>
        </div>
        <div>
          <dt>{{ t({ en: 'Frontend', zh: '前端' }) }}</dt>
          <dd>Vue 3</dd>
        </div>
        <div>
          <dt>{{ t({ en: 'Footprint', zh: '体积' }) }}</dt>
          <dd>~10 MB</dd>
        </div>
      </dl>
    </div>

    <div class="hero-device" data-parallax="0.09" data-reveal>
      <div class="device-window">
        <div class="device-bar"><span></span><span></span><span></span></div>
        <div class="device-body">
          <aside>
            <h3>{{ t({ en: 'Groups', zh: '分类' }) }}</h3>
            <ul>
              <li class="active">npm</li>
              <li>taobao</li>
              <li>yarn</li>
              <li>{{ t({ en: 'private mirror', zh: '私有镜像' }) }}</li>
            </ul>
          </aside>
          <section>
            <div class="device-card active">
              <span>npmjs</span>
              <strong>https://registry.npmjs.org/</strong>
              <small>62ms</small>
            </div>
            <div class="device-card">
              <span>npmmirror</span>
              <strong>https://registry.npmmirror.com/</strong>
              <small>88ms</small>
            </div>
            <div class="device-card">
              <span>{{ t({ en: 'Bulk speed test', zh: '批量测速' }) }}</span>
              <strong>{{ t({ en: 'Visual comparison in one panel', zh: '一个面板内完成可视化对比' }) }}</strong>
            </div>
          </section>
        </div>
      </div>
    </div>
  </section>

  <section id="home-download" class="section">
    <div class="section-kicker" data-reveal>
      <span>§01</span>
      <span>{{ t({ en: 'Release packages', zh: '发布安装包' }) }}</span>
    </div>
    <div class="section-head">
      <h2 data-reveal>{{ t({ en: 'The right build for your platform.', zh: '为你的平台匹配合适的版本。' }) }}</h2>
      <p data-reveal>
        {{
          t({
            en: 'The home page already surfaces the latest release set, while the dedicated download route adds platform notes and fallback links.',
            zh: '首页直接展示最新发布包，而独立下载页会补充平台说明和备用链接。',
          })
        }}
      </p>
    </div>
    <DownloadMatrix dense />
  </section>

  <section class="section story-section">
    <div class="section-kicker" data-reveal>
      <span>§02</span>
      <span>{{ t({ en: 'Workflow scenes', zh: '工作流场景' }) }}</span>
    </div>

    <div class="story-grid">
      <div class="story-media">
        <img :src="assetPath(siteConfig.assets.screenshotLightEn)" alt="nrm desktop screenshot" data-reveal />
      </div>
      <div class="story-copy">
        <article class="story-step" data-reveal>
          <span>01</span>
          <h3>{{ t({ en: 'Switch sources in one pass', zh: '一轮操作内完成切源' }) }}</h3>
          <p>{{ t({ en: 'Preset registries and custom mirrors live in one list instead of scattered shell history.', zh: '预设源和自定义镜像集中在一个列表里，不再分散在 shell 历史里。' }) }}</p>
        </article>
        <article class="story-step" data-reveal>
          <span>02</span>
          <h3>{{ t({ en: 'Compare latency visually', zh: '用视觉结果比较延迟' }) }}</h3>
          <p>{{ t({ en: 'Single-source and batch tests share one quiet panel, making slow mirrors obvious at a glance.', zh: '单源和批量测速都在同一块安静面板里，慢镜像一眼可见。' }) }}</p>
        </article>
        <article class="story-step" data-reveal>
          <span>03</span>
          <h3>{{ t({ en: 'Keep .npmrc recoverable', zh: '让 .npmrc 可恢复' }) }}</h3>
          <p>{{ t({ en: 'Import, export and category metadata reduce the risk of manual config drift.', zh: '导入、导出和分类元数据一起降低手动配置漂移的风险。' }) }}</p>
        </article>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-kicker" data-reveal>
      <span>§03</span>
      <span>{{ t({ en: 'Core capabilities', zh: '核心能力' }) }}</span>
    </div>
    <div class="feature-grid">
      <article class="feature-item" data-reveal>
        <span>01</span>
        <h3>{{ t({ en: 'Registry switching', zh: '一键切源' }) }}</h3>
        <p>{{ t({ en: 'Switch between npm, yarn, taobao and custom registries without leaving the desktop.', zh: '在桌面里直接切换 npm、yarn、taobao 和自定义源。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>02</span>
        <h3>{{ t({ en: 'Latency testing', zh: '可视化测速' }) }}</h3>
        <p>{{ t({ en: 'Run single or bulk speed tests and compare the results with clear visual states.', zh: '支持单源和批量测速，并通过明确的视觉状态比较结果。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>03</span>
        <h3>{{ t({ en: 'Category management', zh: '分类管理' }) }}</h3>
        <p>{{ t({ en: 'Organize registries with drag-and-drop groups built for repeated daily use.', zh: '按高频使用场景拖拽整理分类和顺序。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>04</span>
        <h3>{{ t({ en: 'Import and export', zh: '导入导出' }) }}</h3>
        <p>{{ t({ en: 'Backup registry configuration instead of hand-editing .npmrc files every time.', zh: '通过导入导出备份配置，减少反复手改 .npmrc。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>05</span>
        <h3>{{ t({ en: 'Tray quick actions', zh: '托盘快捷操作' }) }}</h3>
        <p>{{ t({ en: 'Keep source switching close even when the main window is not visible.', zh: '即使主窗口关闭，也能通过托盘保持快速切换。' }) }}</p>
      </article>
      <article class="feature-item" data-reveal>
        <span>06</span>
        <h3>{{ t({ en: 'Localized UI', zh: '本地化界面' }) }}</h3>
        <p>{{ t({ en: 'Built-in English and Simplified Chinese interfaces with light, dark and system modes.', zh: '内置中英文界面，并支持浅色、深色和跟随系统主题。' }) }}</p>
      </article>
    </div>
  </section>

  <section class="section faq-list">
    <div class="section-kicker" data-reveal>
      <span>§04</span>
      <span>FAQ</span>
    </div>
    <article data-reveal>
      <h3>{{ t({ en: 'Does nrm desktop support custom registries?', zh: 'nrm desktop 支持自定义源吗？' }) }}</h3>
      <p>{{ t({ en: 'Yes. The app keeps preset registries together with your own mirrors and lets you organize them with categories and ordering.', zh: '支持。应用会把预设源和你的自定义镜像放在一起管理，并支持分类和排序。' }) }}</p>
    </article>
    <article data-reveal>
      <h3>{{ t({ en: 'Where are custom registry records stored?', zh: '自定义源记录存在哪里？' }) }}</h3>
      <p>{{ t({ en: 'Registry metadata is stored under ~/.nrm-desktop while npm settings continue to live in the user .npmrc.', zh: '源元数据保存在 ~/.nrm-desktop，而 npm 设置仍然写在用户的 .npmrc 里。' }) }}</p>
    </article>
    <article data-reveal>
      <h3>{{ t({ en: 'What if GitHub release assets cannot be read?', zh: '如果读取不到 GitHub 发布资产怎么办？' }) }}</h3>
      <p>{{ t({ en: 'The site keeps direct fallback links to GitHub Releases so downloads remain available.', zh: '官网保留了 GitHub Releases 的备用链接，下载路径不会中断。' }) }}</p>
    </article>
  </section>
</template>
