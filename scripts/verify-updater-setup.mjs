/* @desc 校验 updater 代码与 CI 配置是否就绪，并检查 GitHub 固定 manifest 是否已发布。 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  getMacUpdaterArchiveArtifactName,
  getUpdaterSignatureArtifactName,
  getWindowsSetupArtifactName,
} from './artifact-names.mjs'
import { buildUpdaterManifest } from './generate-updater-manifest.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const configPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
const reusableWorkflowPath = path.join(rootDir, '.github', 'workflows', 'installer-build-reusable.yml')
const releaseWorkflowPath = path.join(rootDir, '.github', 'workflows', 'release-installers.yml')

const REQUIRED_SECRETS = [
  'TAURI_SIGNING_PRIVATE_KEY',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  'TAURI_UPDATER_PUBKEY',
]

const UPDATER_ENDPOINT =
  'https://github.com/coderhsh/nrm-desktop/releases/download/updater/latest.json'

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function readText(filePath) {
  return readFile(filePath, 'utf8')
}

/**
 * @param {string} label
 * @param {boolean} ok
 * @param {string} [detail]
 */
function reportCheck(label, ok, detail = '') {
  const status = ok ? 'OK' : 'FAIL'
  process.stdout.write(`[verify-updater-setup] ${status} ${label}${detail ? `: ${detail}` : ''}\n`)
  return ok
}

async function verifyTauriConfig() {
  const config = JSON.parse(await readText(configPath))
  const updater = config.plugins?.updater
  const checks = [
    reportCheck('bundle.createUpdaterArtifacts', config.bundle?.createUpdaterArtifacts === true),
    reportCheck('updater.pubkey', typeof updater?.pubkey === 'string' && updater.pubkey.length > 0),
    reportCheck(
      'updater.endpoints',
      Array.isArray(updater?.endpoints) && updater.endpoints.includes(UPDATER_ENDPOINT),
    ),
  ]
  return checks.every(Boolean)
}

async function verifyWorkflowSecrets() {
  const reusable = await readText(reusableWorkflowPath)
  const release = await readText(releaseWorkflowPath)
  const checks = REQUIRED_SECRETS.map(secret =>
    reportCheck(`workflow references ${secret}`, reusable.includes(secret)),
  )
  checks.push(reportCheck('release workflow inherits secrets', release.includes('secrets: inherit')))
  checks.push(reportCheck('release workflow generates latest.json', release.includes('generate-updater-manifest.mjs')))
  checks.push(reportCheck('release workflow uploads updater tag', release.includes('gh release upload updater')))
  return checks.every(Boolean)
}

async function verifyManifestPipeline() {
  const version = '9.9.9-verify'
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nrm-updater-verify-'))
  try {
    const windowsSetup = getWindowsSetupArtifactName(version)
    const macosArm = getMacUpdaterArchiveArtifactName(version, 'aarch64')
    await writeFile(path.join(dir, windowsSetup), 'asset', 'utf8')
    await writeFile(path.join(dir, getUpdaterSignatureArtifactName(windowsSetup)), 'windows-signature', 'utf8')
    await writeFile(path.join(dir, macosArm), 'asset', 'utf8')
    await writeFile(path.join(dir, getUpdaterSignatureArtifactName(macosArm)), 'macos-signature', 'utf8')

    const manifest = await buildUpdaterManifest({
      version,
      assetsDir: dir,
      repository: 'coderhsh/nrm-desktop',
      releaseTag: `v${version}`,
      notes: 'verify',
      pubDate: '2026-05-22T00:00:00.000Z',
      artifactOptions: {
        buildWindowsX64: true,
        buildMacosArm64: true,
        buildMacosX64: false,
        windowsSetupExe: true,
        windowsMsi: true,
        windowsPortableZip: true,
      },
    })

    return reportCheck(
      'manifest dry-run',
      manifest.version === version
        && manifest.platforms['windows-x86_64']?.signature === 'windows-signature'
        && manifest.platforms['darwin-aarch64']?.signature === 'macos-signature',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function verifyRemoteManifest() {
  try {
    const response = await fetch(UPDATER_ENDPOINT, { method: 'HEAD' })
    if (response.ok) {
      reportCheck('remote latest.json', true, `HTTP ${response.status}`)
      return true
    }
    reportCheck('remote latest.json', false, `HTTP ${response.status} (首次发版前预期为 404)`)
    return false
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    reportCheck('remote latest.json', false, detail)
    return false
  }
}

function printSecretsSetupGuide() {
  process.stdout.write('\n[verify-updater-setup] GitHub Secrets 一次性配置：\n')
  process.stdout.write('1. 生成密钥：pnpm tauri signer generate -w ~/.tauri/nrm-desktop.key\n')
  process.stdout.write('2. 查看公钥：pnpm tauri signer sign -w ~/.tauri/nrm-desktop.key --password <pwd> -p "" 2>/dev/null || pnpm tauri signer generate 文档中的 pubkey 输出\n')
  process.stdout.write('3. 在仓库 Settings → Secrets and variables → Actions 添加：\n')
  for (const secret of REQUIRED_SECRETS) {
    process.stdout.write(`   - ${secret}\n`)
  }
  process.stdout.write('4. 或使用 gh CLI：\n')
  process.stdout.write('   gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/nrm-desktop.key\n')
  process.stdout.write('   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD\n')
  process.stdout.write('   gh secret set TAURI_UPDATER_PUBKEY\n')
}

function printPrereleaseGuide() {
  process.stdout.write('\n[verify-updater-setup] 预发布联调步骤：\n')
  process.stdout.write('1. 合并 updater 改动并配置上述 Secrets\n')
  process.stdout.write('2. Actions → Release Installers → Run workflow\n')
  process.stdout.write('   - version: 新版本号（如 1.0.2）\n')
  process.stdout.write('   - draft_release: true（先验产物）\n')
  process.stdout.write('3. 确认 Release 含 setup.exe、.sig、.app.tar.gz、latest.json\n')
  process.stdout.write('4. 确认 updater Release 上的 latest.json 已更新\n')
  process.stdout.write('5. 用旧版正式安装包启动，验证静默检查、下载、安装重启\n')
}

async function main() {
  let ok = true
  ok = (await verifyTauriConfig()) && ok
  ok = (await verifyWorkflowSecrets()) && ok
  ok = (await verifyManifestPipeline()) && ok
  const remoteReady = await verifyRemoteManifest()

  const localSecrets = REQUIRED_SECRETS.filter(name => process.env[name]?.trim())
  if (localSecrets.length > 0) {
    reportCheck('local env secrets present', localSecrets.length === REQUIRED_SECRETS.length, localSecrets.join(', '))
  } else {
    process.stdout.write('[verify-updater-setup] INFO 未检测到本地签名环境变量（CI 使用 GitHub Secrets）。\n')
  }

  printSecretsSetupGuide()
  if (!remoteReady) {
    printPrereleaseGuide()
  }

  if (!ok) {
    process.exitCode = 1
    process.stderr.write('[verify-updater-setup] 本地配置校验未通过。\n')
    return
  }

  process.stdout.write('[verify-updater-setup] 本地 updater 配置与 manifest 流水线校验通过。\n')
  if (!remoteReady) {
    process.stdout.write('[verify-updater-setup] 远程 latest.json 尚未发布，需完成 Secrets 配置后跑一次 Release Installers。\n')
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
