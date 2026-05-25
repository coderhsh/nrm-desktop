import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { formatDuration } from './ci-timing.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const scriptPath = path.join(__dirname, 'ci-timing.mjs')

function createTempPaths() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nrm-ci-timing-'))
  return {
    timingFile: path.join(directory, 'timing.json'),
    summaryFile: path.join(directory, 'summary.md'),
  }
}

function runTimingCli(args, paths) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CI_TIMING_FILE: paths.timingFile,
      GITHUB_STEP_SUMMARY: paths.summaryFile,
    },
  })
}

describe('ci-timing', () => {
  it('formats durations for GitHub Step Summary', () => {
    expect(formatDuration(27_000)).toBe('27s')
    expect(formatDuration(129_000)).toBe('2m 09s')
    expect(formatDuration(3_792_000)).toBe('1h 03m 12s')
  })

  it('records a successful wrapped command and renders a summary table', () => {
    const paths = createTempPaths()

    const result = runTimingCli([
      'run',
      'frontend_build',
      '前端构建',
      '--',
      process.execPath,
      '-e',
      'process.exit(0)',
    ], paths)

    expect(result.status).toBe(0)

    const summaryResult = runTimingCli(['summary', 'Build frontend 耗时'], paths)
    expect(summaryResult.status).toBe(0)

    const summary = readFileSync(paths.summaryFile, 'utf8')
    expect(summary).toContain('### Build frontend 耗时')
    expect(summary).toContain('| 阶段 | 状态 | 耗时 |')
    expect(summary).toContain('| 前端构建 | success |')
  })

  it('records a failed wrapped command before returning the command exit code', () => {
    const paths = createTempPaths()

    const result = runTimingCli([
      'run',
      'tauri_build',
      'Tauri 构建/打包',
      '--',
      process.execPath,
      '-e',
      'process.exit(7)',
    ], paths)

    expect(result.status).toBe(7)

    const summaryResult = runTimingCli(['summary', 'Build Windows x64 耗时'], paths)
    expect(summaryResult.status).toBe(0)

    const summary = readFileSync(paths.summaryFile, 'utf8')
    expect(summary).toContain('| Tauri 构建/打包 | failure |')
  })
})
