/* @desc 生成 Tauri updater 静态 JSON manifest。 */
import { promises as fs } from 'node:fs'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  listReleaseUpdaterPlatforms,
} from './artifact-names.mjs'
import { buildReleaseNotesSection, stripChangelogVersionHeader } from './build-release-body.mjs'
import {
  readChineseReleaseSection,
  readEnglishReleaseSection,
} from './prepare-release.mjs'
import { readReleaseArtifactOptionsFromEnv } from './render-release-install-guide.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
export const UPDATER_MANIFEST_FILENAME = 'latest.json'

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
 * @param {string} repository
 * @param {string} releaseTag
 * @param {string} filename
 * @returns {string}
 */
export function buildReleaseAssetUrl(repository, releaseTag, filename) {
  return `https://github.com/${repository}/releases/download/${releaseTag}/${encodeURIComponent(filename)}`
}

/**
 * @param {string} version
 * @param {string} commitSha
 * @returns {string}
 */
function buildUpdaterNotes(version, commitSha) {
  const englishSection = readEnglishReleaseSection(version)
  const chineseSection = readChineseReleaseSection(version)
  if (commitSha) {
    return buildReleaseNotesSection(englishSection, chineseSection, commitSha)
  }
  const english = stripChangelogVersionHeader(englishSection)
  const chinese = stripChangelogVersionHeader(chineseSection)
  return `${english}\n\n---\n\n${chinese}`.trim()
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function readRequiredTextFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const trimmed = content.trim()
    if (!trimmed) {
      throw new Error('文件为空')
    }
    return trimmed
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`[generate-updater-manifest] 无法读取 ${path.basename(filePath)}: ${detail}`)
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function assertFileExists(filePath) {
  try {
    await fs.access(filePath)
  } catch {
    throw new Error(`[generate-updater-manifest] 缺少 updater 资产: ${path.basename(filePath)}`)
  }
}

/**
 * @param {{
 *   version: string
 *   assetsDir: string
 *   repository: string
 *   releaseTag: string
 *   notes: string
 *   pubDate: string
 *   artifactOptions?: import('./artifact-names.mjs').ReleaseArtifactOptions
 * }} options
 * @returns {Promise<{ version: string, notes: string, pub_date: string, platforms: Record<string, { signature: string, url: string }> }>}
 */
export async function buildUpdaterManifest(options) {
  const platforms = listReleaseUpdaterPlatforms(options.version, options.artifactOptions)
  if (platforms.length === 0) {
    throw new Error('[generate-updater-manifest] 未选择任何可用于应用内更新的平台')
  }

  /** @type {Record<string, { signature: string, url: string }>} */
  const manifestPlatforms = {}

  for (const item of platforms) {
    const assetPath = path.join(options.assetsDir, item.urlFilename)
    const signaturePath = path.join(options.assetsDir, item.signatureFilename)
    await assertFileExists(assetPath)
    const signature = await readRequiredTextFile(signaturePath)

    manifestPlatforms[item.platform] = {
      signature,
      url: buildReleaseAssetUrl(options.repository, options.releaseTag, item.urlFilename),
    }
  }

  return {
    version: options.version,
    notes: options.notes,
    pub_date: options.pubDate,
    platforms: manifestPlatforms,
  }
}

async function main() {
  const version = parseArgValue('--version')
  const commitSha = parseArgValue('--commit-sha')
  const assetsDirInput = parseArgValue('--dir') || 'release-assets'
  const outputFileInput = parseArgValue('--output-file') || path.join(assetsDirInput, UPDATER_MANIFEST_FILENAME)
  const repository = parseArgValue('--repository') || process.env.GITHUB_REPOSITORY || 'coderhsh/nrm-desktop'
  const releaseTag = parseArgValue('--release-tag') || `v${version}`

  if (!version) {
    throw new Error('[generate-updater-manifest] 缺少参数 --version')
  }

  const assetsDir = path.resolve(rootDir, assetsDirInput)
  const outputFile = path.resolve(rootDir, outputFileInput)
  const manifest = await buildUpdaterManifest({
    version,
    assetsDir,
    repository,
    releaseTag,
    notes: buildUpdaterNotes(version, commitSha),
    pubDate: new Date().toISOString(),
    artifactOptions: readReleaseArtifactOptionsFromEnv(),
  })

  writeFileSync(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  process.stdout.write(`[generate-updater-manifest] 已生成 ${path.relative(rootDir, outputFile)}\n`)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
