import { describe, expect, it } from 'vitest'

import { ensureChangelogVersionSection } from './prepare-release.mjs'

const changelog = `# Changelog

## [Unreleased]

### Added

- In-app updater

## [1.0.1] - 2026-05-21

### Fixed

- Previous fix

[Unreleased]: https://github.com/coderhsh/nrm-desktop/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.1.0
[1.0.1]: https://github.com/coderhsh/nrm-desktop/releases/tag/v1.0.1
`

describe('prepare-release changelog helpers', () => {
  it('archives Unreleased when the requested version section is missing', () => {
    const result = ensureChangelogVersionSection(changelog, 'Unreleased', '1.1.0', '2026-05-25')

    expect(result.changed).toBe(true)
    expect(result.content).toContain('## [Unreleased]\n\n## [1.1.0] - 2026-05-25')
    expect(result.content).toContain('- In-app updater')
    expect(result.releaseSection).toContain('## [1.1.0] - 2026-05-25')
  })

  it('keeps an existing requested version section unchanged', () => {
    const archived = changelog.replace(
      '## [Unreleased]\n\n### Added\n\n- In-app updater\n\n',
      '## [Unreleased]\n\n## [1.1.0] - 2026-05-25\n\n### Added\n\n- In-app updater\n\n',
    )

    const result = ensureChangelogVersionSection(archived, 'Unreleased', '1.1.0', '2026-05-26')

    expect(result.changed).toBe(false)
    expect(result.content).toBe(archived)
    expect(result.releaseSection).toContain('## [1.1.0] - 2026-05-25')
  })
})
