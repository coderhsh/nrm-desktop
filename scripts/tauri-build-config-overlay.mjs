/* @desc 将 Tauri build 配置覆盖写入临时 JSON，避免 Windows shell 解析内联 JSON 时丢失引号。 */
import { writeFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * @param {Record<string, unknown>} overlay
 * @returns {Promise<string>}
 */
export async function writeTauriBuildConfigOverlay(overlay) {
  const filePath = path.join(os.tmpdir(), `nrm-tauri-build-overlay-${process.pid}.json`)
  await writeFile(filePath, `${JSON.stringify(overlay, null, 2)}\n`, 'utf8')
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
