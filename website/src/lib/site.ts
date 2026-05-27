import { ref, watch } from 'vue'

export type Locale = 'en' | 'zh'
export type Theme = 'light' | 'dark'
export type PageKey = 'home' | 'download' | 'configuration' | 'architecture'

export type Copy = {
  en: string
  zh: string
}

export type GitHubAsset = {
  name: string
  browser_download_url: string
  size: number
}

type GitHubRelease = {
  tag_name: string
  html_url: string
  assets: GitHubAsset[]
}

export type DownloadKind = 'dmg' | 'setup' | 'portable' | 'msi'

export type NavLink = {
  to: string
  page: PageKey
  label: Copy
}

type FooterColumn = {
  title: Copy
  links: Array<
    | {
        to: string
        label: Copy
      }
    | {
        href: string
        label: Copy
      }
  >
}

const STORAGE_LANG = 'nrm-desktop.website.lang'
const STORAGE_THEME = 'nrm-desktop.website.theme'

export const REPO_URL = 'https://github.com/coderhsh/nrm-desktop'
export const RELEASES_URL = `${REPO_URL}/releases`
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`
const RELEASE_API_URL = 'https://api.github.com/repos/coderhsh/nrm-desktop/releases/latest'

const lang = ref<Locale>('en')
const theme = ref<Theme>('dark')
const userPlatform = ref<'macos' | 'windows' | 'other'>('other')
const release = ref<GitHubRelease | null>(null)
const releaseError = ref('')
const isLoadingRelease = ref(false)
const releaseLoaded = ref(false)

let initialized = false
let releasePromise: Promise<void> | null = null

export const pageMeta: Record<PageKey, Copy & { desc: Copy }> = {
  home: {
    en: 'nrm desktop',
    zh: 'nrm desktop',
    desc: {
      en: 'A designed desktop GUI for npm registry switching, speed testing, backup and tray control.',
      zh: '面向 npm 源切换、测速、备份和托盘控制的设计感桌面 GUI。',
    },
  },
  download: {
    en: 'Download · nrm desktop',
    zh: '下载 · nrm desktop',
    desc: {
      en: 'Download the latest nrm desktop releases for macOS and Windows.',
      zh: '下载最新的 nrm desktop macOS 和 Windows 安装包。',
    },
  },
  configuration: {
    en: 'Configuration Guide · nrm desktop',
    zh: '配置指南 · nrm desktop',
    desc: {
      en: 'Where nrm desktop stores .npmrc state, registry metadata and UI preferences.',
      zh: '查看 nrm desktop 的 .npmrc、源元数据和界面偏好存放位置。',
    },
  },
  architecture: {
    en: 'Architecture · nrm desktop',
    zh: '架构 · nrm desktop',
    desc: {
      en: 'Understand how Vue, Tauri and Rust collaborate in the nrm desktop app.',
      zh: '了解 nrm desktop 中 Vue、Tauri 和 Rust 的协作方式。',
    },
  },
}

export const primaryNav: NavLink[] = [
  { to: '/', page: 'home', label: { en: 'Home', zh: '首页' } },
  { to: '/download', page: 'download', label: { en: 'Download', zh: '下载' } },
  { to: '/configuration', page: 'configuration', label: { en: 'Guide', zh: '指南' } },
  { to: '/architecture', page: 'architecture', label: { en: 'Architecture', zh: '架构' } },
]

export const footerColumns: FooterColumn[] = [
  {
    title: { en: 'Product', zh: '产品' },
    links: [
      { to: '/', label: { en: 'Overview', zh: '概览' } },
      { to: '/download', label: { en: 'Downloads', zh: '下载' } },
      { to: '/configuration', label: { en: 'Configuration', zh: '配置' } },
    ],
  },
  {
    title: { en: 'Project', zh: '项目' },
    links: [
      { to: '/architecture', label: { en: 'Architecture', zh: '架构' } },
      { href: REPO_URL, label: { en: 'GitHub', zh: 'GitHub' } },
      { href: `${REPO_URL}/issues`, label: { en: 'Issues', zh: '问题反馈' } },
    ],
  },
  {
    title: { en: 'Release', zh: '发布' },
    links: [
      { href: RELEASES_URL, label: { en: 'All releases', zh: '全部版本' } },
      { href: `${REPO_URL}#readme`, label: { en: 'README', zh: 'README' } },
      { href: `${REPO_URL}/actions`, label: { en: 'Actions', zh: '工作流' } },
    ],
  },
]

