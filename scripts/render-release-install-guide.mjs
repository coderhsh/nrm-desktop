/* @desc 渲染 Release Downloads 区（英文描述 + 折叠下载链接），供 build-release-body 拼接到 release body。 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  listReleaseArtifactNames,
  normalizeReleaseArtifactOptions,
} from './artifact-names.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const RELEASE_TEMPLATE_FILE = path.join(rootDir, 'docs', 'release-install-guide.release.md')

/** @type {readonly ('setup' | 'portable' | 'msi')[]} */
const WINDOWS_KIND_ORDER = ['setup', 'portable', 'msi']

/** @type {Record<'en' | 'zh', Record<'aarch64' | 'x64', string>>>} */
const MACOS_ITEM_COPY = {
  en: {
    aarch64:
      'After downloading, double-click the `.dmg` file and drag the app into the Applications folder. Recommended for Apple M series Macs.',
    x64:
      'After downloading, double-click the `.dmg` file and drag the app into the Applications folder. For Intel-based Macs.',
  },
  zh: {
    aarch64:
      '下载后双击 `.dmg` 文件，将应用拖入「应用程序」文件夹。推荐 Apple M 系列 Mac 使用。',
    x64: '下载后双击 `.dmg` 文件，将应用拖入「应用程序」文件夹。适用于 Intel 芯片 Mac。',
  },
}

/** @type {Record<'en' | 'zh', Record<'setup' | 'portable' | 'msi', string>>>} */
const WINDOWS_ITEM_COPY = {
  en: {
    setup: 'Standard installer with Start Menu and Desktop shortcuts. Recommended for most users.',
    portable:
      'Extract and run directly — no installation required. Ideal for USB drives or quick trials.',
    msi: 'For IT administrators who need silent installation or bulk deployment.',
  },
  zh: {
    setup: '常见安装程序，会自动创建开始菜单和桌面快捷方式。推荐大多数用户使用。',
    portable: '解压后直接运行，无需安装。适合 U 盘携带或快速试用。',
    msi: '面向企业 IT 管理员，支持静默安装与批量部署。',
  },
}

/** @type {Record<'en' | 'zh', Record<string, string>>>} */
const DOWNLOADS_TEXT = {
  en: {
    osMacosSummary: '🍎 macOS',
    osWindowsSummary: '💻 Windows',
    windowsRequirements:
      'Windows 10 / 11 x64 (Windows 7 not supported). [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) required.',
    standardHeader: 'Standard (recommended)',
    chineseGuideSummary: '下载指引（中文）',
    noPackages: 'No installation packages were built for this release.',
  },
  zh: {
    osMacosSummary: '🍎 macOS',
    osWindowsSummary: '💻 Windows',
    windowsRequirements:
      'Windows 10 / 11 x64（不支持 Windows 7）。需安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。',
    standardHeader: '正常版本（推荐）',
    chineseGuideSummary: '下载指引（中文）',
    noPackages: '本次 Release 未构建任何安装包。',
  },
}

/**
 * @param {string} name
 * @returns {string}
 */
function parseArgValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) {
    return ''
  }
  return process.argv[index + 1].trim()
}

/**
 * @param {string} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function parseEnvBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

/**
 * @returns {import('./artifact-names.mjs').ReleaseArtifactOptions}
 */
export function readReleaseArtifactOptionsFromEnv() {
  return normalizeReleaseArtifactOptions({
    buildWindowsX64: parseEnvBoolean(process.env.RELEASE_BUILD_WINDOWS_X64, true),
    buildMacosX64: parseEnvBoolean(process.env.RELEASE_BUILD_MACOS_X64, false),
    buildMacosArm64: parseEnvBoolean(process.env.RELEASE_BUILD_MACOS_ARM64, true),
    windowsSetupExe: parseEnvBoolean(process.env.RELEASE_WINDOWS_SETUP_EXE, true),
    windowsMsi: parseEnvBoolean(process.env.RELEASE_WINDOWS_MSI, true),
    windowsPortableZip: parseEnvBoolean(process.env.RELEASE_WINDOWS_PORTABLE_ZIP, true),
  })
}

/**
 * @returns {string}
 */
export function resolveGitHubRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY
  }

  const pkgPath = path.join(rootDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const repoUrl = pkg.repository?.url
  if (typeof repoUrl !== 'string') {
    throw new Error('[render-release-install-guide] 无法解析 GitHub 仓库地址')
  }

  const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/i)
  if (!match) {
    throw new Error('[render-release-install-guide] package.json repository.url 不是 GitHub 地址')
  }
  return match[1]
}

