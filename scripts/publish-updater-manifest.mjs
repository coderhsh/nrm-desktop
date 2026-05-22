/* @desc 将 latest.json 发布到固定 updater Release，供 Tauri 应用内更新拉取。 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { UPDATER_MANIFEST_FILENAME } from './generate-updater-manifest.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

export const UPDATER_RELEASE_TAG = 'updater'

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
function resolveRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY
  }

  const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
  const repoUrl = pkg.repository?.url
  if (typeof repoUrl !== 'string') {
    throw new Error('[publish-updater-manifest] 无法解析 GitHub 仓库地址')
  }

  const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/i)
  if (!match) {
    throw new Error('[publish-updater-manifest] package.json repository.url 不是 GitHub 地址')
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
      `[publish-updater-manifest] ${command} ${args.join(' ')} 失败:\n${result.stderr || result.stdout}`,
    )
  }

  return result.stdout.trim()
}

/**
 * @param {string} repository
 * @param {string} [targetRef]
 */
export function ensureUpdaterRelease(repository, targetRef = 'HEAD') {
  try {
    runCommand('gh', ['release', 'view', UPDATER_RELEASE_TAG, '--repo', repository])
    runCommand('gh', [
      'release', 'edit', UPDATER_RELEASE_TAG,
      '--repo', repository,
      '--draft=false',
    ])
    return
  } catch {
    // create below
  }

  runCommand('gh', [
    'release', 'create', UPDATER_RELEASE_TAG,
    '--repo', repository,
    '--target', targetRef,
    '--title', 'nrm-desktop updater manifest',
    '--notes', 'Static manifest consumed by Tauri in-app updater. Do not delete.',
    '--draft=false',
  ])
}

/**
 * @param {{
 *   manifestFile: string
 *   repository?: string
 *   versionTag?: string
 *   targetRef?: string
 * }} options
 */
export function publishUpdaterManifest(options) {
  const repository = options.repository ?? resolveRepository()
  const manifestFile = path.resolve(rootDir, options.manifestFile)

  readFileSync(manifestFile, 'utf8')

  ensureUpdaterRelease(repository, options.targetRef)

  runCommand('gh', [
    'release', 'upload', UPDATER_RELEASE_TAG,
    '--repo', repository,
    manifestFile,
    '--clobber',
  ])

  if (options.versionTag) {
    runCommand('gh', [
      'release', 'upload', options.versionTag,
      '--repo', repository,
      manifestFile,
      '--clobber',
    ])
  }

  process.stdout.write(
    `[publish-updater-manifest] 已发布 ${UPDATER_MANIFEST_FILENAME} 到 ${repository}@${UPDATER_RELEASE_TAG}\n`,
  )
}

function main() {
  const manifestFile = parseArgValue('--manifest-file')
  const versionTag = parseArgValue('--version-tag')
  const targetRef = parseArgValue('--target-ref') || process.env.GITHUB_SHA || 'HEAD'

  if (!manifestFile) {
    throw new Error('[publish-updater-manifest] 缺少参数 --manifest-file')
  }

  publishUpdaterManifest({
    manifestFile,
    versionTag: versionTag || undefined,
    targetRef,
  })
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)

if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
