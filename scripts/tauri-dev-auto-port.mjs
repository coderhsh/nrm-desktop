/*  @desc 解决「端口冲突」+「保证 dev 时前后端端口一致」+「避免双托盘」，并在退出时清理临时配置。 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { syncAppVersionFromPackageJson } from './sync-app-version.mjs'
import { spawnPnpm } from './spawn-pnpm.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
const tempConfigPath = path.join(rootDir, 'src-tauri', 'tauri.dev.auto-port.json')
const basePort = 1420
const maxAttempts = 30

/**
 * Run a command and capture stdout/stderr.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ error: NodeJS.ErrnoException | null, stdout: string, stderr: string, exitCode: number | null }>}
 */
function runCommandCapture(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    /** @type {string} */
    let stdout = ''
    /** @type {string} */
    let stderr = ''

    child.stdout?.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', error => resolve({ error, stdout, stderr, exitCode: null }))
    child.on('close', exitCode => resolve({ error: null, stdout, stderr, exitCode: exitCode ?? 1 }))
  })
}

/**
 * Ensure Rust toolchain is usable before invoking tauri dev.
 * @returns {Promise<void>}
 */
async function ensureRustToolchain() {
  const rustc = await runCommandCapture('rustc', ['--version'])
  if (rustc.error || rustc.exitCode !== 0) {
    const detail = (rustc.stderr || rustc.stdout || rustc.error?.message || 'unknown error').trim()
    throw new Error(
      'Rust 工具链不可用，无法启动 Tauri dev。\n'
      + '请先修复 Rust 安装（https://rustup.rs/），例如：\n'
      + '  rustup toolchain install 1.88.0 --profile minimal\n'
      + `详情: ${detail}`,
    )
  }
}

/**
 * Check whether a TCP port is available on localhost.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer()

    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, '127.0.0.1')
  })
}

/**
 * Find next available port from base value.
 * @param {number} startPort
 * @param {number} attempts
 * @returns {Promise<number>}
 */
async function findAvailablePort(startPort, attempts) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = startPort + offset
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port
    }
  }

  throw new Error(`未找到可用端口，已尝试 ${startPort} - ${startPort + attempts - 1}`)
}

/**
 * Create temporary tauri dev config with dynamic port.
 * beforeDevCommand 必须使用 ui:dev（Vite），不可使用 pnpm dev，否则会再次进入本脚本导致 tauri dev 死循环。
 * @param {number} port
 * @returns {Promise<void>}
 */
async function writeTempConfig(port) {
  const raw = await fs.readFile(tauriConfigPath, 'utf8')
  const config = JSON.parse(raw)

  config.build = {
    ...config.build,
    devUrl: `http://localhost:${port}`,
    beforeDevCommand: `pnpm ui:dev -- --port ${port} --strictPort`,
  }

  // Always use Rust side TrayIconBuilder to avoid duplicate tray icons.
  if (config.app?.trayIcon) {
    delete config.app.trayIcon
  }

  await fs.writeFile(tempConfigPath, JSON.stringify(config, null, 2), 'utf8')
}

/**
 * Remove temporary config file.
 * @returns {Promise<void>}
 */
async function cleanupTempConfig() {
  try {
    await fs.unlink(tempConfigPath)
  } catch {
    // Ignore missing file cleanup errors.
  }
}

async function main() {
  await ensureRustToolchain()
  syncAppVersionFromPackageJson()
  const port = await findAvailablePort(basePort, maxAttempts)
  await writeTempConfig(port)

  process.stdout.write(`\n[tauri-dev] 使用端口: ${port}\n`)

  const child = spawnPnpm(['tauri', 'dev', '--config', tempConfigPath], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })

  const handleSignal = signal => {
    if (!child.killed) {
      child.kill(signal)
    }
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)

  child.on('exit', async (code, signal) => {
    await cleanupTempConfig()
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main().catch(async error => {
  await cleanupTempConfig()
  process.stderr.write(`[tauri-dev] 启动失败: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
