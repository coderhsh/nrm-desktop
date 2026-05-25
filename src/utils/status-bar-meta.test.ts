import { describe, expect, it } from 'vitest'
import {
  buildStatusBarMetaTitle,
  hasStatusBarMeta,
  resolveStatusBarMetaParts,
} from './status-bar-meta'

describe('resolveStatusBarMetaParts', () => {
  it('passes through available fields', () => {
    expect(
      resolveStatusBarMetaParts({
        node: 'v22.12.0',
        npm: '10.9.0',
        appName: 'nrm-desktop',
        appVersion: '1.1.8',
      }),
    ).toEqual({
      appName: 'nrm-desktop',
      appVersion: '1.1.8',
      nodeVersion: 'v22.12.0',
      npmVersion: '10.9.0',
    })
  })
})

describe('hasStatusBarMeta', () => {
  it('returns true when app or env info exists', () => {
    expect(hasStatusBarMeta({ appName: 'nrm-desktop', appVersion: '1.1.8', nodeVersion: null, npmVersion: null })).toBe(true)
    expect(hasStatusBarMeta({ appName: null, appVersion: null, nodeVersion: 'v22.12.0', npmVersion: null })).toBe(true)
    expect(hasStatusBarMeta({ appName: null, appVersion: null, nodeVersion: null, npmVersion: null })).toBe(false)
  })
})

describe('buildStatusBarMetaTitle', () => {
  const t = (key: string, params: Record<string, string>) => {
    if (key === 'app.appVersionShort') {
      return `${params.appName} v${params.version}`
    }
    return `Node ${params.nodeVersion} · npm ${params.npmVersion}`
  }

  it('joins app and env segments for tooltip text', () => {
    expect(
      buildStatusBarMetaTitle(
        {
          appName: 'nrm-desktop',
          appVersion: '1.1.8',
          nodeVersion: 'v22.12.0',
          npmVersion: '10.9.0',
        },
        t,
      ),
    ).toBe('nrm-desktop v1.1.8 · Node v22.12.0 · npm 10.9.0')
  })
})
