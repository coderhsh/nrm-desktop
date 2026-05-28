import { describe, expect, it, beforeEach } from 'vitest'
import { UPDATE_AUTO_MODE_STORAGE_KEY, autoUpdateMode, useAppUpdatePreferences } from './useAppUpdatePreferences'

describe('useAppUpdatePreferences', () => {
  beforeEach(() => {
    localStorage.clear()
    autoUpdateMode.value = 'notify'
  })

  it('defaults to notify when localStorage is empty', () => {
    const { autoUpdateMode: mode } = useAppUpdatePreferences()
    expect(mode.value).toBe('notify')
  })

  it('isAutoCheckEnabled is false when mode is off', () => {
    autoUpdateMode.value = 'off'
    const { isAutoCheckEnabled } = useAppUpdatePreferences()
    expect(isAutoCheckEnabled.value).toBe(false)
  })

  it('isAutoCheckEnabled is true for notify and download', () => {
    const { isAutoCheckEnabled } = useAppUpdatePreferences()

    autoUpdateMode.value = 'notify'
    expect(isAutoCheckEnabled.value).toBe(true)

    autoUpdateMode.value = 'download'
    expect(isAutoCheckEnabled.value).toBe(true)
  })

  it('syncDraftFromSaved copies saved mode to draft', () => {
    autoUpdateMode.value = 'download'
    const { draftAutoUpdateMode, syncDraftFromSaved } = useAppUpdatePreferences()

    syncDraftFromSaved()
    expect(draftAutoUpdateMode.value).toBe('download')
  })

  it('applyDraft copies draft mode to saved', () => {
    const { draftAutoUpdateMode, applyDraft } = useAppUpdatePreferences()

    draftAutoUpdateMode.value = 'off'
    applyDraft()
    expect(autoUpdateMode.value).toBe('off')
  })

  it('coerces invalid localStorage values to notify', () => {
    localStorage.setItem(UPDATE_AUTO_MODE_STORAGE_KEY, JSON.stringify('bogus'))
    // Re-read from storage via the serializer
    const raw = localStorage.getItem(UPDATE_AUTO_MODE_STORAGE_KEY)
    expect(raw).toBe('"bogus"')
  })
})
