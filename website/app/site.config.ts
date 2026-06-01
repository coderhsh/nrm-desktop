import type { SiteConfig } from './types/site'

export const siteConfig = {
  // 站点名称：用于默认标题、品牌名和 Nuxt head 配置。
  siteName: 'nrm desktop',

  // 线上站点完整地址：不要以斜杠结尾，用于 canonical、hreflang、OG 图片和 sitemap。
  siteUrl: 'https://coderhsh.github.io/nrm-desktop',

  // GitHub Pages 子路径：仓库 Pages 使用 /nrm-desktop/，自定义域名时通常改成 /。
  baseUrl: '/nrm-desktop/',

  // 默认语言：根路径和无法识别语言时会回退到这个语言。
  defaultLocale: 'en',

  // 支持的语言列表：新增语言时还需要补对应路由文案和页面 meta。
  locales: ['en', 'zh'],

  // 默认主题：用户没有本地偏好时使用该主题。
  defaultTheme: 'dark',

  // 浏览器主题色：会写入 meta theme-color，并跟随主题切换。
  themeColor: {
    dark: '#07161b',
    light: '#f6f3ed',
  },

  // GitHub 仓库地址：导航、页脚和项目链接都会引用它。
  repoUrl: 'https://github.com/coderhsh/nrm-desktop',

  // GitHub Releases 地址：下载 fallback 和页脚发布链接会引用它。
  releasesUrl: 'https://github.com/coderhsh/nrm-desktop/releases',

  // 站内 Release manifest 路径：CI 会刷新 public/release-manifest.json。
  releaseManifestPath: '/release-manifest.json',

  // GitHub latest release API：站内 manifest 读取失败时作为浏览器端 fallback。
  releaseApiUrl: 'https://api.github.com/repos/coderhsh/nrm-desktop/releases/latest',

  // 静态资源路径：都相对于 website/public，运行时会自动拼接 baseUrl。
  assets: {
    logo: '/images/logo.png',
    ogImage: '/images/screenshot-light-en.png',
    screenshotLightEn: '/images/screenshot-light-en.png',
  },

  // 每个页面的 SEO 标题和描述：用于 title、description、Open Graph、canonical/hreflang 组合。
  pageMeta: {
    home: {
      title: {
        en: 'nrm desktop',
        zh: 'nrm desktop',
      },
      description: {
        en: 'A designed desktop GUI for npm registry switching, speed testing, backup and tray control.',
        zh: '面向 npm 源切换、测速、备份和托盘控制的设计感桌面 GUI。',
      },
    },
    download: {
      title: {
        en: 'Download · nrm desktop',
        zh: '下载 · nrm desktop',
      },
      description: {
        en: 'Download the latest nrm desktop releases for macOS and Windows.',
        zh: '下载最新的 nrm desktop macOS 和 Windows 安装包。',
      },
    },
    configuration: {
      title: {
        en: 'Configuration Guide · nrm desktop',
        zh: '配置指南 · nrm desktop',
      },
      description: {
        en: 'Where nrm desktop stores .npmrc state, registry metadata and UI preferences.',
        zh: '查看 nrm desktop 的 .npmrc、源元数据和界面偏好存放位置。',
      },
    },
    architecture: {
      title: {
        en: 'Architecture · nrm desktop',
        zh: '架构 · nrm desktop',
      },
      description: {
        en: 'Understand how Vue, Tauri and Rust collaborate in the nrm desktop app.',
        zh: '了解 nrm desktop 中 Vue、Tauri 和 Rust 的协作方式。',
      },
    },
  },

  // 顶部导航：page 对应固定页面 key，label 是中英文显示文案。
  nav: [
    { page: 'home', label: { en: 'Home', zh: '首页' } },
    { page: 'download', label: { en: 'Download', zh: '下载' } },
    { page: 'configuration', label: { en: 'Guide', zh: '指南' } },
    { page: 'architecture', label: { en: 'Architecture', zh: '架构' } },
  ],

  // 页脚链接：内部链接使用 page；外部 href 支持完整 URL，也支持 repo、repo:/path、repo:#hash、releases 简写。
  footerColumns: [
    {
      title: { en: 'Product', zh: '产品' },
      links: [
        { page: 'home', label: { en: 'Overview', zh: '概览' } },
        { page: 'download', label: { en: 'Downloads', zh: '下载' } },
        { page: 'configuration', label: { en: 'Configuration', zh: '配置' } },
      ],
    },
    {
      title: { en: 'Project', zh: '项目' },
      links: [
        { page: 'architecture', label: { en: 'Architecture', zh: '架构' } },
        { href: 'repo', label: { en: 'GitHub', zh: 'GitHub' } },
        {
          href: 'repo:/issues',
          label: { en: 'Issues', zh: '问题反馈' },
        },
      ],
    },
    {
      title: { en: 'Release', zh: '发布' },
      links: [
        {
          href: 'releases',
          label: { en: 'All releases', zh: '全部版本' },
        },
        { href: 'repo:#readme', label: { en: 'README', zh: 'README' } },
        {
          href: 'repo:/actions',
          label: { en: 'Actions', zh: '工作流' },
        },
      ],
    },
  ],
} satisfies SiteConfig