/**
 * @param {string} commitSha
 * @param {string} filePath
 * @returns {string}
 */
export function buildDocBlobUrl(commitSha, filePath) {
  const repository = resolveGitHubRepository()
  return `https://github.com/${repository}/blob/${commitSha}/${filePath}`
}

/**
 * @param {string} repository owner/repo
 * @param {string} downloadSlug Release 下载 slug（如 v1.0.1 或 untagged-xxx）
 * @param {string} filename
 * @returns {string}
 */
export function buildReleaseAssetUrl(repository, downloadSlug, filename) {
  return `https://github.com/${repository}/releases/download/${downloadSlug}/${filename}`
}

/**
 * @param {string} commitSha
 * @returns {string}
 */
export function buildChangelogLinksLine(commitSha) {
  const englishUrl = buildDocBlobUrl(commitSha, 'CHANGELOG.md')
  const chineseUrl = buildDocBlobUrl(commitSha, 'CHANGELOG.zh-CN.md')
  return `[Full changelog](${englishUrl}) · [完整更新日志](${chineseUrl})`
}

/**
 * @param {import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }} item
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function artifactDownloadLabel(item, locale) {
  if (item.platform === 'macos') {
    if (item.arch === 'aarch64') {
      return locale === 'zh' ? 'Apple M芯片' : 'Apple M chip'
    }
    if (item.arch === 'x64') {
      return locale === 'zh' ? 'Intel芯片' : 'Intel chip'
    }
  }

  if (item.platform === 'windows') {
    if (item.kind === 'setup') {
      if (item.arch === 'x64') {
        return locale === 'zh' ? '64位（常用）' : 'x64 (common)'
      }
      if (item.arch === 'aarch64') {
        return locale === 'zh' ? 'ARM64（不常用）' : 'ARM64 (uncommon)'
      }
    }
    if (item.kind === 'portable') {
      return locale === 'zh' ? '便携版（64位）' : 'Portable x64'
    }
    if (item.kind === 'msi') {
      return locale === 'zh' ? 'MSI（64位）' : 'MSI x64'
    }
  }

  return item.filename
}

/**
 * @param {import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }} item
 * @param {string} url
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function artifactDownloadLink(item, url, locale) {
  return `[${artifactDownloadLabel(item, locale)}](${url})`
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} artifacts
 * @returns {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>}
 */
function sortMacArtifacts(artifacts) {
  return [...artifacts].sort((left, right) => {
    if (left.arch === right.arch) {
      return 0
    }
    return left.arch === 'aarch64' ? -1 : 1
  })
}

/**
 * @param {import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }} item
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function getItemDescription(item, locale) {
  if (item.platform === 'macos') {
    return MACOS_ITEM_COPY[locale][item.arch]
  }
  if (item.platform === 'windows') {
    return WINDOWS_ITEM_COPY[locale][item.kind]
  }
  return ''
}

/**
 * @param {import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }} item
 * @param {string} repository
 * @param {string} downloadSlug
 * @param {'en' | 'zh'} locale
 * @param {Record<string, string> | undefined} assetUrlByFilename
 * @returns {string}
 */
function buildDownloadItemLine(item, repository, downloadSlug, locale, assetUrlByFilename) {
  const url = assetUrlByFilename?.[item.filename]
    ?? buildReleaseAssetUrl(repository, downloadSlug, item.filename)
  const link = artifactDownloadLink(item, url, locale)
  return `- ${link}: ${getItemDescription(item, locale)}`
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} artifacts
 * @param {string} repository
 * @param {string} downloadSlug
 * @param {'en' | 'zh'} locale
 * @param {Record<string, string> | undefined} assetUrlByFilename
 * @returns {string}
 */
