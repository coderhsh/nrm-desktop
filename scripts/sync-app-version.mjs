/* @desc 以 package.json 的 version 为唯一来源，同步到 tauri.conf.json 与 src-tauri/Cargo.toml（必要时刷新 Cargo.lock）。 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

/**
 * 仅替换 `[package]` 段内的 `version = "..."`，避免误改依赖里的 version。
 * @param {string} content
 * @param {string} newVersion
 * @returns {string}
 */
function setCargoPackageVersion(content, newVersion) {
  const lines = content.split(/\r?\n/)
  let inPackage = false
  let changed = false
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (trimmed === '[package]') {
      inPackage = true
      continue
    }
    if (trimmed.startsWith('[') && trimmed !== '[package]') {
      inPackage = false
    }
    if (inPackage && /^version\s*=\s*"[^"]*"\s*$/.test(trimmed)) {
      const indent = lines[i].match(/^\s*/)?.[0] ?? ''
      lines[i] = `${indent}version = "${newVersion}"`
      changed = true
      break
    }
  }
  if (!changed) {
    throw new Error('[sync-app-version] 未在 Cargo.toml 的 [package] 中找到 version 字段')
  }
  const nl = content.includes('\r\n') ? '\r\n' : '\n'
  return lines.join(nl)
}

/**
 * 将 package.json 中的 version 写入 Tauri 与 Cargo；若 Cargo.toml 有变更则运行 `cargo metadata` 以更新 Cargo.lock。
 * @returns {string} 同步用的 semver 字符串
 */
export function syncAppVersionFromPackageJson() {
  const pkgPath = path.join(rootDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const version = pkg.version
  if (!version || typeof version !== 'string') {
    throw new Error('[sync-app-version] package.json 缺少有效的 "version" 字段')
  }

  const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
  const tauriRaw = readFileSync(tauriConfPath, 'utf8')
  const tauriConf = JSON.parse(tauriRaw)
  if (tauriConf.version !== version) {
    tauriConf.version = version
    writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`, 'utf8')
  }

  const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml')
  const cargoBefore = readFileSync(cargoPath, 'utf8')
  const cargoAfter = setCargoPackageVersion(cargoBefore, version)
  if (cargoAfter !== cargoBefore) {
    writeFileSync(cargoPath, cargoAfter, 'utf8')
    const cargoDir = path.join(rootDir, 'src-tauri')
    const r = spawnSync('cargo', ['metadata', '--format-version', '1'], {
      cwd: cargoDir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (r.status !== 0) {
      process.stderr.write(
        `[sync-app-version] cargo metadata 失败，请在本机执行 cargo build / cargo check 以更新 Cargo.lock。\n${r.stderr || ''}`
      )
    }
  }

  return version
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (invokedDirectly) {
  try {
    const v = syncAppVersionFromPackageJson()
    process.stdout.write(`[sync-app-version] 已与 package.json 对齐为 ${v}\n`)
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  }
}
