/* @desc 只读项目元数据：从 package.json、tauri.conf.json、Cargo.toml 解析 app slug / 产物名等，供 CI 脚本复用。 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultRootDir = path.resolve(__dirname, '..')

/**
 * @typedef {Object} ProjectMeta
 * @property {string} appSlug npm package name / artifact slug
 * @property {string} productName Tauri productName (bundle display name)
 * @property {string} binaryName Cargo [package].name (release binary basename)
 * @property {string} tauriDir path to Tauri crate dir, relative to project root unless absolute
 * @property {string} frontendDist frontend build output dir, relative to project root
 */

/** @type {Map<string, ProjectMeta>} */
const metaCache = new Map()

/**
 * @typedef {Object} GetProjectMetaOptions
 * @property {string} [rootDir] project root (default: repo root)
 * @property {string} [tauriDir] override Tauri dir; falls back to TAURI_DIR env then `src-tauri`
 * @property {boolean} [refresh] bypass cache
 */

/**
 * 解析 Cargo.toml `[package]` 段内的 `name = "..."`。
 * @param {string} content
 * @returns {string}
 */
function parseCargoPackageName(content) {
  const lines = content.split(/\r?\n/)
  let inPackage = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '[package]') {
      inPackage = true
      continue
    }
    if (trimmed.startsWith('[') && trimmed !== '[package]') {
      inPackage = false
    }
    if (inPackage) {
      const match = trimmed.match(/^name\s*=\s*"([^"]+)"\s*$/)
      if (match) {
        return match[1]
      }
    }
  }
  throw new Error('[project-meta] 未在 Cargo.toml 的 [package] 中找到 name 字段')
}

/**
 * 将 tauri.conf.json 的 frontendDist 规范为相对项目根的路径。
 * @param {Record<string, unknown>} tauriConf
 * @param {string} tauriDirAbs
 * @param {string} rootDir
 * @returns {string}
 */
function resolveFrontendDist(tauriConf, tauriDirAbs, rootDir) {
  const build = /** @type {{ frontendDist?: string } | undefined} */ (tauriConf.build)
  const raw = build?.frontendDist
  if (!raw || typeof raw !== 'string') {
    return 'dist'
  }
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(tauriDirAbs, raw)
  const relative = path.relative(rootDir, resolved)
  if (!relative || relative.startsWith('..')) {
    throw new Error('[project-meta] tauri.conf.json build.frontendDist 无法解析为项目内路径')
  }
  return relative
}

/**
 * @param {string} rootDir
 * @param {string} tauriDir
 * @returns {ProjectMeta}
 */
function loadProjectMeta(rootDir, tauriDir) {
  const pkgPath = path.join(rootDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (!pkg.name || typeof pkg.name !== 'string') {
    throw new Error('[project-meta] package.json 缺少有效的 "name" 字段')
  }

  const tauriDirAbs = path.isAbsolute(tauriDir) ? tauriDir : path.join(rootDir, tauriDir)
  const tauriConfPath = path.join(tauriDirAbs, 'tauri.conf.json')
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'))
  if (!tauriConf.productName || typeof tauriConf.productName !== 'string') {
    throw new Error('[project-meta] tauri.conf.json 缺少有效的 "productName" 字段')
  }

  const cargoPath = path.join(tauriDirAbs, 'Cargo.toml')
  const binaryName = parseCargoPackageName(readFileSync(cargoPath, 'utf8'))

  return {
    appSlug: pkg.name,
    productName: tauriConf.productName,
    binaryName,
    tauriDir,
    frontendDist: resolveFrontendDist(tauriConf, tauriDirAbs, rootDir),
  }
}

/**
 * @param {GetProjectMetaOptions} [options]
 * @returns {ProjectMeta}
 */
export function getProjectMeta(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? defaultRootDir)
  const tauriDir = options.tauriDir ?? process.env.TAURI_DIR ?? 'src-tauri'
  const cacheKey = `${rootDir}\0${tauriDir}`

  if (!options.refresh && metaCache.has(cacheKey)) {
    return metaCache.get(cacheKey)
  }

  const meta = loadProjectMeta(rootDir, tauriDir)
  metaCache.set(cacheKey, meta)
  return meta
}

/** 清空 getProjectMeta 缓存（供测试或同一进程内配置变更后使用）。 */
export function clearProjectMetaCache() {
  metaCache.clear()
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)

if (invokedDirectly) {
  try {
    process.stdout.write(`${JSON.stringify(getProjectMeta(), null, 2)}\n`)
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  }
}
