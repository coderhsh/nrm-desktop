/* @desc 从已创建的 GitHub Release 资产 URL 解析 downloads 路径 slug（v1.0.1 或 untagged-xxx）。 */
import { appendFileSync } from 'node:fs'
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
 * @param {string} tag
 * @returns {string}
 */
function resolveDownloadSlugFromRelease(tag) {
  const result = spawnSync(
    'gh',
    ['release', 'view', tag, '--json', 'assets'],
    {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  )

  if (result.status !== 0) {
    throw new Error(
      `[resolve-release-download-slug] 无法读取 Release ${tag}：\n${result.stderr || result.stdout}`,
    )
  }

  /** @type {{ assets?: Array<{ browser_download_url?: string }> }} */
  const payload = JSON.parse(result.stdout)
  const assets = payload.assets ?? []
  if (assets.length === 0) {
    throw new Error(`[resolve-release-download-slug] Release ${tag} 尚无安装包资产，无法解析下载 slug`)
  }

  const firstUrl = assets[0]?.browser_download_url
  if (typeof firstUrl !== 'string' || firstUrl.trim() === '') {
    throw new Error(`[resolve-release-download-slug] Release ${tag} 资产缺少 browser_download_url`)
  }

  const match = firstUrl.match(/\/releases\/download\/([^/]+)\//)
  if (!match) {
    throw new Error(`[resolve-release-download-slug] 无法从 URL 解析 slug: ${firstUrl}`)
  }

  return match[1]
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
