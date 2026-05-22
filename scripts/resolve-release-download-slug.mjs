/* @desc 从已创建的 GitHub Release 资产 URL 解析 downloads 路径 slug（v1.0.1 或 untagged-xxx）。 */
import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

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
 * @param {string} key
 * @param {string} value
 */
function writeGithubOutput(key, value) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) {
    return
  }
  appendFileSync(outputPath, `${key}=${value}\n`)
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
    throw new Error('[resolve-release-download-slug] 无法解析 GitHub 仓库地址')
  }

  const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/i)
  if (!match) {
    throw new Error('[resolve-release-download-slug] package.json repository.url 不是 GitHub 地址')
  }
  return match[1]
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })

  if (result.status !== 0) {
    throw new Error(
      `[resolve-release-download-slug] ${command} ${args.join(' ')} 失败:\n${result.stderr || result.stdout}`,
    )
  }

  return result.stdout.trim()
}

/**
 * @param {string} url
 * @returns {string}
 */
function extractDownloadSlug(url) {
  const match = url.match(/\/releases\/download\/([^/]+)\//)
  if (!match) {
    throw new Error(`[resolve-release-download-slug] 无法从 URL 解析 slug: ${url}`)
  }
  return match[1]
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * @param {string} tag
 * @returns {string}
 */
function resolveDownloadSlugFromRelease(tag) {
  const repository = resolveGitHubRepository()
  const releaseRaw = runCommand('gh', ['api', `repos/${repository}/releases/tags/${tag}`])
  /** @type {{ tag_name?: string, draft?: boolean, assets?: Array<{ browser_download_url?: string, url?: string }> }} */
  const release = JSON.parse(releaseRaw)
  const assets = release.assets ?? []

  if (assets.length === 0) {
    throw new Error(`[resolve-release-download-slug] Release ${tag} 尚无安装包资产，无法解析下载 slug`)
  }

  for (const asset of assets) {
    if (isNonEmptyString(asset.browser_download_url)) {
      return extractDownloadSlug(asset.browser_download_url)
    }
    if (isNonEmptyString(asset.url) && asset.url.includes('/releases/download/')) {
      return extractDownloadSlug(asset.url)
    }
  }

  if (isNonEmptyString(release.tag_name) && release.draft !== true) {
    return release.tag_name
  }

  throw new Error(
    `[resolve-release-download-slug] Release ${tag} 资产缺少可用的下载 URL（共 ${assets.length} 个资产）`,
  )
}

function main() {
  const version = parseArgValue('--version')
  if (!version) {
    throw new Error('[resolve-release-download-slug] 缺少参数 --version')
  }

  const tag = `v${version}`
  const downloadSlug = resolveDownloadSlugFromRelease(tag)
  writeGithubOutput('download_slug', downloadSlug)
  process.stdout.write(`[resolve-release-download-slug] ${tag} -> ${downloadSlug}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
