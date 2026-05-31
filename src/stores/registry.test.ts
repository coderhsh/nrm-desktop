import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  getRegistries: vi.fn(),
  getCurrentRegistry: vi.fn(),
  setRegistry: vi.fn(),
  addRegistry: vi.fn(),
  deleteRegistry: vi.fn(),
  deleteRegistriesBulk: vi.fn(),
  updateRegistry: vi.fn(),
}))

vi.mock('@/api/tauri', () => ({
  getRegistries: mocks.getRegistries,
  getCurrentRegistry: mocks.getCurrentRegistry,
  setRegistry: mocks.setRegistry,
  addRegistry: mocks.addRegistry,
  deleteRegistry: mocks.deleteRegistry,
  deleteRegistriesBulk: mocks.deleteRegistriesBulk,
  updateRegistry: mocks.updateRegistry,
}))

vi.mock('@/api/speedtest', () => ({
  testAllSpeed: vi.fn(async () => []),
  testSingleSpeed: vi.fn(async () => ({ name: 'test', url: 'https://example.com', latency_ms: 100, error: null })),
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

vi.stubGlobal('ElMessage', {
  success: vi.fn(),
  error: vi.fn(),
})

import { useRegistryStore } from './registry'

describe('useRegistryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('has correct initial state', () => {
    const store = useRegistryStore()
    expect(store.registries).toEqual([])
    expect(store.currentRegistry).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.searchQuery).toBe('')
    expect(store.latencyResults).toEqual({})
    expect(store.latencyLoading).toBe(false)
  })

  describe('fetchRegistries', () => {
    it('loads registries and current registry', async () => {
      const regs = [
        { name: 'npm', url: 'https://registry.npmjs.org/' },
        { name: 'taobao', url: 'https://registry.npmmirror.com/' },
      ]
      mocks.getRegistries.mockResolvedValue(regs)
      mocks.getCurrentRegistry.mockResolvedValue(regs[0])

      const store = useRegistryStore()
      await store.fetchRegistries()

      expect(store.registries).toEqual(regs)
      expect(store.currentRegistry).toEqual(regs[0])
      expect(store.loading).toBe(false)
    })

    it('shows error on failure', async () => {
      mocks.getRegistries.mockRejectedValue(new Error('fail'))

      const store = useRegistryStore()
      await store.fetchRegistries()

      expect(store.registries).toEqual([])
      expect(ElMessage.error).toHaveBeenCalled()
    })
  })

  describe('switchRegistry', () => {
    it('calls API and updates currentRegistry', async () => {
      mocks.setRegistry.mockResolvedValue(undefined)

      const store = useRegistryStore()
      store.registries = [
        { name: 'npm', url: 'https://registry.npmjs.org/' },
        { name: 'taobao', url: 'https://registry.npmmirror.com/' },
      ]

      await store.switchRegistry('taobao')

      expect(mocks.setRegistry).toHaveBeenCalledWith('taobao')
      expect(store.currentRegistry).toEqual({ name: 'taobao', url: 'https://registry.npmmirror.com/' })
    })

    it('shows error on failure', async () => {
      mocks.setRegistry.mockRejectedValue(new Error('fail'))

      const store = useRegistryStore()
      store.registries = [{ name: 'npm', url: 'https://registry.npmjs.org/' }]
      await store.switchRegistry('npm')

      expect(ElMessage.error).toHaveBeenCalled()
    })
  })

  describe('addRegistry', () => {
    it('calls API and appends to registries', async () => {
      mocks.addRegistry.mockResolvedValue(undefined)

      const store = useRegistryStore()
      await store.addRegistry('custom', 'https://custom.registry/')

      expect(mocks.addRegistry).toHaveBeenCalledWith('custom', 'https://custom.registry/')
      expect(store.registries).toContainEqual({ name: 'custom', url: 'https://custom.registry/' })
    })

    it('shows error and rethrows on failure', async () => {
      mocks.addRegistry.mockRejectedValue(new Error('dup'))

      const store = useRegistryStore()
      await expect(store.addRegistry('dup', 'https://dup/')).rejects.toThrow('dup')
      expect(ElMessage.error).toHaveBeenCalled()
    })
  })

  describe('deleteRegistry', () => {
    it('removes registry from list and syncs current', async () => {
      mocks.deleteRegistry.mockResolvedValue(undefined)
      mocks.getCurrentRegistry.mockResolvedValue({ name: 'taobao', url: 'https://registry.npmmirror.com/' })

      const store = useRegistryStore()
      store.registries = [
        { name: 'npm', url: 'https://registry.npmjs.org/' },
        { name: 'taobao', url: 'https://registry.npmmirror.com/' },
      ]
      store.currentRegistry = { name: 'npm', url: 'https://registry.npmjs.org/' }

      await store.deleteRegistry('npm')

      expect(store.registries).toEqual([{ name: 'taobao', url: 'https://registry.npmmirror.com/' }])
      expect(store.currentRegistry).toEqual({ name: 'taobao', url: 'https://registry.npmmirror.com/' })
      expect(ElMessage.success).toHaveBeenCalled()
    })

    it('shows error and rethrows on failure', async () => {
      mocks.deleteRegistry.mockRejectedValue(new Error('fail'))

      const store = useRegistryStore()
      store.registries = [{ name: 'npm', url: 'https://registry.npmjs.org/' }]

      await expect(store.deleteRegistry('npm')).rejects.toThrow()
      expect(ElMessage.error).toHaveBeenCalled()
    })

    it('suppresses success message when silent', async () => {
      mocks.deleteRegistry.mockResolvedValue(undefined)
      mocks.getCurrentRegistry.mockResolvedValue(null)

      const store = useRegistryStore()
      store.registries = [{ name: 'npm', url: 'https://registry.npmjs.org/' }]

      await store.deleteRegistry('npm', { silent: true })

      expect(ElMessage.success).not.toHaveBeenCalled()
    })
  })

  describe('deleteRegistriesBulk', () => {
    it('removes multiple registries and cleans latency', async () => {
      mocks.deleteRegistriesBulk.mockResolvedValue(undefined)
      mocks.getCurrentRegistry.mockResolvedValue({ name: 'c', url: 'https://c/' })

      const store = useRegistryStore()
      store.registries = [
        { name: 'a', url: 'https://a/' },
        { name: 'b', url: 'https://b/' },
        { name: 'c', url: 'https://c/' },
      ]
      store.latencyResults = {
        a: { name: 'a', url: 'https://a/', latency_ms: 100, error: null },
        b: { name: 'b', url: 'https://b/', latency_ms: 200, error: null },
        c: { name: 'c', url: 'https://c/', latency_ms: 300, error: null },
      }

      await store.deleteRegistriesBulk(['a', 'b'])

      expect(mocks.deleteRegistriesBulk).toHaveBeenCalledWith(['a', 'b'])
      expect(store.registries).toEqual([{ name: 'c', url: 'https://c/' }])
      expect(store.latencyResults).toEqual({ c: { name: 'c', url: 'https://c/', latency_ms: 300, error: null } })
    })

    it('does nothing for empty input', async () => {
      const store = useRegistryStore()
      await store.deleteRegistriesBulk([])
      expect(mocks.deleteRegistriesBulk).not.toHaveBeenCalled()
    })
  })

  describe('updateRegistry', () => {
    it('updates name and url in registries list', async () => {
      mocks.updateRegistry.mockResolvedValue(undefined)

      const store = useRegistryStore()
      store.registries = [{ name: 'old', url: 'https://old/' }]
      store.currentRegistry = { name: 'old', url: 'https://old/' }

      await store.updateRegistry('old', 'new', 'https://new/')

      expect(store.registries[0]).toEqual({ name: 'new', url: 'https://new/' })
      expect(store.currentRegistry).toEqual({ name: 'new', url: 'https://new/' })
    })

    it('migrates latency results when name changes', async () => {
      mocks.updateRegistry.mockResolvedValue(undefined)

      const store = useRegistryStore()
      store.registries = [{ name: 'old', url: 'https://old/' }]
      store.latencyResults = {
        old: { name: 'old', url: 'https://old/', latency_ms: 150, error: null },
      }

      await store.updateRegistry('old', 'new', 'https://new/')

      expect(store.latencyResults.old).toBeUndefined()
      expect(store.latencyResults.new).toEqual({ name: 'new', url: 'https://new/', latency_ms: 150, error: null })
    })

    it('shows error and rethrows on failure', async () => {
      mocks.updateRegistry.mockRejectedValue(new Error('fail'))

      const store = useRegistryStore()
      store.registries = [{ name: 'old', url: 'https://old/' }]

      await expect(store.updateRegistry('old', 'new', 'https://new/')).rejects.toThrow()
      expect(ElMessage.error).toHaveBeenCalled()
    })
  })

  describe('setSingleLatencyResult', () => {
    it('upserts a single latency result', () => {
      const store = useRegistryStore()
      store.latencyResults = { a: { name: 'a', url: 'https://a/', latency_ms: 100, error: null } }

      store.setSingleLatencyResult({ name: 'b', url: 'https://b/', latency_ms: 200, error: null })

      expect(store.latencyResults.a.latency_ms).toBe(100)
      expect(store.latencyResults.b.latency_ms).toBe(200)
    })
  })

  describe('setLatencyResults', () => {
    it('replaces all latency results', () => {
      const store = useRegistryStore()
      store.latencyResults = { old: { name: 'old', url: '', latency_ms: 999, error: null } }

      store.setLatencyResults([
        { name: 'a', url: 'https://a/', latency_ms: 50, error: null },
        { name: 'b', url: 'https://b/', latency_ms: 150, error: null },
      ])

      expect(store.latencyResults.old).toBeUndefined()
      expect(store.latencyResults.a.latency_ms).toBe(50)
      expect(store.latencyResults.b.latency_ms).toBe(150)
    })
  })

  describe('filteredRegistries', () => {
    it('returns all when search is empty', () => {
      const store = useRegistryStore()
      store.registries = [
        { name: 'npm', url: 'https://registry.npmjs.org/' },
        { name: 'taobao', url: 'https://registry.npmmirror.com/' },
      ]
      store.searchQuery = ''

      expect(store.filteredRegistries).toHaveLength(2)
    })

    it('filters by name', () => {
      const store = useRegistryStore()
      store.registries = [
        { name: 'npm', url: 'https://registry.npmjs.org/' },
        { name: 'taobao', url: 'https://registry.npmmirror.com/' },
      ]
      store.searchQuery = 'taobao'

      expect(store.filteredRegistries).toEqual([{ name: 'taobao', url: 'https://registry.npmmirror.com/' }])
    })

    it('filters by url', () => {
      const store = useRegistryStore()
      store.registries = [
        { name: 'npm', url: 'https://registry.npmjs.org/' },
        { name: 'taobao', url: 'https://registry.npmmirror.com/' },
      ]
      store.searchQuery = 'npmmirror'

      expect(store.filteredRegistries).toEqual([{ name: 'taobao', url: 'https://registry.npmmirror.com/' }])
    })
  })

  describe('getLatencyClass / getLatencyMs', () => {
    it('returns correct class for latency ranges', () => {
      const store = useRegistryStore()
      store.latencyResults = {
        fast: { name: 'fast', url: '', latency_ms: 50, error: null },
        medium: { name: 'medium', url: '', latency_ms: 500, error: null },
        slow: { name: 'slow', url: '', latency_ms: 2000, error: null },
      }

      expect(store.getLatencyClass('fast')).toBe('latency-fast')
      expect(store.getLatencyClass('medium')).toBe('latency-medium')
      expect(store.getLatencyClass('slow')).toBe('latency-slow')
      expect(store.getLatencyClass('missing')).toBe('')
    })

    it('returns correct ms value', () => {
      const store = useRegistryStore()
      store.latencyResults = {
        a: { name: 'a', url: '', latency_ms: 123, error: null },
      }

      expect(store.getLatencyMs('a')).toBe(123)
      expect(store.getLatencyMs('missing')).toBeNull()
    })
  })

  describe('syncCurrentRegistryByName', () => {
    it('sets currentRegistry from cached registries', () => {
      const store = useRegistryStore()
      store.registries = [
        { name: 'npm', url: 'https://registry.npmjs.org/' },
        { name: 'taobao', url: 'https://registry.npmmirror.com/' },
      ]

      store.syncCurrentRegistryByName('taobao')
      expect(store.currentRegistry).toEqual({ name: 'taobao', url: 'https://registry.npmmirror.com/' })
    })

    it('sets null when name not found', () => {
      const store = useRegistryStore()
      store.registries = [{ name: 'npm', url: 'https://registry.npmjs.org/' }]
      store.currentRegistry = { name: 'npm', url: 'https://registry.npmjs.org/' }

      store.syncCurrentRegistryByName('nonexistent')
      expect(store.currentRegistry).toBeNull()
    })
  })
})
