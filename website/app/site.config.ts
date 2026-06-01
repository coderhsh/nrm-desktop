export const locales = ['en', 'zh'] as const

export type Locale = (typeof locales)[number]
export type Theme = 'light' | 'dark'
export type PageKey = 'home' | 'download' | 'configuration' | 'architecture'

export type Copy = Record<Locale, string>

export type GitHubAsset = {
  name: string
  browser_download_url: string
  size: number
}

export type GitHubRelease = {
  tag_name: string
  html_url: string
  assets: GitHubAsset[]
}

export type DownloadKind = 'dmg' | 'setup' | 'portable' | 'msi'

export type NavLink = {
  path: string
  page: PageKey
  label: Copy
}

type FooterColumn = {
  title: Copy
  links: Array<
    | {
        page: PageKey
        label: Copy
      }
    | {
        href: string
        label: Copy
      }
  >
}

export const pagePaths: Record<PageKey, string> = {
  home: '',
  download: '/download',
  configuration: '/configuration',
  architecture: '/architecture',
}

export const siteConfig = {
  siteName: 'nrm desktop',
  siteUrl: 'https://coderhsh.github.io/nrm-desktop',
  baseUrl: '/nrm-desktop/',
  defaultLocale: 'en',
  locales,
  defaultTheme: 'dark',
  themeColor: {
    dark: '#07161b',
    light: '#f6f3ed',
  },
  repoUrl: 'https://github.com/coderhsh/nrm-desktop',
  releasesUrl: 'https://github.com/coderhsh/nrm-desktop/releases',
  releaseManifestPath: '/release-manifest.json',
  releaseApiUrl: 'https://api.github.com/repos/coderhsh/nrm-desktop/releases/latest',
  assets: {
    logo: '/images/logo.png',
    ogImage: '/images/screenshot-light-en.png',
    screenshotLightEn: '/images/screenshot-light-en.png',
  },
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
} as const

export const latestReleaseUrl = `${siteConfig.releasesUrl}/latest`

export const primaryNav: NavLink[] = [
  { path: pagePaths.home, page: 'home', label: { en: 'Home', zh: '首页' } },
  { path: pagePaths.download, page: 'download', label: { en: 'Download', zh: '下载' } },
  { path: pagePaths.configuration, page: 'configuration', label: { en: 'Guide', zh: '指南' } },
  { path: pagePaths.architecture, page: 'architecture', label: { en: 'Architecture', zh: '架构' } },
]

export const footerColumns: FooterColumn[] = [
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
      { href: siteConfig.repoUrl, label: { en: 'GitHub', zh: 'GitHub' } },
      { href: `${siteConfig.repoUrl}/issues`, label: { en: 'Issues', zh: '问题反馈' } },
    ],
  },
  {
    title: { en: 'Release', zh: '发布' },
    links: [
      { href: siteConfig.releasesUrl, label: { en: 'All releases', zh: '全部版本' } },
      { href: `${siteConfig.repoUrl}#readme`, label: { en: 'README', zh: 'README' } },
      { href: `${siteConfig.repoUrl}/actions`, label: { en: 'Actions', zh: '工作流' } },
    ],
  },
]

export const prerenderRoutes = siteConfig.locales.flatMap((locale) => {
  return Object.values(pagePaths).map((path) => `/${locale}${path}`)
})

export const isLocale = (value: unknown): value is Locale => {
  return typeof value === 'string' && locales.includes(value as Locale)
}

export const normalizeLocale = (value: unknown): Locale => {
  return isLocale(value) ? value : siteConfig.defaultLocale
}

export const htmlLang = (locale: Locale) => (locale === 'zh' ? 'zh-CN' : 'en')

export const localizedPath = (locale: Locale, page: PageKey) => `/${locale}${pagePaths[page]}`

export const localizedRawPath = (locale: Locale, path: string) => `/${locale}${path}`
