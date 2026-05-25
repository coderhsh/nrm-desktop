import { afterEach, describe, expect, it } from 'vitest'

import { clearProjectMetaCache, getProjectMeta } from './project-meta.mjs'

describe('getProjectMeta', () => {
  afterEach(() => {
    clearProjectMetaCache()
  })

  it('reads metadata from package.json, tauri.conf.json, and Cargo.toml', () => {
    expect(getProjectMeta()).toEqual({
      appSlug: 'nrm-desktop',
      productName: 'nrm-desktop',
      binaryName: 'nrm-desktop',
      tauriDir: 'src-tauri',
      frontendDist: 'dist',
    })
  })

  it('caches results across calls', () => {
    const first = getProjectMeta()
    const second = getProjectMeta()
    expect(second).toBe(first)
  })

  it('reloads when refresh is true', () => {
    const first = getProjectMeta()
    const second = getProjectMeta({ refresh: true })
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
})
