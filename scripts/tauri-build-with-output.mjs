/* @desc 构建并输出产物路径 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { syncAppVersionFromPackageJson } from './sync-app-version.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const cargoTargetDir = path.join(rootDir, 'src-tauri', 'target')
const releaseDir = path.join(rootDir, 'src-tauri', 'target', 'release')
const bundleDir = path.join(releaseDir, 'bundle')
const INSTALLER_EXTENSIONS = new Set(['.dmg', '.pkg', '.msi', '.exe', '.deb', '.rpm', '.appimage'])

/** WiX 输出常见后缀：_{lang}.msi，如 en-US、zh-CN（Tauri 无法通过配置省略该段，构建后再改名）。 */
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
 * Build destination path for MSI with locale suffix removed (e.g. *_en-US.msi → *.msi).
 * @param {string} msiPath
 * @returns {string|null} 若 basename 不含上述语言后缀则返回 null
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
 * Rename MSI files in bundle/msi to drop the trailing locale segment (e.g. _en-US), when renames are collision-free.
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
    process.stderr.write('[tauri-build] MSI 多语言产物若去掉区域后缀会重名，已跳过重命名；请保留带语言后缀的文件名或分别发布。\n')
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
 * Path to the main app binary next to `bundle/` (not inside installer outputs).
 * @returns {string}
 */
function getMainReleaseBinaryPath() {
  const binaryName = process.platform === 'win32' ? 'nrm-desktop.exe' : 'nrm-desktop'
  return path.join(releaseDir, binaryName)
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
 * Run tauri build command and inherit terminal output.
 * @returns {Promise<void>}
 */
function runTauriBuild() {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

  return new Promise((resolve, reject) => {
    const child = spawn(command, ['tauri', 'build'], {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, CARGO_TARGET_DIR: cargoTargetDir },
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

/**
 * Run tauri build with explicit bundle targets.
 * @param {string[]} bundles
 * @returns {Promise<void>}
 */
function runTauriBuildWithBundles(bundles) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const args = ['tauri', 'build', '--bundles', bundles.join(',')]

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, CARGO_TARGET_DIR: cargoTargetDir },
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

/**
 * Create a plain DMG from generated .app without Finder automation.
 * @param {string} appVersion semver from package.json (after sync)
 * @returns {Promise<void>}
 */
async function createNonInteractiveMacDmg(appVersion) {
  const appBundlePath = path.join(bundleDir, 'macos', 'nrm-desktop.app')
  if (!(await pathExists(appBundlePath))) {
    throw new Error(`未找到 .app 产物，无法生成 dmg: ${appBundlePath}`)
  }

  const dmgDir = path.join(bundleDir, 'dmg')
  await fs.mkdir(dmgDir, { recursive: true })

  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch
  const dmgName = `nrm-desktop_${appVersion}_${arch}.dmg`
  const dmgPath = path.join(dmgDir, dmgName)

  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nrm-desktop-dmg-'))
  try {
    const stagedAppPath = path.join(stagingDir, 'nrm-desktop.app')
    const applicationsLinkPath = path.join(stagingDir, 'Applications')
    await fs.cp(appBundlePath, stagedAppPath, { recursive: true })
    try {
      await fs.symlink('/Applications', applicationsLinkPath)
    } catch (error) {
      throw new Error(`创建 Applications 快捷方式失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    await new Promise((resolve, reject) => {
      const child = spawn(
        'hdiutil',
        [
          'create',
          '-volname',
          'nrm-desktop',
          '-srcfolder',
          stagingDir,
          '-ov',
          '-format',
          'UDZO',
          dmgPath,
        ],
        {
          cwd: rootDir,
          stdio: 'inherit',
          env: process.env,
        }
      )

      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`hdiutil 进程被信号中断: ${signal}`))
          return
        }
        if (code !== 0) {
          reject(new Error(`hdiutil 生成 dmg 失败，退出码: ${code ?? 'unknown'}`))
          return
        }
        resolve()
      })
    })
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true })
  }
}

/**
 * Recursively collect generated artifact file paths.
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
 * @param {string} filePath
 * @returns {boolean}
 */
function isInstallerArtifact(filePath) {
  const base = path.basename(filePath).toLowerCase()
  if (base.startsWith('rw.') && base.endsWith('.dmg')) {
    return false
  }
  const ext = path.extname(filePath).toLowerCase()
  return INSTALLER_EXTENSIONS.has(ext)
}

/**
 * Recursively remove empty directories.
 * @param {string} directory
 * @returns {Promise<void>}
 */
async function removeEmptyDirectories(directory) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    await removeEmptyDirectories(path.join(directory, entry.name))
  }

  const remaining = await fs.readdir(directory)
  if (remaining.length === 0 && directory !== bundleDir) {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

/**
 * Keep only installer artifacts under bundle directory.
 * @returns {Promise<void>}
 */
async function pruneBundleArtifactsToInstallers() {
  let artifacts
  try {
    artifacts = await collectArtifacts(bundleDir)
  } catch {
    return
  }

  const removable = artifacts.filter(filePath => !isInstallerArtifact(filePath))
  for (const filePath of removable) {
    await fs.rm(filePath, { force: true })
  }
  await removeEmptyDirectories(bundleDir)
}

/**
 * Print main binary path plus bundle files.
 * @returns {Promise<void>}
 */
async function printArtifacts() {
  let artifacts = []
  let hasBundleDir = false
  try {
    artifacts = await collectArtifacts(bundleDir)
    hasBundleDir = true
  } catch {
    hasBundleDir = false
  }

  const sortedArtifacts = artifacts.sort((left, right) => left.localeCompare(right))
  const installerArtifacts = sortedArtifacts.filter(isInstallerArtifact)
  process.stdout.write('\n=== 打包产物 ===\n')

  if (!hasBundleDir) {
    process.stdout.write('[tauri-build] 未找到 bundle 目录（可能未开启安装包或未成功打包）。\n')
    return
  }

  if (installerArtifacts.length === 0) {
    process.stdout.write('bundle 目录内未发现安装包产物，请检查打包配置。\n')
    return
  }

  process.stdout.write('\n安装包文件:\n')
  installerArtifacts.forEach((artifactPath, index) => {
    process.stdout.write(`${index + 1}. ${artifactPath}\n`)
  })
}

async function main() {
  const appVersion = syncAppVersionFromPackageJson()
  const startedAt = Date.now()
  const isCi = String(process.env.CI || '').toLowerCase() === 'true'
  const shouldUseNonInteractiveMacDmg = process.platform === 'darwin' && isCi

  if (shouldUseNonInteractiveMacDmg) {
    await runTauriBuildWithBundles(['app'])
    await createNonInteractiveMacDmg(appVersion)
  } else {
    await runTauriBuild()
  }
  await renameMsiFilesStripLocaleSuffix()
  await pruneBundleArtifactsToInstallers()
  await printArtifacts()
  const elapsedMs = Date.now() - startedAt
  process.stdout.write(`\n打包总时长: ${formatBuildDuration(elapsedMs)}（${elapsedMs} ms）\n`)
}

main().catch(error => {
  process.stderr.write(`[tauri-build] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
