/* @desc CI 构建前将真实 updater 公钥写入 Tauri 配置；本地无环境变量时保持仓库默认值。 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const configPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')

function main() {
  const pubkey = process.env.TAURI_UPDATER_PUBKEY?.trim()
  if (!pubkey) {
    process.stdout.write('[apply-updater-pubkey] 未设置 TAURI_UPDATER_PUBKEY，保持 tauri.conf.json 当前公钥。\n')
    return
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  config.plugins ??= {}
  config.plugins.updater ??= {}
  config.plugins.updater.pubkey = pubkey
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  process.stdout.write('[apply-updater-pubkey] 已写入 updater 公钥。\n')
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
