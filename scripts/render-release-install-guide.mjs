/* @desc 渲染 Release 安装包短说明（英文），供 prepare-release 拼接到 release body。 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  listDefaultReleaseArtifactNames,
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
 * @param {string} version
 * @param {string} filePath
 * @returns {string}
 */
export function buildDocBlobUrl(version, filePath) {
  const repository = resolveGitHubRepository()
  return `https://github.com/${repository}/blob/v${version}/${filePath}`
}

/**
 * @param {string} version
 * @returns {string}
 */
export function buildChangelogLinksLine(version) {
  const englishUrl = buildDocBlobUrl(version, 'CHANGELOG.md')
  const chineseUrl = buildDocBlobUrl(version, 'CHANGELOG.zh-CN.md')
  return `[Full changelog](${englishUrl}) · [完整更新日志](${chineseUrl})`
}

/**
 * @param {string} repository owner/repo
 * @param {string} version
 * @param {string} filename
 * @returns {string}
 */
function buildReleaseAssetUrl(repository, version, filename) {
  return `https://github.com/${repository}/releases/download/v${version}/${filename}`
}

/**
 * @param {string} repository
 * @param {string} version
 * @param {import('./artifact-names.mjs').ReleaseArtifactOptions} [artifactOptions]
 * @returns {string}
 */
function buildDownloadList(repository, version, artifactOptions) {
  const artifacts = artifactOptions
    ? listReleaseArtifactNames(version, normalizeReleaseArtifactOptions(artifactOptions))
    : listDefaultReleaseArtifactNames(version)

  return artifacts
    .map(item => {
      const url = buildReleaseAssetUrl(repository, version, item.filename)
      return `- [${item.labelEn} — \`${item.filename}\`](${url})`
    })
    .join('\n')
}

/**
 * @param {string} templatePath
 * @param {{ downloadList: string, englishGuideLink: string, chineseGuideLink: string }} replacements
 * @returns {string}
 */
function renderTemplate(templatePath, replacements) {
  let content = readFileSync(templatePath, 'utf8')
  content = content.replace('{{DOWNLOAD_LIST}}', replacements.downloadList)
  content = content.replace('{{ENGLISH_GUIDE_LINK}}', replacements.englishGuideLink)
  content = content.replace('{{CHINESE_GUIDE_LINK}}', replacements.chineseGuideLink)

  if (
    content.includes('{{DOWNLOAD_LIST}}')
    || content.includes('{{ENGLISH_GUIDE_LINK}}')
    || content.includes('{{CHINESE_GUIDE_LINK}}')
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
  const englishGuideLink = buildDocBlobUrl(version, 'docs/release-install-guide.md')
  const chineseGuideLink = buildDocBlobUrl(version, 'docs/release-install-guide.zh-CN.md')

  return renderTemplate(RELEASE_TEMPLATE_FILE, {
    downloadList: buildDownloadList(repository, version, artifactOptions),
    englishGuideLink,
    chineseGuideLink,
  })
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (invokedDirectly) {
  const version = parseArgValue('--version')
  if (!version) {
    process.stderr.write('[render-release-install-guide] 缺少参数 --version，例如 --version 1.0.1\n')
    process.exit(1)
  }

  try {
    process.stdout.write(`${buildReleaseInstallSection(version)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
