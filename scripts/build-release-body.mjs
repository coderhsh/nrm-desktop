/* @desc 在 commit 确定后生成 GitHub Release body（含 commit SHA 文档链接）。 */
import { appendFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildChangelogLinksLine, buildReleaseInstallSection, readReleaseArtifactOptionsFromEnv } from './render-release-install-guide.mjs'
import { listReleaseArtifactNames } from './artifact-names.mjs'
import { readChineseReleaseSection, readEnglishReleaseSection } from './prepare-release.mjs'
import { resolveReleaseAssetUrls } from './resolve-release-download-slug.mjs'

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
  if (value.includes('\n')) {
    const delimiter = `${key}_${Date.now()}_${Math.random().toString(36).slice(2)}`
    appendFileSync(outputPath, `${key}<<${delimiter}\n${value}\n${delimiter}\n`)
    return
  }
  appendFileSync(outputPath, `${key}=${value}\n`)
}

/**
 * @param {string} section
 * @returns {string}
 */
export function stripChangelogVersionHeader(section) {
  return section
    .trim()
    .replace(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}\n+/m, '')
    .replace(/\n(?:\[[^\]]+\]:\s+https?:\/\/[^\n]+)+\s*$/m, '')
    .trim()
}

/**
 * @param {string} englishSection
 * @param {string} chineseSection
 * @param {string} commitSha
 * @returns {string}
 */
export function buildReleaseNotesSection(englishSection, chineseSection, commitSha) {
  const englishContent = stripChangelogVersionHeader(englishSection)
  const chineseContent = stripChangelogVersionHeader(chineseSection)

  return `## Release Notes

${englishContent}

<details>
<summary><b>更新日志（中文）</b></summary>

${chineseContent}

</details>

${buildChangelogLinksLine(commitSha)}`
}

/**
 * @param {string} version
 * @param {string} englishSection
 * @param {string} chineseSection
 * @param {string} commitSha
 * @returns {string}
 */
export function buildReleaseBody(
  version,
  englishSection,
  chineseSection,
  commitSha,
  artifactOptions,
  downloadOptions,
) {
  const releaseNotes = buildReleaseNotesSection(englishSection, chineseSection, commitSha)
  const installSection = buildReleaseInstallSection(version, artifactOptions, downloadOptions)
  return `${releaseNotes}

---

${installSection}`
}

/**
 * @param {string} version
 * @param {import('./artifact-names.mjs').ReleaseArtifactOptions} artifactOptions
 * @param {Record<string, string>} assetUrlByFilename
 */
export function assertReleaseAssetsPresent(version, artifactOptions, assetUrlByFilename) {
  const artifacts = listReleaseArtifactNames(version, artifactOptions)
  const missing = artifacts
    .filter(item => !assetUrlByFilename[item.filename])
    .map(item => item.filename)

  if (missing.length > 0) {
    throw new Error(`[build-release-body] Release 缺少安装包资产 URL: ${missing.join(', ')}`)
  }
}

function main() {
  const version = parseArgValue('--version')
  const commitSha = parseArgValue('--commit-sha')
  const releaseId = parseArgValue('--release-id')
  const downloadSlug = parseArgValue('--download-slug') || `v${version}`
  const outputFile = parseArgValue('--output-file')

  if (!version) {
    throw new Error('[build-release-body] 缺少参数 --version，例如 --version 1.0.1')
  }
  if (!commitSha) {
    throw new Error('[build-release-body] 缺少参数 --commit-sha')
  }

  const artifactOptions = readReleaseArtifactOptionsFromEnv()
  const englishSection = readEnglishReleaseSection(version)
  const chineseSection = readChineseReleaseSection(version)

  /** @type {string | { downloadSlug?: string, assetUrlByFilename?: Record<string, string> }} */
  let downloadOptions = downloadSlug
  if (releaseId) {
    const expectedFilenames = listReleaseArtifactNames(version, artifactOptions).map(item => item.filename)
    const resolved = resolveReleaseAssetUrls(releaseId, expectedFilenames)
    assertReleaseAssetsPresent(version, artifactOptions, resolved.assetUrlByFilename)
    downloadOptions = {
      downloadSlug,
      assetUrlByFilename: resolved.assetUrlByFilename,
    }
  }

  const releaseBody = buildReleaseBody(
    version,
    englishSection,
    chineseSection,
    commitSha,
    artifactOptions,
    downloadOptions,
  )

  if (outputFile) {
    writeFileSync(outputFile, releaseBody, 'utf8')
  }

  writeGithubOutput('release_body', releaseBody)
  process.stdout.write(
    `[build-release-body] 已生成 v${version} Release body（commit=${commitSha.slice(0, 7)}${releaseId ? `, release=#${releaseId}` : `, slug=${downloadSlug}`}）\n`,
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
