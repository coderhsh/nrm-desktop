import { describe, expect, it } from 'vitest'
import type { LatencyResult } from '@/api/speedtest'
import { getSpeedResultBarStaggerMs, getSpeedResultRowStaggerMs, sortLatencyResults } from '@/components/SpeedTest/utils'

const results: LatencyResult[] = [
  { name: 'failed-b', url: 'https://failed-b.test', latency_ms: null, error: 'timeout' },
  { name: 'slow', url: 'https://slow.test', latency_ms: 900, error: null },
  { name: 'fast', url: 'https://fast.test', latency_ms: 80, error: null },
  { name: 'failed-a', url: 'https://failed-a.test', latency_ms: null, error: 'connect' },
]

describe('SpeedTest utils', () => {
  it('sorts successful latency results first and failed results by name', () => {
    expect(sortLatencyResults(results).map(item => item.name)).toEqual([
      'fast',
      'slow',
      'failed-a',
      'failed-b',
    ])
  })

  it('caps stagger delays for long result lists', () => {
    expect(getSpeedResultRowStaggerMs(2)).toBe(36)
    expect(getSpeedResultRowStaggerMs(120)).toBe(getSpeedResultRowStaggerMs(24))
    expect(getSpeedResultBarStaggerMs(120)).toBe(getSpeedResultBarStaggerMs(24))
  })
})
