#!/usr/bin/env node
/* @desc 记录 GitHub Actions 核心阶段耗时并输出 Step Summary 表格。 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

/**
 * @param {number} durationMs
 * @returns {string}
 */
export function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }
  return `${seconds}s`
}

/**
 * @returns {string}
 */
function resolveTimingFile() {
  return process.env.CI_TIMING_FILE
    || path.join(process.env.RUNNER_TEMP || rootDir, 'nrm-desktop-ci-timing.json')
}

/**
 * @param {string} timingFile
 * @returns {{ version: 1, records: Array<{ id: string, label: string, startedAt: string, endedAt?: string, status: string, durationMs?: number }> }}
 */
function readState(timingFile) {
  try {
    const raw = readFileSync(timingFile, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.records)) {
      return parsed
    }
  } catch {
    // Missing or malformed timing state should not break the build.
  }
  return { version: 1, records: [] }
}

/**
 * @param {string} timingFile
 * @param {{ version: 1, records: Array<{ id: string, label: string, startedAt: string, endedAt?: string, status: string, durationMs?: number }> }} state
 */
function writeState(timingFile, state) {
  mkdirSync(path.dirname(timingFile), { recursive: true })
  writeFileSync(timingFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/**
 * @param {string} id
 * @param {string} label
 * @param {{ timingFile?: string, now?: Date }} [options]
 */
export function startTiming(id, label, options = {}) {
  const timingFile = options.timingFile || resolveTimingFile()
  const state = readState(timingFile)
  const startedAt = (options.now || new Date()).toISOString()
  const existing = state.records.find(record => record.id === id)

  if (existing) {
    existing.label = label
    existing.startedAt = startedAt
    existing.status = 'running'
    delete existing.endedAt
    delete existing.durationMs
  } else {
    state.records.push({
      id,
      label,
      startedAt,
      status: 'running',
    })
  }

  writeState(timingFile, state)
}

/**
 * @param {string} id
 * @param {string} status
 * @param {{ timingFile?: string, now?: Date }} [options]
 */
export function endTiming(id, status = 'success', options = {}) {
  const timingFile = options.timingFile || resolveTimingFile()
  const state = readState(timingFile)
  const endedAtDate = options.now || new Date()
  const endedAt = endedAtDate.toISOString()
  const record = state.records.find(item => item.id === id)

  if (!record) {
    return
  }

  const startedAtMs = Date.parse(record.startedAt)
  const durationMs = Number.isFinite(startedAtMs)
    ? Math.max(0, endedAtDate.getTime() - startedAtMs)
    : 0

  record.endedAt = endedAt
  record.durationMs = durationMs
  record.status = normalizeStatus(status)

  writeState(timingFile, state)
}

/**
 * @param {string} status
 * @returns {string}
 */
function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (['success', 'failure', 'cancelled', 'skipped'].includes(normalized)) {
    return normalized
  }
  return normalized || 'success'
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/**
 * @param {string} title
 * @param {{ timingFile?: string }} [options]
 * @returns {string}
 */
export function renderTimingSummary(title, options = {}) {
  const timingFile = options.timingFile || resolveTimingFile()
  const state = readState(timingFile)
  const rows = state.records.map(record => {
    const duration = typeof record.durationMs === 'number'
      ? formatDuration(record.durationMs)
      : '未结束'
    return `| ${escapeMarkdownCell(record.label)} | ${escapeMarkdownCell(record.status)} | ${duration} |`
  })

  return [
    `### ${title}`,
    '',
    '| 阶段 | 状态 | 耗时 |',
    '| --- | --- | ---: |',
    ...(rows.length > 0 ? rows : ['| 无记录 | skipped | 0s |']),
    '',
  ].join('\n')
}

/**
 * @param {string} title
 * @param {{ timingFile?: string, summaryFile?: string }} [options]
 */
export function writeTimingSummary(title, options = {}) {
  const summaryFile = options.summaryFile || process.env.GITHUB_STEP_SUMMARY
  if (!summaryFile) {
    process.stdout.write(renderTimingSummary(title, options))
    return
  }
  mkdirSync(path.dirname(summaryFile), { recursive: true })
  appendFileSync(summaryFile, renderTimingSummary(title, options), 'utf8')
}

/**
 * @param {string} id
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 * @param {{ timingFile?: string }} [options]
 * @returns {number}
 */
export function runTimedCommand(id, label, command, args, options = {}) {
  startTiming(id, label, options)
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (result.error) {
    process.stderr.write(`[ci-timing] 无法执行 ${command}: ${result.error.message}\n`)
  }

  const exitCode = typeof result.status === 'number'
    ? result.status
    : 1
  endTiming(id, exitCode === 0 ? 'success' : 'failure', options)
  return exitCode
}

function printUsage() {
  process.stderr.write(`Usage:
  node ./scripts/ci-timing.mjs start <id> <label>
  node ./scripts/ci-timing.mjs end <id> [status]
  node ./scripts/ci-timing.mjs run <id> <label> -- <command...>
  node ./scripts/ci-timing.mjs summary <title>
`)
}

function main() {
  const [command, ...args] = process.argv.slice(2)

  if (command === 'start') {
    const [id, label] = args
    if (!id || !label) {
      printUsage()
      process.exit(2)
    }
    startTiming(id, label)
    return
  }

  if (command === 'end') {
    const [id, status = 'success'] = args
    if (!id) {
      printUsage()
      process.exit(2)
    }
    endTiming(id, status)
    return
  }

  if (command === 'run') {
    const separatorIndex = args.indexOf('--')
    const id = args[0]
    const label = args[1]
    if (!id || !label || separatorIndex === -1 || separatorIndex + 1 >= args.length) {
      printUsage()
      process.exit(2)
    }
    const runCommand = args[separatorIndex + 1]
    const runArgs = args.slice(separatorIndex + 2)
    process.exit(runTimedCommand(id, label, runCommand, runArgs))
  }

  if (command === 'summary') {
    const title = args.join(' ').trim()
    if (!title) {
      printUsage()
      process.exit(2)
    }
    writeTimingSummary(title)
    return
  }

  printUsage()
  process.exit(2)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)

if (invokedDirectly) {
  main()
}
