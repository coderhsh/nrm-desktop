import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './renderMarkdown'

describe('renderMarkdown', () => {
  it('renders common markdown elements', () => {
    const html = renderMarkdown('## Changed\n\n- **Bold item**\n- [Link](https://example.com)')

    expect(html).toContain('<h2>Changed</h2>')
    expect(html).toContain('<strong>Bold item</strong>')
    expect(html).toContain('href="https://example.com"')
  })

  it('escapes raw html in source', () => {
    const html = renderMarkdown('<script>alert(1)</script>')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
