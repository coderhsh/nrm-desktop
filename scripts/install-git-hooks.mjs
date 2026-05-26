/* @desc 安装仓库 Git hooks（core.hooksPath -> scripts/git-hooks）。 */
import { chmodSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const hooksDir = path.join(rootDir, 'scripts', 'git-hooks')
const hooksPath = 'scripts/git-hooks'
const hookFiles = ['pre-commit', 'post-merge']

/**
 * @param {string[]} args
 * @returns {string}
 */
function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    throw new Error(message || `git ${args.join(' ')} failed`)
  }
  return result.stdout?.trim() ?? ''
}

function ensureHookExecutable() {
  for (const name of hookFiles) {
    const filePath = path.join(hooksDir, name)
    if (!existsSync(filePath)) {
      throw new Error(`[install-git-hooks] 缺少 hook 文件: ${filePath}`)
    }
    chmodSync(filePath, 0o755)
  }
}

function main() {
  if (String(process.env.CI || '').toLowerCase() === 'true') {
    process.stdout.write('[install-git-hooks] CI 环境，跳过安装\n')
    return
  }

  if (!existsSync(path.join(rootDir, '.git'))) {
    process.stdout.write('[install-git-hooks] 非 Git 仓库，跳过安装\n')
    return
  }

  const currentHooksPath = spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], {
    cwd: rootDir,
    encoding: 'utf8',
  }).stdout?.trim()

  if (currentHooksPath && currentHooksPath !== hooksPath) {
    process.stderr.write(
      `[install-git-hooks] 已存在自定义 core.hooksPath=${currentHooksPath}，未覆盖。可手动运行: git config core.hooksPath ${hooksPath}\n`,
    )
    return
  }

  ensureHookExecutable()
  runGit(['config', '--local', 'core.hooksPath', hooksPath])
  process.stdout.write(`[install-git-hooks] 已启用 Git hooks（${hooksPath}）\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
