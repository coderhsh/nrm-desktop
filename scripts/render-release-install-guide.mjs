/* @desc 渲染 Release 安装包选择说明（英文 + 中文），供 prepare-release 拼接到 release body。 */
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

const TEMPLATE_FILES = {
  en: path.join(rootDir, 'docs', 'release-install-guide.md'),
  zh: path.join(rootDir, 'docs', 'release-install-guide.zh-CN.md'),
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
 * @returns {string}
 */
function resolveGitHubRepository() {
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
 * @param {'en' | 'zh'} locale
 * @returns {string}
 */
/**
 * @param {import('./artifact-names.mjs').ReleaseArtifactOptions} [artifactOptions]
 */
function buildDownloadTable(repository, version, locale, artifactOptions) {
  const artifacts = artifactOptions
    ? listReleaseArtifactNames(version, normalizeReleaseArtifactOptions(artifactOptions))
    : listDefaultReleaseArtifactNames(version)
  const isZh = locale === 'zh'
  const headers = isZh
    ? ['平台', '文件', '说明', '下载']
    : ['Platform', 'File', 'Notes', 'Download']
  const rows = artifacts.map(item => {
    const platform = isZh ? item.labelZh : item.labelEn
    const note = isZh ? item.noteZh : item.noteEn
    const downloadLabel = isZh ? '下载' : 'Download'
    const url = buildReleaseAssetUrl(repository, version, item.filename)
    return `| ${platform} | \`${item.filename}\` | ${note} | [${downloadLabel}](${url}) |`
  })

  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows].join('\n')
}

/**
 * @param {string} templatePath
 * @param {{ downloadTable: string, chineseGuideLink?: string }} replacements
 * @returns {string}
 */
function renderTemplate(templatePath, replacements) {
  let content = readFileSync(templatePath, 'utf8')
  content = content.replace('{{DOWNLOAD_TABLE}}', replacements.downloadTable)
  if (replacements.chineseGuideLink) {
    content = content.replace('{{CHINESE_GUIDE_LINK}}', replacements.chineseGuideLink)
  }
  if (content.includes('{{DOWNLOAD_TABLE}}') || content.includes('{{CHINESE_GUIDE_LINK}}')) {
    throw new Error(`[render-release-install-guide] 模板仍有未替换占位符: ${templatePath}`)
  }
  return content.trim()
}

/**
 * @param {string} version
 * @param {import('./artifact-names.mjs').ReleaseArtifactOptions} [artifactOptions]
 * @returns {{ english: string, chinese: string, chineseGuideLink: string }}
 */
export function renderReleaseInstallGuide(version, artifactOptions) {
  const repository = resolveGitHubRepository()
  const tag = `v${version}`
  const chineseGuideLink = `https://github.com/${repository}/blob/${tag}/docs/release-install-guide.zh-CN.md`

  const english = renderTemplate(TEMPLATE_FILES.en, {
    downloadTable: buildDownloadTable(repository, version, 'en', artifactOptions),
    chineseGuideLink,
  })
  const chinese = renderTemplate(TEMPLATE_FILES.zh, {
    downloadTable: buildDownloadTable(repository, version, 'zh', artifactOptions),
  })

  return { english, chinese, chineseGuideLink }
}

/**
 * @param {string} version
 * @param {import('./artifact-names.mjs').ReleaseArtifactOptions} [artifactOptions]
 * @returns {string}
 */
export function buildReleaseInstallSection(version, artifactOptions) {
  const { english, chinese } = renderReleaseInstallGuide(version, artifactOptions)
  return `${english}

<details>
<summary>简体中文 / Chinese</summary>

${chinese}

</details>`
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