const detectLocale = (): Locale => {
  const stored = localStorage.getItem(STORAGE_LANG)
  if (stored === 'en' || stored === 'zh') return stored
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

const detectTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_THEME)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const detectPlatform = (): 'macos' | 'windows' | 'other' => {
  const value = navigator.userAgent.toLowerCase()
  if (value.includes('mac')) return 'macos'
  if (value.includes('win')) return 'windows'
  return 'other'
}

export const t = (copy: Copy) => copy[lang.value]

export const assetUrl = (baseUrl: string, path: string) => `${baseUrl}${path}`

export const formatSize = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

const applyMeta = (page: PageKey) => {
  const meta = pageMeta[page]
  document.title = meta[lang.value]
  document.documentElement.lang = lang.value === 'zh' ? 'zh-CN' : 'en'
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', meta.desc[lang.value])
  document
    .querySelector('meta[property="og:title"]')
    ?.setAttribute('content', meta[lang.value])
  document
    .querySelector('meta[property="og:description"]')
    ?.setAttribute('content', meta.desc[lang.value])
}

const init = () => {
  if (initialized) return
  initialized = true
  lang.value = detectLocale()
  theme.value = detectTheme()
  userPlatform.value = detectPlatform()
  document.documentElement.dataset.theme = theme.value
  document.documentElement.lang = lang.value === 'zh' ? 'zh-CN' : 'en'

  watch(lang, (value) => {
    localStorage.setItem(STORAGE_LANG, value)
  })

  watch(theme, (value) => {
    localStorage.setItem(STORAGE_THEME, value)
    document.documentElement.dataset.theme = value
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', value === 'dark' ? '#07161b' : '#f6f3ed')
  })
}

export const findAsset = (kind: DownloadKind) => {
  const assets = release.value?.assets ?? []
  return assets.find(({ name }) => {
    const normalized = name.toLowerCase()
    if (
      normalized.endsWith('.sig') ||
      normalized.endsWith('.app.tar.gz') ||
      normalized === 'latest.json'
    ) {
      return false
    }
    if (kind === 'dmg') return normalized.endsWith('.dmg')
    if (kind === 'setup') return normalized.endsWith('-setup.exe')
    if (kind === 'portable') return normalized.endsWith('-portable.zip')
    return normalized.endsWith('.msi')
  })
}

export const ensureReleaseLoaded = async () => {
  if (releaseLoaded.value) return
  if (releasePromise) return releasePromise
  isLoadingRelease.value = true
  releaseError.value = ''

  releasePromise = fetch(RELEASE_API_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status}`)
      }
      release.value = (await response.json()) as GitHubRelease
      releaseLoaded.value = true
    })
    .catch((error: unknown) => {
      releaseError.value = error instanceof Error ? error.message : String(error)
    })
    .finally(() => {
      isLoadingRelease.value = false
      releasePromise = null
    })

  return releasePromise
}

const runThemeTransition = async (nextTheme: Theme, event?: MouseEvent) => {
  const apply = () => {
    theme.value = nextTheme
  }

  if (!document.startViewTransition || !event) {
    apply()
    return
  }

  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) {
    apply()
    return
  }

  const { left, top, width, height } = target.getBoundingClientRect()
  const x = left + width / 2
  const y = top + height / 2
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )

  const transition = document.startViewTransition(apply)
  await transition.ready

  const frames = [
    `circle(0px at ${x}px ${y}px)`,
    `circle(${radius}px at ${x}px ${y}px)`,
  ]

  document.documentElement.animate(
    { clipPath: nextTheme === 'dark' ? frames : [...frames].reverse() },
    {
      duration: 720,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      pseudoElement:
        nextTheme === 'dark'
          ? '::view-transition-new(root)'
          : '::view-transition-old(root)',
    },
  )
}

export const useSiteState = () => {
  init()

  const switchLanguage = () => {
    lang.value = lang.value === 'en' ? 'zh' : 'en'
  }

  const switchTheme = async (event?: MouseEvent) => {
    await runThemeTransition(theme.value === 'dark' ? 'light' : 'dark', event)
  }

  return {
    lang,
    theme,
    userPlatform,
    release,
    releaseError,
    isLoadingRelease,
    switchLanguage,
    switchTheme,
    applyMeta,
  }
}
