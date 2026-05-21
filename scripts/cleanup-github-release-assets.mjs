/* @desc 发布前清理 GitHub Release 上旧的 nrm-desktop 安装包附件（含历史命名）。 */
import { spawnSync } from 'node:child_process'

/**
 * @param {string} name
 * @returns {string}
 */
function parseArgValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) {
    return ''
  }
  return process.argv[index + 1].trim()
}

/**
 * @param {string[]} args
 * @returns {{ status: number|null, stdout: string, stderr: string }}
 */
function runGh(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

/**
 * @param {string} filename
 * @returns {boolean}
 */
function isManagedInstallerAsset(filename) {
  return /^nrm-desktop/i.test(filename)
}

function main() {
  const tag = parseArgValue('--tag')
  if (!tag) {
    throw new Error('[cleanup-github-release-assets] 缺少参数 --tag，例如 --tag v1.0.1')
  }

  const view = runGh(['release', 'view', tag, '--json', 'assets'])
  if (view.status !== 0) {
    process.stdout.write(`[cleanup-github-release-assets] Release ${tag} 不存在，跳过清理。\n`)
    return
  }

  /** @type {{ assets?: Array<{ name?: string }> }} */
  const payload = JSON.parse(view.stdout)
  const assets = payload.assets ?? []
  const removable = assets
    .map(item => item.name)
    .filter(name => typeof name === 'string' && isManagedInstallerAsset(name))

  if (removable.length === 0) {
    process.stdout.write(`[cleanup-github-release-assets] Release ${tag} 无 nrm-desktop 安装包附件。\n`)
    return
  }

  for (const name of removable) {
    const deleted = runGh(['release', 'delete-asset', tag, name, '--yes'])
    if (deleted.status !== 0) {
      throw new Error(
        `[cleanup-github-release-assets] 无法删除 ${name}: ${deleted.stderr || deleted.stdout}`
      )
    }
    process.stdout.write(`[cleanup-github-release-assets] 已删除 ${name}\n`)
  }
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
