import { describe, expect, it } from 'vitest'

import {
  extractDownloadSlug,
  resolveDownloadSlugFromReleaseData,
} from './resolve-release-download-slug.mjs'

describe('resolveDownloadSlugFromReleaseData', () => {
  it('extracts slug from draft release asset URLs', () => {
    const slug = resolveDownloadSlugFromReleaseData({
      tagName: 'v1.1.0',
      isDraft: true,
      assets: [
        {
          url: 'https://github.com/coderhsh/nrm-desktop/releases/download/untagged-abc123/nrm-desktop_1.1.0_windows_x64-setup.exe',
        },
      ],
    }, 'v1.1.0')

    expect(slug).toBe('untagged-abc123')
  })

  it('extracts slug from published release browser_download_url', () => {
    const slug = resolveDownloadSlugFromReleaseData({
      tag_name: 'v1.1.0',
      draft: false,
      assets: [
        {
          browser_download_url: 'https://github.com/coderhsh/nrm-desktop/releases/download/v1.1.0/nrm-desktop_1.1.0_macos_aarch64.dmg',
        },
      ],
    }, 'v1.1.0')

    expect(slug).toBe('v1.1.0')
  })

  it('falls back to tag name for published releases without parseable asset URLs', () => {
    const slug = resolveDownloadSlugFromReleaseData({
      tagName: 'v1.1.0',
      isDraft: false,
      assets: [{ name: 'placeholder.txt' }],
    }, 'v1.1.0')

    expect(slug).toBe('v1.1.0')
  })
})

describe('extractDownloadSlug', () => {
  it('throws when URL does not contain a download slug', () => {
    expect(() => extractDownloadSlug('https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.0'))
      .toThrow('无法从 URL 解析 slug')
  })
})
