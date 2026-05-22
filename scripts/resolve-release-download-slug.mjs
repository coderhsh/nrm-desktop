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
export function extractDownloadSlug(url) {
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
 * @param {{
 *   tagName?: string
 *   tag_name?: string
 *   isDraft?: boolean
 *   draft?: boolean
 *   assets?: Array<{ browser_download_url?: string, url?: string }>
 * }} release
 * @param {string} tag
 * @returns {string}
 */
export function resolveDownloadSlugFromReleaseData(release, tag) {
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

  const tagName = release.tagName ?? release.tag_name
  const isDraft = release.isDraft ?? release.draft
  if (isNonEmptyString(tagName) && isDraft !== true) {
    return tagName
  }

  throw new Error(
    `[resolve-release-download-slug] Release ${tag} 资产缺少可用的下载 URL（共 ${assets.length} 个资产）`,
  )
}

/**
 * @param {{
 *   tagName?: string
 *   tag_name?: string
 *   isDraft?: boolean
 *   draft?: boolean
 *   assets?: Array<{ name?: string, browser_download_url?: string, url?: string }>
 * }} release
 * @returns {Record<string, string>}
 */
export function buildReleaseAssetUrlMap(release) {
  /** @type {Record<string, string>} */
  const map = {}

  for (const asset of release.assets ?? []) {
    if (isNonEmptyString(asset.name) && isNonEmptyString(asset.browser_download_url)) {
      map[asset.name] = asset.browser_download_url
    }
  }

  return map
}

/**
 * @param {string} releaseId
 * @param {number} [maxAttempts]
 * @returns {unknown}
 */
function fetchReleaseById(releaseId, maxAttempts = 1) {
  const repository = resolveGitHubRepository()
  /** @type {unknown} */
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync('gh', ['api', `repos/${repository}/releases/${releaseId}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    if (result.status === 0) {
      return JSON.parse(result.stdout.trim())
    }

    lastError = new Error(
      `[resolve-release-download-slug] gh api repos/${repository}/releases/${releaseId} 失败:\n${result.stderr || result.stdout}`,
    )

    if (attempt < maxAttempts) {
      spawnSync('sleep', ['2'], { cwd: rootDir, stdio: 'ignore' })
    }
  }

  throw lastError
}

/**
 * @param {string} tag
 * @returns {Array<{ id: number, tagName: string, createdAt?: string }>}
 */
function fetchReleaseSummariesByTag(tag) {
  const repository = resolveGitHubRepository()
  const listRaw = runCommand('gh', ['api', `repos/${repository}/releases`, '--paginate'])
  /** @type {Array<{ id?: number, tag_name?: string, created_at?: string }>} */
  const releases = JSON.parse(listRaw)

  return releases
    .filter(item => item?.tag_name === tag && typeof item.id === 'number')
    .map(item => ({
      id: item.id,
      tagName: item.tag_name,
      createdAt: item.created_at,
    }))
}

/**
 * @param {{ id: number, createdAt?: string }} left
 * @param {{ id: number, createdAt?: string }} right
 * @returns {number}
 */
function compareReleaseSummariesNewestFirst(left, right) {
  if (left.createdAt && right.createdAt) {
    return right.createdAt.localeCompare(left.createdAt)
  }
  return right.id - left.id
}

/**
 * 从指定 release 读取 GitHub 返回的 browser_download_url。
 * @param {string} releaseId
 * @param {string[]} expectedFilenames
 * @returns {{ releaseId: string, assetUrlByFilename: Record<string, string> }}
 */
export function resolveReleaseAssetUrls(releaseId, expectedFilenames) {
  const maxAttempts = 5

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const release = fetchReleaseById(releaseId)
    const assetUrlByFilename = buildReleaseAssetUrlMap(release)
    const missing = expectedFilenames.filter(filename => !assetUrlByFilename[filename])

    if (missing.length === 0) {
      return {
        releaseId,
        assetUrlByFilename,
      }
    }

    if (attempt < maxAttempts) {
      spawnSync('sleep', ['2'], { cwd: rootDir, stdio: 'ignore' })
      continue
    }

    throw new Error(
      `[resolve-release-download-slug] Release #${releaseId} 缺少安装包资产 URL: ${missing.join(', ')}`,
    )
  }

  throw new Error(`[resolve-release-download-slug] Release #${releaseId} 无法解析安装包资产 URL`)
}

/**
 * @param {string} tag
 * @param {string[]} expectedFilenames
 * @returns {{ releaseId: string, assetUrlByFilename: Record<string, string> }}
 */
export function resolveReleaseAssetUrlsByTag(tag, expectedFilenames) {
  const summaries = fetchReleaseSummariesByTag(tag)
    .sort(compareReleaseSummariesNewestFirst)

  if (summaries.length === 0) {
    throw new Error(`[resolve-release-download-slug] 未找到 Release ${tag}`)
  }

  for (const summary of summaries) {
    try {
      return resolveReleaseAssetUrls(String(summary.id), expectedFilenames)
    } catch {
      continue
    }
  }

  throw new Error(
    `[resolve-release-download-slug] Release ${tag} 找不到包含全部安装包的资产 URL`,
  )
}

/**
 * @param {string} releaseId
 * @param {string} tag
 * @returns {string}
 */
export function resolveDownloadSlugFromReleaseId(releaseId, tag) {
  const repository = resolveGitHubRepository()
  const releaseRaw = runCommand('gh', ['api', `repos/${repository}/releases/${releaseId}`])
  const release = JSON.parse(releaseRaw)
  return resolveDownloadSlugFromReleaseData(release, tag)
}

/**
 * Draft Release 不会创建 git tag，`/releases/tags/{tag}` 会 404。
 * 优先用 `gh release view` 按 release 的 tagName 查找（含 draft）。
 * @param {string} tag
 * @returns {unknown}
 */
function fetchReleaseByTag(tag) {
  try {
    return JSON.parse(runCommand('gh', [
      'release', 'view', tag,
      '--json', 'tagName,isDraft,assets',
    ]))
  } catch (error) {
    const summaries = fetchReleaseSummariesByTag(tag).sort(compareReleaseSummariesNewestFirst)
    if (summaries.length === 0) {
      throw error
    }
    return fetchReleaseById(String(summaries[0].id))
  }
}

/**
 * @param {string} tag
 * @returns {string}
 */
export function resolveDownloadSlugFromRelease(tag) {
  resolveGitHubRepository()
  const release = fetchReleaseByTag(tag)
  return resolveDownloadSlugFromReleaseData(release, tag)
}

function main() {
  const version = parseArgValue('--version')
  if (!version) {
    throw new Error('[resolve-release-download-slug] 缺少参数 --version')
  }

  const releaseId = parseArgValue('--release-id')
  const tag = `v${version}`
  const downloadSlug = releaseId
    ? resolveDownloadSlugFromReleaseId(releaseId, tag)
    : resolveDownloadSlugFromRelease(tag)
  writeGithubOutput('download_slug', downloadSlug)
  process.stdout.write(
    `[resolve-release-download-slug] ${tag}${releaseId ? ` (#${releaseId})` : ''} -> ${downloadSlug}\n`,
  )
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
