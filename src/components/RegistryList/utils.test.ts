import { describe, expect, it } from 'vitest'
import { sortRegistriesInCategory } from '@/components/RegistryList/utils'
import type { Registry } from '@/types'
import type { LatencyResult } from '@/api/speedtest'

const registries: Registry[] = [
  { name: 'beta', url: 'https://beta.test' },
  { name: 'alpha', url: 'https://alpha.test' },
  { name: 'gamma', url: 'https://gamma.test' },
]

const latencyByName: Record<string, LatencyResult> = {
  alpha: { name: 'alpha', url: 'https://alpha.test', latency_ms: 120, error: null },
  beta: { name: 'beta', url: 'https://beta.test', latency_ms: 40, error: null },
  gamma: { name: 'gamma', url: 'https://gamma.test', latency_ms: null, error: 'timeout' },
}

describe('sortRegistriesInCategory', () => {
  it('sorts by name', () => {
    expect(sortRegistriesInCategory(registries, 'name', latencyByName).map(r => r.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
  })

  it('sorts by speed and keeps unknown results last', () => {
    expect(sortRegistriesInCategory(registries, 'speed', latencyByName).map(r => r.name)).toEqual([
      'beta',
      'alpha',
      'gamma',
    ])
  })
})
