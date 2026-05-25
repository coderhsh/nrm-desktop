/* @desc 将本地 release tag 与 origin 对齐，避免 pull --tags 时 clobber 报错。 */
import { spawnSync } from 'node:child_process'

/**
 * @param {string[]} args
 * @returns {number | null}
 */
function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    throw new Error(message || `git ${args.join(' ')} failed`)
  }
  return result.stdout?.trim() ?? ''
}

/**
 * 允许 fetch/pull --tags 时用远程 tag 覆盖本地（仅本仓库）。
 * @returns {void}
 */
function ensureForceUpdateTags() {
  const current = spawnSync('git', ['config', '--local', '--get', 'fetch.forceUpdateTags'], {
    encoding: 'utf8',
  })
  if (current.stdout?.trim() === 'true') {
    return
  }

  const set = spawnSync('git', ['config', '--local', 'fetch.forceUpdateTags', 'true'], {
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (set.status !== 0) {
    throw new Error('[sync-remote-tags] 无法设置 fetch.forceUpdateTags=true')
  }
  process.stdout.write('[sync-remote-tags] 已设置 fetch.forceUpdateTags=true（仅本仓库）\n')
}

function main() {
  ensureForceUpdateTags()
  runGit(['fetch', 'origin', '--prune'])
  runGit(['fetch', 'origin', '--tags', '--force'])
  process.stdout.write('[sync-remote-tags] 本地 tag 已与 origin 对齐\n')
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
