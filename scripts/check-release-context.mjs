/* @desc 检查 GitHub Release 是否存在，并决定 prepare-release 的运行模式。 */
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
 * @param {string} value
 * @returns {boolean}
 */
function parseBooleanArg(value) {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

/**
 * @param {string} version
 * @returns {[number, number, number]}
 */
function parseCoreVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    throw new Error(`[check-release-context] 无法解析版本号: ${version}`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
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
 * @returns {boolean}
 */
function githubReleaseExists(tag) {
  const result = spawnSync('gh', ['release', 'view', tag], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  return result.status === 0
}

function main() {
  const version = parseArgValue('--version')
  const overwrite = parseBooleanArg(parseArgValue('--overwrite') || 'false')

  if (!version) {
    throw new Error('[check-release-context] 缺少参数 --version')
  }

  const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
  const currentVersion = pkg.version
  if (typeof currentVersion !== 'string' || !currentVersion.trim()) {
    throw new Error('[check-release-context] package.json 缺少有效 version')
  }

  const tag = `v${version}`
  const releaseExists = githubReleaseExists(tag)
  const versionCompare = compareSemver(version, currentVersion)

  if (versionCompare < 0) {
    throw new Error(
      `[check-release-context] 发布版本 ${version} 低于当前 package.json 版本 ${currentVersion}`
    )
  }

  if (releaseExists) {
    if (!overwrite) {
      throw new Error(
        `[check-release-context] GitHub Release ${tag} 已存在。若要覆盖并重新上传安装包，请勾选 overwrite_release。`
      )
    }
    if (versionCompare !== 0) {
      throw new Error(
        `[check-release-context] 无法覆盖 ${tag}：package.json 当前版本为 ${currentVersion}，与输入版本不一致。`
      )
    }
    writeGithubOutput('prepare_mode', 'overwrite')
    writeGithubOutput('release_exists', 'true')
    process.stdout.write(`[check-release-context] 将覆盖已有 Release ${tag}\n`)
    return
  }

  writeGithubOutput('release_exists', 'false')

  if (versionCompare === 0) {
    writeGithubOutput('prepare_mode', 'retry')
    process.stdout.write(`[check-release-context] 未发现 Release ${tag}，将重试发布当前版本\n`)
    return
  }

  writeGithubOutput('prepare_mode', 'fresh')
  process.stdout.write(`[check-release-context] 将发布新版本 ${version}（当前 ${currentVersion}）\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
