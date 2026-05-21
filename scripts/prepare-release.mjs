/* @desc 发布前准备：bump 版本、同步 Tauri/Cargo、归档 CHANGELOG，并输出 Release body。 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildReleaseInstallSection } from './render-release-install-guide.mjs'
import { normalizeReleaseArtifactOptions } from './artifact-names.mjs'
import { syncAppVersionFromPackageJson } from './sync-app-version.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const REPO_COMPARE_BASE = 'https://github.com/coderhsh/nrm-desktop/compare'
const REPO_RELEASE_BASE = 'https://github.com/coderhsh/nrm-desktop/releases/tag'

/** @type {readonly [string, string, string][]} */
const CHANGELOG_FILES = [
  ['CHANGELOG.md', 'Unreleased'],
  ['CHANGELOG.zh-CN.md', '未发布'],
]

/** @type {readonly string[]} */
const PREPARE_MODES = ['fresh', 'retry', 'overwrite']

/**
 * @param {string} version
 * @returns {boolean}
 */
function isValidSemver(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
}

/**
 * @param {string} version
 * @returns {[number, number, number]}
 */
function parseCoreVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    throw new Error(`[prepare-release] 无法解析版本号: ${version}`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number} 1 if left > right, -1 if left < right, 0 if equal
 */
