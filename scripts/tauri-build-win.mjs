/* @desc 仅打 Windows 安装包：x64；Windows 上产出 MSI+NSIS，非 Windows 上交叉编译仅产出 NSIS（MSI 需 WiX，仅在 Windows 可用）。 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  getWindowsMsiArtifactName,
  getWindowsSetupArtifactName,
  getUpdaterSignatureArtifactName,
} from './artifact-names.mjs'
import {
  removeTauriBuildConfigOverlay,
  writeTauriBuildConfigOverlay,
} from './tauri-build-config-overlay.mjs'
import { syncAppVersionFromPackageJson } from './sync-app-version.mjs'
import { spawnPnpm } from './spawn-pnpm.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
/** @type {const} */
const WIN_TARGET = 'x86_64-pc-windows-msvc'
const releaseDir = path.join(rootDir, 'src-tauri', 'target', WIN_TARGET, 'release')
const bundleDir = path.join(releaseDir, 'bundle')
const EXTRA_PATH_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/opt/homebrew/opt/llvm/bin',
  '/usr/local/opt/llvm/bin',
]

const MSI_LOCALE_SUFFIX = /_(?:[a-z]{2})(?:-(?:[a-zA-Z0-9]+))+\.msi$/i
const ENV_BUILD_SETUP_EXE = 'NRM_WINDOWS_SETUP_EXE'
const ENV_BUILD_MSI = 'NRM_WINDOWS_MSI'
const ENV_BUILD_PORTABLE_ZIP = 'NRM_WINDOWS_PORTABLE_ZIP'

/**
 * @param {string} name
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function readBooleanEnv(name, defaultValue) {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    return defaultValue
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

/**
 * @returns {{ setupExe: boolean, msi: boolean, portableZip: boolean, needsBundle: boolean }}
 */
function getWindowsBuildSelection() {
  const setupExe = readBooleanEnv(ENV_BUILD_SETUP_EXE, true)
  const msi = readBooleanEnv(ENV_BUILD_MSI, true)
  const portableZip = readBooleanEnv(ENV_BUILD_PORTABLE_ZIP, false)
  const needsBundle = setupExe || msi

  if (!needsBundle && !portableZip) {
    throw new Error('未选择任何 Windows 产物：请至少启用 setup.exe、MSI 或 portable zip 之一。')
  }

  return { setupExe, msi, portableZip, needsBundle }
}

/**
 * @param {{ setupExe: boolean, msi: boolean, portableZip: boolean, needsBundle: boolean }} selection
 * @returns {string}
 */
function formatWindowsBuildSelection(selection) {
  const items = []
  if (selection.setupExe) {
    items.push('setup.exe(NSIS)')
  }
  if (selection.msi) {
    items.push('MSI')
  }
  if (selection.portableZip) {
    items.push('portable zip')
  }
  return items.join(', ')
}

/**
 * 执行命令并采集输出（非 0 退出码时不抛错，返回结果供调用方判断）。
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ exitCode: number|null, stdout: string, stderr: string, error: Error|null }>}
 */
function runCommandCapture(command, args) {
  const basePath = process.env.PATH ?? ''
  const pathParts = basePath.split(path.delimiter).filter(Boolean)
  const mergedPath = [...new Set([...EXTRA_PATH_DIRS, ...pathParts])].join(path.delimiter)
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: { ...process.env, PATH: mergedPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('error', error => {
      resolve({ exitCode: null, stdout, stderr, error })
    })
    child.on('close', exitCode => {
      resolve({ exitCode, stdout, stderr, error: null })
    })
  })
}

/**
 * 检查命令是否可用（在 PATH 可执行）。
 * @param {string} command
 * @param {string[]} [probeArgs]
 * @returns {Promise<boolean>}
 */
async function commandExists(command, probeArgs = ['--version']) {
  const probe = await runCommandCapture(command, probeArgs)
  if (probe.error) {
    return false
  }
  return probe.exitCode === 0
}

/**
 * @param {{ setupExe: boolean, msi: boolean, portableZip: boolean, needsBundle: boolean }} selection
 * @returns {Promise<void>}
 */
