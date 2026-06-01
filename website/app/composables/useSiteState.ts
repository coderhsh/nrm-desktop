import { computed, watch } from 'vue'
import { navigateTo, useHead, useRoute, useRuntimeConfig, useSeoMeta, useState } from '#imports'
import {
  footerColumns,
  htmlLang,
  isLocale,
  latestReleaseUrl,
  localizedPath,
  normalizeLocale,
  pagePaths,
  primaryNav,
} from '../lib/site-runtime'
import { siteConfig } from '../site.config'
import type {
  Copy,
  DownloadKind,
  GitHubRelease,
  Locale,
  PageKey,
  Theme,
} from '../types/site'

const STORAGE_LANG = 'nrm-desktop.website.lang'
const STORAGE_THEME = 'nrm-desktop.website.theme'

type Platform = 'macos' | 'windows' | 'other'

let initialized = false
let releasePromise: Promise<void> | null = null

const trimTrailingSlash = (value: string) => value.replace(/\/$/, '')

const withBase = (baseUrl: string, path: string) => {
  if (/^https?:\/\//.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (baseUrl === '/') return normalizedPath
  return `${trimTrailingSlash(baseUrl)}${normalizedPath}`
}

const detectLocale = (): Locale => {
  const stored = localStorage.getItem(STORAGE_LANG)
  if (isLocale(stored)) return stored
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : siteConfig.defaultLocale
}

const detectTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_THEME)
  if (stored === 'light' || stored === 'dark') return stored
  return siteConfig.defaultTheme
}

const detectPlatform = (): Platform => {
  const value = navigator.userAgent.toLowerCase()
  if (value.includes('mac')) return 'macos'
  if (value.includes('win')) return 'windows'
  return 'other'
}

const applyThemeDomState = (value: Theme) => {
  document.documentElement.dataset.theme = value
}

export const formatSize = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

export const getPreferredLocale = () => {
  if (!import.meta.client) return siteConfig.defaultLocale
  return detectLocale()
}

export const getPageKeyFromPath = (path: string): PageKey => {
  const entry = Object.entries(pagePaths).find(([, pagePath]) => pagePath === path)
  return (entry?.[0] as PageKey | undefined) ?? 'home'
}