function compareSemver(left, right) {
  const a = parseCoreVersion(left)
  const b = parseCoreVersion(right)
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) {
      return 1
    }
    if (a[i] < b[i]) {
      return -1
    }
  }
  return 0
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
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    throw new Error(`[prepare-release] 无法执行 ${command}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`[prepare-release] ${command} ${args.join(' ')} 失败:\n${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/**
 * @param {string} version
 */
function assertTagDoesNotExist(version) {
  const tag = `v${version}`
  const localTags = runCommand('git', ['tag', '--list', tag])
  if (localTags.split(/\r?\n/).map(item => item.trim()).filter(Boolean).includes(tag)) {
    throw new Error(`[prepare-release] 本地已存在 tag ${tag}`)
  }

  try {
    const remoteTags = runCommand('git', ['ls-remote', '--tags', 'origin', tag])
    if (remoteTags.trim() !== '') {
      throw new Error(`[prepare-release] 远程已存在 tag ${tag}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('远程已存在')) {
      throw error
    }
    process.stderr.write('[prepare-release] 无法检查远程 tag，已跳过远程校验。\n')
  }
}

/**
 * @param {string} body
 * @returns {boolean}
 */
function hasReleaseContent(body) {
  const lines = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
  return lines.some(line => line.startsWith('- ') || line.startsWith('###'))
}

/**
 * @param {string} content
 * @param {string} unreleasedLabel
 * @param {string} version
 * @param {string} date
 * @returns {{ content: string, releaseSection: string }}
 */
function archiveChangelogSection(content, unreleasedLabel, version, date) {
  const unreleasedHeader = `## [${unreleasedLabel}]`
  const start = content.indexOf(unreleasedHeader)
  if (start === -1) {
    throw new Error(`[prepare-release] 未找到 ${unreleasedHeader}`)
  }

  const afterHeader = content.indexOf('\n', start)
  const bodyStart = afterHeader === -1 ? content.length : afterHeader + 1
  const nextSectionMatch = content.slice(bodyStart).match(/^## \[[^\n]+\]/m)
  const bodyEnd = nextSectionMatch
    ? bodyStart + nextSectionMatch.index
    : content.length

  const unreleasedBody = content.slice(bodyStart, bodyEnd).trim()
  if (!hasReleaseContent(unreleasedBody)) {
    throw new Error(`[prepare-release] ${unreleasedHeader} 下没有可发布的内容，请先补充 CHANGELOG。`)
  }

  const versionHeader = `## [${version}] - ${date}`
  const archivedBlock = `${versionHeader}\n\n${unreleasedBody}\n\n`
  const emptyUnreleasedBlock = `${unreleasedHeader}\n\n`
  const before = content.slice(0, start)
  const after = content.slice(bodyEnd)
  const nextContent = `${before}${emptyUnreleasedBlock}${archivedBlock}${after}`

  return {
    content: updateChangelogLinks(nextContent, unreleasedLabel, version),
    releaseSection: `${versionHeader}\n\n${unreleasedBody}`.trim(),
  }
}

/**
 * @param {string} content
 * @param {string} version
 * @returns {string}
 */
function extractChangelogVersionSection(content, version) {
  const headerRegex = new RegExp(`^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}`, 'm')
  const start = content.search(headerRegex)
  if (start === -1) {
    throw new Error(`[prepare-release] 未在 CHANGELOG 中找到版本节 [${version}]`)
  }

  const headerLineEnd = content.indexOf('\n', start)
  const bodyStart = headerLineEnd === -1 ? content.length : headerLineEnd + 1
  const nextSectionMatch = content.slice(bodyStart).match(/^## \[[^\n]+\]/m)
  const bodyEnd = nextSectionMatch
    ? bodyStart + nextSectionMatch.index
    : content.length

  const section = content.slice(start, bodyEnd).trim()
  if (!hasReleaseContent(section)) {
    throw new Error(`[prepare-release] CHANGELOG 版本节 [${version}] 下没有可发布的内容`)
  }
  return section
}

/**
 * @param {string} content
 * @param {string} unreleasedLabel
 * @param {string} version
 * @returns {string}
 */
function updateChangelogLinks(content, unreleasedLabel, version) {
  const tag = `v${version}`
  const unreleasedLink = `[${unreleasedLabel}]: ${REPO_COMPARE_BASE}/${tag}...HEAD`
  const versionLink = `[${version}]: ${REPO_RELEASE_BASE}/${tag}`

  let next = content.replace(
    new RegExp(`^\\[${escapeRegExp(unreleasedLabel)}\\]:.*$`, 'm'),
    unreleasedLink
  )

  if (!next.includes(`[${version}]:`)) {
    const unreleasedLineIndex = next.indexOf(unreleasedLink)
    if (unreleasedLineIndex === -1) {
      throw new Error(`[prepare-release] 无法更新 ${unreleasedLabel} compare 链接`)
    }
    const insertAt = next.indexOf('\n', unreleasedLineIndex)
    next = `${next.slice(0, insertAt + 1)}${versionLink}\n${next.slice(insertAt + 1)}`
  } else {
    next = next.replace(new RegExp(`^\\[${version}\\]:.*$`, 'm'), versionLink)
  }

  return next
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
function readReleaseArtifactOptionsFromEnv() {
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
 * @param {string} version
 * @param {string} englishSection
 * @param {import('./artifact-names.mjs').ReleaseArtifactOptions} artifactOptions
 * @returns {string}
 */
function buildReleaseBody(version, englishSection, artifactOptions) {
  const tag = `v${version}`
  const installGuide = buildReleaseInstallSection(version, artifactOptions)
  return `${englishSection}

---

${installGuide}

---

Full changelog: [CHANGELOG.md](${REPO_COMPARE_BASE}/${tag}...HEAD) · [CHANGELOG.zh-CN.md](https://github.com/coderhsh/nrm-desktop/blob/${tag}/CHANGELOG.zh-CN.md)`
}

/**
 * @param {string} version
 * @returns {string}
 */
function readExistingEnglishReleaseSection(version) {
  const changelogPath = path.join(rootDir, 'CHANGELOG.md')
  const raw = readFileSync(changelogPath, 'utf8')
  return extractChangelogVersionSection(raw, version)
}

/**
 * @param {'fresh' | 'retry' | 'overwrite'} mode
 * @param {string} version
 * @param {string} currentVersion
 */
function validateModeAndVersion(mode, version, currentVersion) {
  const versionCompare = compareSemver(version, currentVersion)

  if (mode === 'fresh') {
    if (versionCompare <= 0) {
      throw new Error(
        `[prepare-release] 新版本 ${version} 必须大于当前版本 ${currentVersion}`
      )
    }
    assertTagDoesNotExist(version)
    return
  }

  if (versionCompare !== 0) {
    throw new Error(
      `[prepare-release] ${mode} 模式下输入版本 ${version} 必须与 package.json 当前版本 ${currentVersion} 一致`
    )
  }
}

function main() {
  const version = parseArgValue('--version')
  const mode = parseArgValue('--mode') || 'fresh'

  if (!version) {
    throw new Error('[prepare-release] 缺少参数 --version，例如 --version 1.0.1')
  }
  if (!PREPARE_MODES.includes(mode)) {
    throw new Error(`[prepare-release] 无效 mode: ${mode}，可选 fresh/retry/overwrite`)
  }
  if (!isValidSemver(version)) {
    throw new Error(`[prepare-release] 版本号格式无效: ${version}`)
  }

  const pkgPath = path.join(rootDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const currentVersion = pkg.version
  if (typeof currentVersion !== 'string' || currentVersion.trim() === '') {
    throw new Error('[prepare-release] package.json 缺少有效 version')
  }

  validateModeAndVersion(mode, version, currentVersion)

  let englishReleaseSection = ''

  if (mode === 'fresh') {
    const date = new Date().toISOString().slice(0, 10)

    for (const [fileName, unreleasedLabel] of CHANGELOG_FILES) {
      const filePath = path.join(rootDir, fileName)
      const raw = readFileSync(filePath, 'utf8')
      const { content, releaseSection } = archiveChangelogSection(raw, unreleasedLabel, version, date)
      writeFileSync(filePath, content, 'utf8')
      if (fileName === 'CHANGELOG.md') {
        englishReleaseSection = releaseSection
      }
    }

    pkg.version = version
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    syncAppVersionFromPackageJson()
    writeGithubOutput('skip_commit', 'false')
  } else {
    englishReleaseSection = readExistingEnglishReleaseSection(version)
    writeGithubOutput('skip_commit', 'true')
    process.stdout.write(`[prepare-release] ${mode} 模式：跳过版本 bump 与 CHANGELOG 归档\n`)
  }

  const releaseBody = buildReleaseBody(version, englishReleaseSection, readReleaseArtifactOptionsFromEnv())
  writeGithubOutput('version', version)
  writeGithubOutput('release_body', releaseBody)
  writeGithubOutput('prepare_mode', mode)

  process.stdout.write(`[prepare-release] 已准备发布 v${version}（mode=${mode}）\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