async function preflightChecks(selection) {
  if (process.platform === 'win32') {
    return
  }

  /** @type {string[]} */
  const problems = []

  if (!(await commandExists('cargo-xwin'))) {
    problems.push('缺少 `cargo-xwin`：请先执行 `cargo install cargo-xwin`。')
  }

  if (selection.setupExe && !(await commandExists('makensis', ['-VERSION']))) {
    problems.push('缺少 `makensis`（NSIS）：请先安装 NSIS，并确保 `makensis` 已加入 PATH。')
  }
  if (!(await commandExists('llvm-lib'))) {
    problems.push('缺少 `llvm-lib`（LLVM 工具链）：请先安装 LLVM，并确保其 bin 目录在 PATH（例如 `brew install llvm`）。')
  }

  const rustup = await runCommandCapture('rustup', ['target', 'list', '--installed'])
  if (rustup.error || rustup.exitCode !== 0) {
    problems.push('无法执行 `rustup`：请先安装并初始化 Rust 工具链（https://rustup.rs/）。')
  } else {
    const installedTargets = rustup.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    if (!installedTargets.includes(WIN_TARGET)) {
      problems.push(`缺少 Rust 目标 ` + `\`${WIN_TARGET}\`` + `：请执行 \`rustup target add ${WIN_TARGET}\`。`)
    }
  }

  if (selection.msi && !selection.setupExe) {
    problems.push('MSI 依赖 WiX，仅支持在 Windows 上生成；请在 Windows 上执行 `pnpm build:win`，或关闭 MSI 产物。')
  } else if (selection.msi) {
    process.stderr.write('[tauri-build-win] 非 Windows 环境会跳过 MSI，仅构建 NSIS；MSI 请在 Windows 上执行 pnpm build:win。\n')
  }

  if (problems.length > 0) {
    const details = problems.map((item, index) => `${index + 1}. ${item}`).join('\n')
    throw new Error(`构建前环境检查未通过：\n${details}`)
  }
}

/**
 * 将毫秒格式化为可读打包时长（如 `12.3秒`、`2分15.0秒`）。
 * @param {number} ms
 * @returns {string}
 */
function formatBuildDuration(ms) {
  if (ms < 0) {
    ms = 0
  }
  const sec = ms / 1000
  if (sec < 60) {
    return `${sec.toFixed(1)}秒`
  }
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  return `${minutes}分${seconds.toFixed(1)}秒`
}

/**
 * @param {string} msiPath
 * @returns {string|null}
 */
