/* @desc 校验并整理 release-assets 目录，仅保留本次应发布的标准命名安装包。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  listReleaseArtifactNames,
  listReleaseUpdaterAssetNames,
  normalizeReleaseArtifactOptions,
} from './artifact-names.mjs'

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
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function collectFiles(directory) {
  /** @type {string[]} */
  const files = []
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath))
      continue
    }
    files.push(fullPath)
  }
  return files
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

async function main() {
  const version = parseArgValue('--version')
  const assetsDirInput = parseArgValue('--dir') || 'release-assets'
  const assetsDir = path.resolve(rootDir, assetsDirInput)
  const stagingDir = path.join(rootDir, '.release-assets-staging')

  if (!version) {
    throw new Error('[prepare-release-assets-dir] 缺少参数 --version')
  }

  const files = await collectFiles(assetsDir)
  const artifactOptions = readReleaseArtifactOptionsFromEnv()
  const expectedArtifacts = listReleaseArtifactNames(version, artifactOptions)
  const expectedNames = [
    ...new Set([
      ...expectedArtifacts.map(item => item.filename),
      ...listReleaseUpdaterAssetNames(version, artifactOptions),
    ]),
  ]

  /** @type {Map<string, string>} */
  const matchedByName = new Map()
  for (const filePath of files) {
    const baseName = path.basename(filePath)
    if (!expectedNames.includes(baseName)) {
      continue
    }
    if (matchedByName.has(baseName)) {
      throw new Error(`[prepare-release-assets-dir] 发现重复文件: ${baseName}`)
    }
    matchedByName.set(baseName, filePath)
  }

  const missing = expectedNames.filter(name => !matchedByName.has(name))
  if (missing.length > 0) {
    throw new Error(
      `[prepare-release-assets-dir] 缺少安装包: ${missing.join(', ')}`
    )
  }

  await fs.rm(stagingDir, { recursive: true, force: true })
  await fs.mkdir(stagingDir, { recursive: true })
  for (const [filename, sourcePath] of matchedByName) {
    await fs.copyFile(sourcePath, path.join(stagingDir, filename))
  }

  await fs.rm(assetsDir, { recursive: true, force: true })
  await fs.mkdir(assetsDir, { recursive: true })
  for (const filename of expectedNames) {
    await fs.copyFile(path.join(stagingDir, filename), path.join(assetsDir, filename))
  }
  await fs.rm(stagingDir, { recursive: true, force: true })

  process.stdout.write(
    `[prepare-release-assets-dir] 已整理 ${expectedNames.length} 个发布资产: ${expectedNames.join(', ')}\n`
  )
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