function buildDownloadItemLines(artifacts, repository, downloadSlug, locale, assetUrlByFilename) {
  return artifacts
    .map(item => buildDownloadItemLine(item, repository, downloadSlug, locale, assetUrlByFilename))
    .join('\n')
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} macArtifacts
 * @param {string} repository
 * @param {string} downloadSlug
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function buildMacosSection(macArtifacts, repository, downloadSlug, locale, assetUrlByFilename) {
  if (macArtifacts.length === 0) {
    return ''
  }

  const text = DOWNLOADS_TEXT[locale]
  const items = buildDownloadItemLines(
    sortMacArtifacts(macArtifacts),
    repository,
    downloadSlug,
    locale,
    assetUrlByFilename,
  )

  return `<details open>
<summary><b>${text.osMacosSummary}</b></summary>

${items}

</details>`
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} winArtifacts
 * @param {string} repository
 * @param {string} version
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function buildWindowsLinksBlock(winArtifacts, repository, downloadSlug, locale, assetUrlByFilename) {
  const text = DOWNLOADS_TEXT[locale]
  const byKind = Object.fromEntries(winArtifacts.map(item => [item.kind, item]))
  const lines = []

  for (const kind of WINDOWS_KIND_ORDER) {
    const item = byKind[kind]
    if (!item) {
      continue
    }
    if (kind === 'setup' && lines.length === 0) {
      lines.push(`**${text.standardHeader}**`, '')
    }
    lines.push(buildDownloadItemLine(item, repository, downloadSlug, locale, assetUrlByFilename))
  }

  return lines.join('\n')
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} winArtifacts
 * @param {string} repository
 * @param {string} downloadSlug
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function buildWindowsSection(winArtifacts, repository, downloadSlug, locale, assetUrlByFilename) {
  if (winArtifacts.length === 0) {
    return ''
  }

  const text = DOWNLOADS_TEXT[locale]
  const items = buildWindowsLinksBlock(winArtifacts, repository, downloadSlug, locale, assetUrlByFilename)

  return `<details open>
<summary><b>${text.osWindowsSummary}</b></summary>

${text.windowsRequirements}

${items}

</details>`
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} macArtifacts
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} winArtifacts
 * @param {string} repository
 * @param {string} version
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function buildLocalizedDownloadsContent(
  macArtifacts,
  winArtifacts,
  repository,
  downloadSlug,
  locale,
  assetUrlByFilename,
) {
  const sections = [
    buildMacosSection(macArtifacts, repository, downloadSlug, locale, assetUrlByFilename),
    buildWindowsSection(winArtifacts, repository, downloadSlug, locale, assetUrlByFilename),
  ].filter(Boolean)

  if (sections.length === 0) {
    return DOWNLOADS_TEXT[locale].noPackages
  }

  return sections.join('\n\n')
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} macArtifacts
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} winArtifacts
 * @param {string} repository
 * @param {string} downloadSlug
 * @returns {string}
 */
function buildDownloadsContent(macArtifacts, winArtifacts, repository, downloadSlug, assetUrlByFilename) {
  const english = buildLocalizedDownloadsContent(
    macArtifacts,
    winArtifacts,
    repository,
    downloadSlug,
    'en',
    assetUrlByFilename,
  )
  const chinese = buildLocalizedDownloadsContent(
    macArtifacts,
    winArtifacts,
    repository,
    downloadSlug,
    'zh',
    assetUrlByFilename,
  )

  return `${english}

<details>
<summary><b>${DOWNLOADS_TEXT.zh.chineseGuideSummary}</b></summary>

${chinese}

</details>`
}

/**
 * @param {string} templatePath
 * @param {{ downloadsContent: string }} replacements
 * @returns {string}
 */
function renderTemplate(templatePath, replacements) {
  let content = readFileSync(templatePath, 'utf8')
  content = content.replace('{{DOWNLOADS_CONTENT}}', replacements.downloadsContent)

  if (content.includes('{{DOWNLOADS_CONTENT}}')) {
    throw new Error(`[render-release-install-guide] 模板仍有未替换占位符: ${templatePath}`)
  }
  return content.trim()
}

/**
 * @param {string} version
 * @param {import('./artifact-names.mjs').ReleaseArtifactOptions} [artifactOptions]
 * @param {string | { downloadSlug?: string, assetUrlByFilename?: Record<string, string> }} [downloadOptions]
 * @returns {string}
 */
export function buildReleaseInstallSection(version, artifactOptions, downloadOptions) {
  const repository = resolveGitHubRepository()
  const downloadSlug = typeof downloadOptions === 'string'
    ? downloadOptions
    : downloadOptions?.downloadSlug || `v${version}`
  const assetUrlByFilename = typeof downloadOptions === 'object'
    ? downloadOptions?.assetUrlByFilename
    : undefined
  const artifacts = listReleaseArtifactNames(version, artifactOptions ?? readReleaseArtifactOptionsFromEnv())
  const macArtifacts = artifacts.filter(item => item.platform === 'macos')
  const winArtifacts = artifacts.filter(item => item.platform === 'windows')

  return renderTemplate(RELEASE_TEMPLATE_FILE, {
    downloadsContent: buildDownloadsContent(
      macArtifacts,
      winArtifacts,
      repository,
      downloadSlug,
      assetUrlByFilename,
    ),
  })
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (invokedDirectly) {
  const version = parseArgValue('--version')
  if (!version) {
    process.stderr.write('[render-release-install-guide] 缺少参数 --version\n')
    process.exit(1)
  }

  try {
    process.stdout.write(`${buildReleaseInstallSection(version)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
