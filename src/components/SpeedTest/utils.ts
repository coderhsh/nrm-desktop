import type { LatencyResult } from '@/api/speedtest'

const maxStaggerIndex = 24
const rowStaggerStepMs = 18
const barStaggerBaseMs = 32
const barStaggerStepMs = 14

/** 与后端 `test_all`、单次重测一致：成功项按延迟升序，失败置底 */
export function sortLatencyResults(items: LatencyResult[]): LatencyResult[] {
  return [...items].sort((a, b) => {
    if (a.latency_ms !== null && b.latency_ms !== null) {
      return a.latency_ms - b.latency_ms
    }
    if (a.latency_ms !== null) return -1
    if (b.latency_ms !== null) return 1
    return a.name.localeCompare(b.name)
  })
}

export function getSpeedResultRowStaggerMs(index: number): number {
  return boundedStaggerIndex(index) * rowStaggerStepMs
}

export function getSpeedResultBarStaggerMs(index: number): number {
  return barStaggerBaseMs + boundedStaggerIndex(index) * barStaggerStepMs
}

function boundedStaggerIndex(index: number): number {
  return Math.min(Math.max(0, index), maxStaggerIndex)
}
