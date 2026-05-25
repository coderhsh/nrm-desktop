/* @desc 将 Tauri build 配置覆盖写入临时 JSON，避免 Windows shell 解析内联 JSON 时丢失引号。 */
import { writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isTruthyEnv(value) {
  if (value === undefined || value.trim() === '') {
    return false
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

/**
 * @returns {boolean}
 */
function isCiEnvironment() {
  return isTruthyEnv(process.env.CI)
}

/**
 * @returns {boolean}
 */
function shouldSkipFrontendBuild() {
  return isTruthyEnv(process.env.NRM_SKIP_FRONTEND_BUILD)
}

/**
 * CI 下调整 beforeBuildCommand：预构建 dist 时仅 sync 版本；否则跳过 vue-tsc。
 * @param {Record<string, unknown>} overlay
 * @returns {Record<string, unknown>}
 */
export function applyBuildCommandOverlay(overlay) {
  if (!isCiEnvironment()) {
    return overlay
  }

  const result = { ...overlay }
  const buildSection = typeof result.build === 'object' && result.build !== null
    ? { .../** @type {Record<string, unknown>} */ (result.build) }
    : {}

  buildSection.beforeBuildCommand = shouldSkipFrontendBuild()
    ? 'pnpm sync:version'
    : 'pnpm sync:version && pnpm ui:build:ci'

  result.build = buildSection
  return result
}

/**
 * @param {Record<string, unknown>} overlay
 * @returns {Promise<string>}
 */
export async function writeTauriBuildConfigOverlay(overlay) {
  const mergedOverlay = applyBuildCommandOverlay(overlay)
  const filePath = path.join(os.tmpdir(), `nrm-tauri-build-overlay-${process.pid}.json`)
  await writeFile(filePath, `${JSON.stringify(mergedOverlay, null, 2)}\n`, 'utf8')
  return filePath
}

/**
 * @param {string | undefined} filePath
 * @returns {Promise<void>}
 */
export async function removeTauriBuildConfigOverlay(filePath) {
  if (!filePath) return
  try {
    await unlink(filePath)
  } catch {
    // Ignore missing temp config cleanup errors.
  }
}
