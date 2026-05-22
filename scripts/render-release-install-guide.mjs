/* @desc 渲染 Release Downloads 区（含直接下载链接），供 build-release-body 拼接到 release body。 */
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
 * @param {string} version
 * @param {string} filename
 * @returns {string}
 */
export function buildReleaseAssetUrl(repository, version, filename) {
  return `https://github.com/${repository}/releases/download/v${version}/${filename}`
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
 * @param {'en' | 'zh'} [locale]
 * @returns {string}
 */
function artifactDownloadLabel(item, locale = 'en') {
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
 * @param {'en' | 'zh'} [locale]
 * @returns {string}
 */
function artifactDownloadLink(item, url, locale = 'en') {
  return `[${artifactDownloadLabel(item, locale)}](${url})`
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} artifacts
 * @param {string} repository
 * @param {string} version
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function buildGroupedDownloadLinks(artifacts, repository, version, locale) {
  return artifacts
    .map(item => {
      const url = buildReleaseAssetUrl(repository, version, item.filename)
      return artifactDownloadLink(item, url, locale)
    })
    .join(' | ')
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} macArtifacts
 * @param {string} repository
 * @param {string} version
 * @returns {string}
 */
function buildMacosContent(macArtifacts, repository, version) {
  if (macArtifacts.length === 0) {
    return 'No macOS packages were built for this release.'
  }

  const sorted = [...macArtifacts].sort((left, right) => {
    if (left.arch === right.arch) {
      return 0
    }
    return left.arch === 'aarch64' ? -1 : 1
  })

  return `${buildGroupedDownloadLinks(sorted, repository, version, 'en')}

After downloading, double-click the \`.dmg\` file and drag the app into the Applications folder.`
}

/** @type {Record<'setup' | 'portable' | 'msi', { en: string, zh: string }>} */
const WINDOWS_ITEM_COPY = {
  setup: {
    en: 'Standard installer with Start Menu and Desktop shortcuts.',
    zh: '常见安装程序，会自动创建开始菜单和桌面快捷方式。',
  },
  portable: {
    en: 'Extract and run directly — no installation required.',
    zh: '解压后直接运行，无需安装。',
  },
  msi: {
    en: 'For IT administrators who need silent or bulk deployment.',
    zh: '面向企业 IT 管理员，支持静默安装与批量部署。',
  },
}

/** @type {readonly ('setup' | 'portable' | 'msi')[]} */
const WINDOWS_KIND_ORDER = ['setup', 'portable', 'msi']

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} winArtifacts
 * @param {string} repository
 * @param {string} version
 * @returns {string}
 */
function buildWindowsContent(winArtifacts, repository, version) {
  if (winArtifacts.length === 0) {
    return 'No Windows packages were built for this release.'
  }

  const byKind = Object.fromEntries(winArtifacts.map(item => [item.kind, item]))
  const setupItems = byKind.setup ? [byKind.setup] : []
  const otherItems = WINDOWS_KIND_ORDER
    .filter(kind => kind !== 'setup' && byKind[kind])
    .map(kind => byKind[kind])

  const sections = [
    'Windows (Windows 7 not supported)',
    '',
    `**Standard (recommended)** ${buildGroupedDownloadLinks(setupItems, repository, version, 'en')}`,
  ]

  if (otherItems.length > 0) {
    sections.push(
      '',
      `**Other formats** ${buildGroupedDownloadLinks(otherItems, repository, version, 'en')}`,
    )
  }

  const detailLines = WINDOWS_KIND_ORDER
    .filter(kind => byKind[kind])
    .map(kind => {
      const item = byKind[kind]
      const url = buildReleaseAssetUrl(repository, version, item.filename)
      const link = artifactDownloadLink(item, url, 'en')
      return `- ${link}: ${WINDOWS_ITEM_COPY[kind].en}`
    })

  sections.push('', ...detailLines)

  return sections.join('\n')
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} macArtifacts
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} winArtifacts
 * @param {string} repository
 * @param {string} version
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
function buildPlatformDownloadBlock(macArtifacts, winArtifacts, repository, version, locale) {
  const macSorted = [...macArtifacts].sort((left, right) => {
    if (left.arch === right.arch) {
      return 0
    }
    return left.arch === 'aarch64' ? -1 : 1
  })
  const setupItems = winArtifacts.filter(item => item.kind === 'setup')
  const otherItems = winArtifacts.filter(item => item.kind !== 'setup')

  const macLine = macSorted.length > 0
    ? `**macOS** ${buildGroupedDownloadLinks(macSorted, repository, version, locale)}`
    : ''
  const winHeader = locale === 'zh' ? '**Windows**（不支持 Windows 7）' : '**Windows** (Windows 7 not supported)'
  const standardHeader = locale === 'zh' ? '**正常版本（推荐）**' : '**Standard (recommended)**'
  const otherHeader = locale === 'zh' ? '**其他格式**' : '**Other formats**'
  const setupLine = setupItems.length > 0
    ? `${standardHeader} ${buildGroupedDownloadLinks(setupItems, repository, version, locale)}`
    : ''
  const otherLine = otherItems.length > 0
    ? `${otherHeader} ${buildGroupedDownloadLinks(otherItems, repository, version, locale)}`
    : ''

  return [macLine, winHeader, setupLine, otherLine].filter(Boolean).join('\n\n')
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} artifacts
 * @param {string} repository
 * @param {string} version
 * @returns {string}
 */
function buildDownloadFooter(macArtifacts, winArtifacts, repository, version) {
  const enBlock = buildPlatformDownloadBlock(macArtifacts, winArtifacts, repository, version, 'en')
  const zhBlock = buildPlatformDownloadBlock(macArtifacts, winArtifacts, repository, version, 'zh')
  return `**Download links**\n\n${enBlock}\n\n**下载地址**\n\n${zhBlock}`
}

/**
 * @param {string} templatePath
 * @param {{ macosContent: string, windowsContent: string, downloadFooter: string }} replacements
 * @returns {string}
 */
function renderTemplate(templatePath, replacements) {
  let content = readFileSync(templatePath, 'utf8')
  content = content.replace('{{MACOS_CONTENT}}', replacements.macosContent)
  content = content.replace('{{WINDOWS_CONTENT}}', replacements.windowsContent)
  content = content.replace('{{DOWNLOAD_FOOTER}}', replacements.downloadFooter)

  if (
    content.includes('{{MACOS_CONTENT}}')
    || content.includes('{{WINDOWS_CONTENT}}')
    || content.includes('{{DOWNLOAD_FOOTER}}')
  ) {
    throw new Error(`[render-release-install-guide] 模板仍有未替换占位符: ${templatePath}`)
  }
  return content.trim()
}

/**
 * @param {string} version
 * @param {import('./artifact-names.mjs').ReleaseArtifactOptions} [artifactOptions]
 * @returns {string}
 */
export function buildReleaseInstallSection(version, artifactOptions) {
  const repository = resolveGitHubRepository()
  const artifacts = listReleaseArtifactNames(version, artifactOptions ?? readReleaseArtifactOptionsFromEnv())
  const macArtifacts = artifacts.filter(item => item.platform === 'macos')
  const winArtifacts = artifacts.filter(item => item.platform === 'windows')

  return renderTemplate(RELEASE_TEMPLATE_FILE, {
    macosContent: buildMacosContent(macArtifacts, repository, version),
    windowsContent: buildWindowsContent(winArtifacts, repository, version),
    downloadFooter: buildDownloadFooter(macArtifacts, winArtifacts, repository, version),
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