function getMsiPathWithoutLocaleSuffix(msiPath) {
  const base = path.basename(msiPath)
  if (!MSI_LOCALE_SUFFIX.test(base)) {
    return null
  }
  const nextBase = base.replace(MSI_LOCALE_SUFFIX, '.msi')
  return path.join(path.dirname(msiPath), nextBase)
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Rename MSI files to drop trailing locale segment (e.g. _en-US).
 * @returns {Promise<void>}
 */
async function renameMsiFilesStripLocaleSuffix() {
  const msiRoot = path.join(bundleDir, 'msi')
  let entries
  try {
    entries = await fs.readdir(msiRoot, { withFileTypes: true })
  } catch {
    return
  }

  const msiFiles = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.msi')).map(e => path.join(msiRoot, e.name))

  const pairs = msiFiles
    .map(from => {
      const to = getMsiPathWithoutLocaleSuffix(from)
      return to && to !== from ? { from, to } : null
    })
    .filter(p => p !== null)

  if (pairs.length === 0) {
    return
  }

  const destinations = pairs.map(p => p.to)
  if (new Set(destinations).size !== destinations.length) {
    process.stderr.write('[tauri-build-win] MSI 多语言产物若去掉区域后缀会重名，已跳过重命名。\n')
    return
  }

  for (const { from, to } of pairs) {
    /** 覆盖上一次构建留下的无语言后缀 MSI，否则会跳过 rename 导致 en-US 与 x64 两个文件并存。 */
    if (await pathExists(to)) {
      await fs.rm(to, { force: true })
    }
    await fs.rename(from, to)
  }
}

/**
 * Rename Windows installer outputs to nrm-desktop_{version}_windows_x64[-setup].{ext}.
 * @param {string} version
 * @returns {Promise<void>}
 */
async function renameWindowsInstallers(version) {
  const setupTarget = path.join(bundleDir, 'nsis', getWindowsSetupArtifactName(version))
  const setupSignatureTarget = path.join(bundleDir, 'nsis', getUpdaterSignatureArtifactName(getWindowsSetupArtifactName(version)))
  const msiTarget = path.join(bundleDir, 'msi', getWindowsMsiArtifactName(version))

  const nsisDir = path.join(bundleDir, 'nsis')
  try {
    const entries = await fs.readdir(nsisDir, { withFileTypes: true })
    const exeFiles = entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
      .map(entry => path.join(nsisDir, entry.name))

    if (exeFiles.length > 0) {
      const sourcePath = exeFiles.includes(setupTarget)
        ? setupTarget
        : exeFiles.sort((left, right) => right.localeCompare(left))[0]

      if (sourcePath !== setupTarget) {
        const sourceSignaturePath = `${sourcePath}.sig`
        if (await pathExists(setupTarget)) {
          await fs.rm(setupTarget, { force: true })
        }
        await fs.rename(sourcePath, setupTarget)
        if (await pathExists(sourceSignaturePath)) {
          if (await pathExists(setupSignatureTarget)) {
            await fs.rm(setupSignatureTarget, { force: true })
          }
          await fs.rename(sourceSignaturePath, setupSignatureTarget)
        }
      }

      for (const filePath of exeFiles) {
        if (filePath !== setupTarget) {
          await fs.rm(filePath, { force: true })
        }
        const signaturePath = `${filePath}.sig`
        if (signaturePath !== setupSignatureTarget && await pathExists(signaturePath)) {
          await fs.rm(signaturePath, { force: true })
        }
      }
    }
  } catch {
    // NSIS 目录不存在时跳过。
  }

  const msiDir = path.join(bundleDir, 'msi')
  try {
    const entries = await fs.readdir(msiDir, { withFileTypes: true })
    const msiFiles = entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.msi'))
      .map(entry => path.join(msiDir, entry.name))

    if (msiFiles.length > 0) {
      const sourcePath = msiFiles.includes(msiTarget)
        ? msiTarget
        : msiFiles.sort((left, right) => right.localeCompare(left))[0]

      if (sourcePath !== msiTarget) {
        if (await pathExists(msiTarget)) {
          await fs.rm(msiTarget, { force: true })
        }
        await fs.rename(sourcePath, msiTarget)
      }

      for (const filePath of msiFiles) {
        if (filePath !== msiTarget) {
          await fs.rm(filePath, { force: true })
        }
      }
    }
  } catch {
    // MSI 目录不存在时跳过。
  }
}

/**
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function collectArtifacts(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return collectArtifacts(fullPath)
      }
      return [fullPath]
    })
  )
  return files.flat()
}

/**
 * @returns {Promise<void>}
 */
async function printArtifacts() {
  const mainExe = path.join(releaseDir, 'nrm-desktop.exe')
  const hasMain = await pathExists(mainExe)

  let artifacts = []
  let hasBundleDir = false
  try {
    artifacts = await collectArtifacts(bundleDir)
    hasBundleDir = true
  } catch {
    hasBundleDir = false
  }

  const sorted = artifacts.sort((a, b) => a.localeCompare(b))
  process.stdout.write('\n=== 打包产物（Windows x64）===\n')

  if (hasMain) {
    process.stdout.write(`主程序: ${mainExe}\n`)
  } else {
    process.stdout.write(`[tauri-build-win] 未找到主程序: ${mainExe}\n`)
  }

  if (!hasBundleDir) {
    process.stdout.write('[tauri-build-win] 未找到 bundle 目录。\n')
    return
  }

  if (sorted.length === 0) {
    process.stdout.write('bundle 目录内未发现产物文件。\n')
    return
  }

  process.stdout.write('\nbundle 内文件:\n')
  sorted.forEach((p, i) => {
    process.stdout.write(`${i + 1}. ${p}\n`)
  })
}

/**
 * Spawn `pnpm tauri build` with Windows target and bundle set.
 * @param {{ setupExe: boolean, msi: boolean, portableZip: boolean, needsBundle: boolean }} selection
 * @returns {Promise<void>}
 */
async function runTauriBuildWin(selection) {
  const isWin = process.platform === 'win32'
  const basePath = process.env.PATH ?? ''
  const pathParts = basePath.split(path.delimiter).filter(Boolean)
  const mergedPath = [...new Set([...EXTRA_PATH_DIRS, ...pathParts])].join(path.delimiter)
  const buildConfig = {
    bundle: {
      createUpdaterArtifacts: shouldCreateUpdaterArtifacts(),
    },
  }

  /** @type {string[]} */
  const args = ['tauri', 'build', '--target', WIN_TARGET]

  if (!selection.needsBundle) {
    args.push('--no-bundle')
    if (!isWin) {
      args.push('--runner', 'cargo-xwin')
    }
    process.stdout.write('[tauri-build-win] 仅构建 Windows 主程序（--no-bundle），用于生成 portable zip。\n\n')
  } else if (!isWin) {
    /**
     * macOS/Linux 上 tauri CLI 的 `--bundles` 参数值会受宿主平台限制，
     * 即使指定了 Windows target，也会拒绝 `nsis/msi`（仅识别 dmg/app 等）。
     * 因此改用 `--config` 覆盖 bundle.targets，仅构建 NSIS。
     */
    buildConfig.bundle.targets = 'nsis'
    args.push('--runner', 'cargo-xwin')
    process.stdout.write('[tauri-build-win] 非 Windows：仅构建 NSIS（需已安装 NSIS、LLVM/LLD 与 cargo-xwin）；MSI 请在 Windows 上执行 pnpm build:win。\n\n')
  } else {
    /** MSI 依赖 WiX，官方仅支持在 Windows 上生成。 */
    const bundles = []
    if (selection.msi) {
      bundles.push('msi')
    }
    if (selection.setupExe) {
      bundles.push('nsis')
    }
    args.push('--bundles', bundles.join(','))
  }

  const configPath = await writeTauriBuildConfigOverlay(buildConfig)
  args.push('--config', configPath)

  try {
    await new Promise((resolve, reject) => {
      let combinedOutput = ''
      const child = spawnPnpm(args, {
        cwd: rootDir,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env, PATH: mergedPath },
      })

      child.stdout.on('data', chunk => {
        const text = String(chunk)
        combinedOutput += text
        process.stdout.write(text)
      })
      child.stderr.on('data', chunk => {
        const text = String(chunk)
        combinedOutput += text
        process.stderr.write(text)
      })

      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`构建进程被信号中断: ${signal}`))
          return
        }
        if (code !== 0) {
          const tail = combinedOutput.slice(-2000).trim()
          reject(new Error(`tauri build 失败，退出码: ${code ?? 'unknown'}\n${tail}`))
          return
        }
        resolve()
      })
    })
  } finally {
    await removeTauriBuildConfigOverlay(configPath)
  }
}

