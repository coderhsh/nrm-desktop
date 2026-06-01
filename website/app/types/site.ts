export type Locale = 'en' | 'zh'
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
  page: PageKey
  label: Copy
}

export type FooterColumn = {
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

export type SiteConfig = {
  siteName: string
  siteUrl: string
  baseUrl: string
  defaultLocale: Locale
  locales: Locale[]
  defaultTheme: Theme
  themeColor: Record<Theme, string>
  repoUrl: string
  releasesUrl: string
  releaseManifestPath: string
  releaseApiUrl: string
  assets: {
    logo: string
    ogImage: string
    screenshotLightEn: string
  }
  pageMeta: Record<
    PageKey,
    {
      title: Copy
      description: Copy
    }
  >
  nav: NavLink[]
  footerColumns: FooterColumn[]
}