export const useSiteState = () => {
  const route = useRoute()
  const runtimeConfig = useRuntimeConfig()
  const theme = useState<Theme>('site-theme', () => siteConfig.defaultTheme)
  const userPlatform = useState<Platform>('site-platform', () => 'other')
  const release = useState<GitHubRelease | null>('site-release', () => null)
  const releaseError = useState('site-release-error', () => '')
  const isLoadingRelease = useState('site-release-loading', () => false)
  const releaseLoaded = useState('site-release-loaded', () => false)

  const lang = computed<Locale>(() => normalizeLocale(route.params.locale))
  const currentPage = computed<PageKey>(() => {
    return (route.meta.pageKey as PageKey | undefined) ?? getPageKeyFromPath(route.path.replace(/^\/(en|zh)/, '') || '')
  })

  const t = (copy: Copy) => copy[lang.value]

  const assetPath = (path: string) => withBase(runtimeConfig.app.baseURL, path)

  const linkTo = (page: PageKey, locale: Locale = lang.value) => localizedPath(locale, page)

  const switchLanguage = async () => {
    const nextLocale = lang.value === 'en' ? 'zh' : 'en'
    if (import.meta.client) {
      localStorage.setItem(STORAGE_LANG, nextLocale)
    }
    await navigateTo(linkTo(currentPage.value, nextLocale))
  }

  const switchTheme = async (event?: MouseEvent) => {
    const nextTheme: Theme = theme.value === 'dark' ? 'light' : 'dark'
    const apply = () => {
      theme.value = nextTheme
      if (import.meta.client) {
        applyThemeDomState(nextTheme)
      }
    }

    if (!import.meta.client || !document.startViewTransition || !event) {
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

    const root = document.documentElement
    root.classList.add('is-theme-transitioning')

    try {
      const transition = document.startViewTransition(apply)
      await transition.ready

      const animation = root.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
        },
        {
          duration: 720,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )

      await Promise.allSettled([animation.finished, transition.finished])
    } finally {
      root.classList.remove('is-theme-transitioning')
    }
  }

  const findAsset = (kind: DownloadKind) => {
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

  const ensureReleaseLoaded = async () => {
    if (releaseLoaded.value) return
    if (releasePromise) return releasePromise
    isLoadingRelease.value = true
    releaseError.value = ''

    releasePromise = fetch(assetPath(siteConfig.releaseManifestPath), {
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Manifest ${response.status}`)
        }
        return (await response.json()) as GitHubRelease
      })
      .catch(async () => {
        const response = await fetch(siteConfig.releaseApiUrl, {
          headers: { Accept: 'application/vnd.github+json' },
        })
        if (!response.ok) {
          throw new Error(`GitHub API ${response.status}`)
        }
        return (await response.json()) as GitHubRelease
      })
      .then((data) => {
        release.value = data
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

  const initClientState = () => {
    if (!import.meta.client || initialized) return
    initialized = true
    theme.value = detectTheme()
    userPlatform.value = detectPlatform()
    applyThemeDomState(theme.value)

    watch(
      theme,
      (value) => {
        localStorage.setItem(STORAGE_THEME, value)
        applyThemeDomState(value)
      },
      { immediate: true },
    )

    watch(
      lang,
      (value) => {
        localStorage.setItem(STORAGE_LANG, value)
      },
      { immediate: true },
    )
  }

  return {
    assetPath,
    currentPage,
    ensureReleaseLoaded,
    findAsset,
    formatSize,
    footerColumns,
    isLoadingRelease,
    lang,
    latestReleaseUrl,
    linkTo,
    primaryNav,
    release,
    releaseError,
    siteConfig,
    switchLanguage,
    switchTheme,
    t,
    theme,
    userPlatform,
    initClientState,
  }
}

export const useSiteHead = () => {
  const { lang, theme } = useSiteState()

  useHead(() => ({
    htmlAttrs: {
      lang: htmlLang(lang.value),
      'data-theme': theme.value,
    },
    meta: [
      {
        name: 'theme-color',
        content: siteConfig.themeColor[theme.value],
      },
    ],
  }))
}

export const usePageSeo = (page: PageKey) => {
  const route = useRoute()
  const runtimeConfig = useRuntimeConfig()
  const locale = computed(() => normalizeLocale(route.params.locale))
  const meta = computed(() => siteConfig.pageMeta[page])
  const routePath = computed(() => localizedPath(locale.value, page))
  const canonical = computed(() => `${trimTrailingSlash(siteConfig.siteUrl)}${routePath.value}`)
  const ogImage = computed(() => `${trimTrailingSlash(siteConfig.siteUrl)}${siteConfig.assets.ogImage}`)

  useSeoMeta({
    title: () => meta.value.title[locale.value],
    description: () => meta.value.description[locale.value],
    ogType: 'website',
    ogTitle: () => meta.value.title[locale.value],
    ogDescription: () => meta.value.description[locale.value],
    ogImage: () => ogImage.value,
  })

  useHead(() => ({
    link: [
      { rel: 'canonical', href: canonical.value },
      ...siteConfig.locales.map((targetLocale) => ({
        rel: 'alternate',
        hreflang: htmlLang(targetLocale),
        href: `${trimTrailingSlash(siteConfig.siteUrl)}${localizedPath(targetLocale, page)}`,
      })),
      {
        rel: 'alternate',
        hreflang: 'x-default',
        href: `${trimTrailingSlash(siteConfig.siteUrl)}${localizedPath(siteConfig.defaultLocale, page)}`,
      },
      {
        rel: 'icon',
        href: withBase(runtimeConfig.app.baseURL, siteConfig.assets.logo),
      },
    ],
  }))
}
