import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './renderMarkdown'

describe('renderMarkdown', () => {
  it('renders common markdown elements', async () => {
    const html = await renderMarkdown('## Changed\n\n- **Bold item**\n- [Link](https://example.com)')

    expect(html).toContain('<h2>Changed</h2>')
    expect(html).toContain('<strong>Bold item</strong>')
    expect(html).toContain('href="https://example.com"')
  })

  it('adds safe external navigation attributes to links', async () => {
    const html = await renderMarkdown('[Release](https://example.com/release)')

    expect(html).toContain('href="https://example.com/release"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('escapes raw html in source', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
