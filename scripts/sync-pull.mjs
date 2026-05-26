/* @desc 安全 pull：先强制同步 tag，再 pull 分支（避免 pull --tags clobber）。 */
import { spawnSync } from 'node:child_process'

import { syncRemoteTags } from './sync-remote-tags.mjs'

/**
 * @param {string[]} args
 * @returns {void}
 */
function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function main() {
  const branch = process.argv[2] || 'dev'
  syncRemoteTags()
  runGit(['pull', '--autostash', 'origin', branch, '--no-tags'])
  process.stdout.write(`[sync-pull] 已同步 origin/${branch}（tag 已通过 fetch --force 对齐）\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
