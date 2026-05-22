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
 * @returns {string}
 */
function artifactDownloadLabel(item) {
  if (item.kind === 'dmg' && item.arch === 'x64') {
    return '.dmg (Intel)'
  }
  switch (item.kind) {
    case 'dmg':
      return '.dmg'
    case 'setup':
      return 'setup.exe'
    case 'portable':
      return '.zip'
    case 'msi':
      return '.msi'
    default:
      return item.filename
  }
}

/**
 * @param {import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }} item
 * @param {string} url
 * @returns {string}
 */
function artifactDownloadLink(item, url) {
  return `[${artifactDownloadLabel(item)}](${url})`
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} artifacts
 * @param {string} repository
 * @param {string} version
 * @returns {string}
 */
function buildInlineDownloadLinks(artifacts, repository, version) {
  return artifacts
    .map(item => {
      const url = buildReleaseAssetUrl(repository, version, item.filename)
      return artifactDownloadLink(item, url)
    })
    .join(' · ')
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

  const lines = macArtifacts.map((item, index) => {
    const url = buildReleaseAssetUrl(repository, version, item.filename)
    const link = artifactDownloadLink(item, url)
    if (index === 0) {
      return `**${link} (Recommended for macOS users)**: This is the standard installation method for macOS. After downloading, double-click to open and drag the app icon to the "Applications" folder to complete the installation. It offers the most native and clean experience.`
    }
    return `**${link}**: ${item.noteEn}`
  })

  return lines.join('\n\n')
}

/** @type {Record<'setup' | 'portable' | 'msi', string>} */
const WINDOWS_ITEM_COPY = {
  setup:
    '**{link} (Recommended for Windows users)**: This is the most common installer for Windows. It will guide you through the installation process and automatically create shortcuts in the Start Menu and on the Desktop, providing the most complete integrated experience.',
  portable:
    '**{link} (Portable version, no installation required)**: This is a green, no-install version. Simply unzip and run directly — it won\'t write any registry entries or configuration files to your system. Ideal for use on USB drives or for quick trials.',
  msi:
    '**{link} (Windows bulk deployment / Administrator)**: This is a standard Windows Installer package, primarily intended for enterprise IT administrators or advanced users who need silent installations or bulk deployments. It supports unattended installation via Group Policy and other methods.',
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
  const lines = WINDOWS_KIND_ORDER
    .filter(kind => byKind[kind])
    .map((kind, index) => {
      const item = byKind[kind]
      const url = buildReleaseAssetUrl(repository, version, item.filename)
      const link = artifactDownloadLink(item, url)
      return `${index + 1}. ${WINDOWS_ITEM_COPY[kind].replace('{link}', link)}`
    })

  return lines.join('\n\n')
}

/**
 * @param {Array<import('./artifact-names.mjs').DefaultReleaseArtifact & { filename: string }>} artifacts
 * @param {string} repository
 * @param {string} version
 * @returns {string}
 */
function buildDownloadFooter(artifacts, repository, version) {
  const links = buildInlineDownloadLinks(artifacts, repository, version)
  return `**Download links:** ${links}\n\n**下载地址：** ${links}`
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
    downloadFooter: buildDownloadFooter(artifacts, repository, version),
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
