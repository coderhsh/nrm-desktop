import { describe, expect, it } from 'vitest'

import {
  formatFetchErrorDetail,
  hasUpdaterManifestPublishPipeline,
} from './verify-updater-setup.mjs'

describe('verify-updater-setup helpers', () => {
  const releaseWorkflow = `
    - name: Generate and publish updater manifest
      run: |
        node ./scripts/generate-updater-manifest.mjs
        node ./scripts/publish-updater-manifest.mjs --manifest-file release-assets/latest.json
  `

  const publishScript = `
    export const UPDATER_RELEASE_TAG = 'updater'
    runCommand('gh', [
      'release', 'upload', UPDATER_RELEASE_TAG,
      '--repo', repository,
      manifestFile,
      '--clobber',
    ])
  `

  it('accepts the current workflow and publish script as the updater publish pipeline', () => {
    expect(hasUpdaterManifestPublishPipeline(releaseWorkflow, publishScript)).toBe(true)
  })

  it('rejects workflows that generate latest.json but never call the publish script', () => {
    const workflow = `
      - name: Generate updater manifest
        run: node ./scripts/generate-updater-manifest.mjs
    `

    expect(hasUpdaterManifestPublishPipeline(workflow, publishScript)).toBe(false)
  })

  it('formats fetch failures with nested cause diagnostics', () => {
    const error = new Error('fetch failed', {
      cause: {
        code: 'ENOTFOUND',
        hostname: 'github.com',
      },
    })

    expect(formatFetchErrorDetail(error)).toBe('fetch failed; code=ENOTFOUND; hostname=github.com')
  })
})
