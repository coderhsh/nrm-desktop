/* @desc 仅打 Windows 安装包：x64；Windows 上产出 MSI+NSIS，非 Windows 上交叉编译仅产出 NSIS（MSI 需 WiX，仅在 Windows 可用）。 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
/** @type {const} */
const WIN_TARGET = 'x86_64-pc-windows-msvc'
const releaseDir = path.join(rootDir, 'src-tauri', 'target', WIN_TARGET, 'release')
const bundleDir = path.join(releaseDir, 'bundle')

const MSI_LOCALE_SUFFIX = /_(?:[a-z]{2})(?:-(?:[a-zA-Z0-9]+))+\.msi$/i

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
 * @returns {Promise<void>}
 */
function runTauriBuildWin() {
  const isWin = process.platform === 'win32'
  const command = isWin ? 'pnpm.cmd' : 'pnpm'

  /** MSI 依赖 WiX，官方仅支持在 Windows 上生成。 */
  const bundles = isWin ? 'msi,nsis' : 'nsis'
  const args = ['tauri', 'build', '--target', WIN_TARGET, '--bundles', bundles]

  if (!isWin) {
    args.push('--runner', 'cargo-xwin')
    process.stdout.write('[tauri-build-win] 非 Windows：仅构建 NSIS（需已安装 NSIS、LLVM/LLD 与 cargo-xwin）；MSI 请在 Windows 上执行 pnpm build:win。\n\n')
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`构建进程被信号中断: ${signal}`))
        return
      }
      if (code !== 0) {
        reject(new Error(`tauri build 失败，退出码: ${code ?? 'unknown'}`))
        return
      }
      resolve()
    })
  })
}

async function main() {
  const startedAt = Date.now()
  await runTauriBuildWin()
  await renameMsiFilesStripLocaleSuffix()
  await printArtifacts()
  const elapsedMs = Date.now() - startedAt
  process.stdout.write(`\n打包总时长: ${formatBuildDuration(elapsedMs)}（${elapsedMs} ms）\n`)
}

main().catch(err => {
  process.stderr.write(`[tauri-build-win] ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
