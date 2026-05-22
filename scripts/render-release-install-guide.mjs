/* @desc 渲染 Release 安装包短说明（英文），供 build-release-body 拼接到 release body。 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
 * @param {string} commitSha
 * @param {string} filePath
 * @returns {string}
 */
export function buildDocBlobUrl(commitSha, filePath) {
  const repository = resolveGitHubRepository()
  return `https://github.com/${repository}/blob/${commitSha}/${filePath}`
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
 * @param {string} templatePath
 * @param {{ chineseGuideLink: string }} replacements
 * @returns {string}
 */
function renderTemplate(templatePath, replacements) {
  let content = readFileSync(templatePath, 'utf8')
  content = content.replace('{{CHINESE_GUIDE_LINK}}', replacements.chineseGuideLink)

  if (content.includes('{{CHINESE_GUIDE_LINK}}')) {
    throw new Error(`[render-release-install-guide] 模板仍有未替换占位符: ${templatePath}`)
  }
  return content.trim()
}

/**
 * @param {string} commitSha
 * @returns {string}
 */
export function buildReleaseInstallSection(commitSha) {
  const chineseGuideLink = buildDocBlobUrl(commitSha, 'docs/release-install-guide.zh-CN.md')

  return renderTemplate(RELEASE_TEMPLATE_FILE, {
    chineseGuideLink,
  })
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (invokedDirectly) {
  const commitSha = parseArgValue('--commit-sha')
  if (!commitSha) {
    process.stderr.write('[render-release-install-guide] 缺少参数 --commit-sha\n')
    process.exit(1)
  }

  try {
    process.stdout.write(`${buildReleaseInstallSection(commitSha)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
