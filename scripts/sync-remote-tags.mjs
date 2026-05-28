/* @desc 将本地 release tag 与 origin 对齐，避免 pull --tags 时 clobber 报错。 */
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/**
 * @param {string[]} args
 * @param {{ allowFailure?: boolean }} [options]
 * @returns {string}
 */
function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    if (options.allowFailure) {
      return ''
    }
    throw new Error(message || `git ${args.join(' ')} failed`)
  }
  return result.stdout?.trim() ?? ''
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function hasCliFlag(name) {
  return process.argv.includes(name)
}

/**
 * 允许 fetch/pull --tags 时用远程 tag 覆盖本地（仅本仓库）。
 * @param {{ quiet?: boolean }} [options]
 * @returns {void}
 */
export function ensureForceUpdateTags(options = {}) {
  const { quiet = false } = options
  const current = spawnSync('git', ['config', '--local', '--get', 'fetch.forceUpdateTags'], {
    encoding: 'utf8',
  })
  if (current.stdout?.trim() === 'true') {
    return
  }

  const set = spawnSync('git', ['config', '--local', 'fetch.forceUpdateTags', 'true'], {
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'ignore', 'ignore'] : 'inherit',
  })
  if (set.status !== 0) {
    throw new Error('[sync-remote-tags] 无法设置 fetch.forceUpdateTags=true')
  }
  if (!quiet) {
    process.stdout.write('[sync-remote-tags] 已设置 fetch.forceUpdateTags=true（仅本仓库）\n')
  }
}

/**
 * @typedef {{ allowOffline?: boolean, quiet?: boolean }} SyncRemoteTagsOptions
 */

/**
 * @param {SyncRemoteTagsOptions} [options]
 * @returns {void}
 */
export function syncRemoteTags(options = {}) {
  const { allowOffline = false, quiet = false } = options

  try {
    ensureForceUpdateTags({ quiet })
    runGit(['fetch', 'origin', '--prune'])
    runGit(['fetch', 'origin', '--tags', '--force'])
    if (!quiet) {
      process.stdout.write('[sync-remote-tags] 本地 tag 已与 origin 对齐\n')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (allowOffline) {
      if (!quiet) {
        process.stderr.write(`[sync-remote-tags] 跳过 tag 同步（离线或网络不可用）: ${message}\n`)
      }
      return
    }
    throw error
  }
}

function main() {
  syncRemoteTags({
    allowOffline: hasCliFlag('--allow-offline'),
    quiet: hasCliFlag('--quiet'),
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