/**
 * @returns {boolean}
 */
function shouldCreateUpdaterArtifacts() {
  return Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY?.trim())
}

/**
 * 判断是否为可重试的网络下载错误（NSIS 工具下载阶段常见 TLS EOF）。
 * @param {Error} error
 * @returns {boolean}
 */
function isRetriableNetworkError(error) {
  const message = error.message.toLowerCase()
  return message.includes('peer closed connection without sending tls close_notify')
    || message.includes('unexpected-eof')
    || (message.includes('failed to bundle project') && message.includes('downloading https://github.com/tauri-apps/nsis-tauri-utils'))
}

/**
 * 异步等待指定毫秒。
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
/**
 * @param {{ setupExe: boolean, msi: boolean, portableZip: boolean, needsBundle: boolean }} selection
 * @returns {Promise<void>}
 */
async function runTauriBuildWinWithRetry(selection) {
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runTauriBuildWin(selection)
      return
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const canRetry = attempt < maxAttempts && isRetriableNetworkError(err)
      if (!canRetry) {
        throw err
      }
      process.stderr.write(`[tauri-build-win] 检测到网络下载中断（第 ${attempt} 次），3 秒后自动重试...\n`)
      await sleep(3000)
    }
  }
}

async function main() {
  const appVersion = syncAppVersionFromPackageJson()
  const selection = getWindowsBuildSelection()
  const startedAt = Date.now()
  process.stdout.write(`[tauri-build-win] Windows 产物选择：${formatWindowsBuildSelection(selection)}\n\n`)
  await preflightChecks(selection)
  await runTauriBuildWinWithRetry(selection)
  await renameMsiFilesStripLocaleSuffix()
  if (selection.setupExe || selection.msi) {
    await renameWindowsInstallers(appVersion)
  }
  await printArtifacts()
  const elapsedMs = Date.now() - startedAt
  process.stdout.write(`\n打包总时长: ${formatBuildDuration(elapsedMs)}（${elapsedMs} ms）\n`)
}

main().catch(err => {
  process.stderr.write(`[tauri-build-win] ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
