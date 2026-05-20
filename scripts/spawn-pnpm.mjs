import { spawn } from 'node:child_process'

/** @typedef {import('node:child_process').SpawnOptions} SpawnOptions */

/**
 * Spawn pnpm cross-platform.
 * Node 20+ on Windows rejects spawning `.cmd` without shell (EINVAL).
 * @param {string[]} args
 * @param {SpawnOptions} options
 * @returns {import('node:child_process').ChildProcess}
 */
export function spawnPnpm(args, options) {
  return spawn('pnpm', args, {
    ...options,
    shell: process.platform === 'win32' ? true : options.shell,
  })
}
