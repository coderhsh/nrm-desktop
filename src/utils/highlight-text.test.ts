import { describe, expect, it } from 'vitest'
import { getHighlightSegments } from './highlight-text'

describe('getHighlightSegments', () => {
  it('returns plain segment when query is empty', () => {
    expect(getHighlightSegments('https://registry.npmjs.org', '')).toEqual([
      { text: 'https://registry.npmjs.org', highlight: false },
    ])
  })

  it('highlights case-insensitive matches', () => {
    expect(getHighlightSegments('Taobao Registry', 'bao')).toEqual([
      { text: 'Tao', highlight: false },
      { text: 'bao', highlight: true },
      { text: ' Registry', highlight: false },
    ])
  })

  it('highlights all occurrences', () => {
    expect(getHighlightSegments('npm npm', 'npm')).toEqual([
      { text: 'npm', highlight: true },
      { text: ' ', highlight: false },
      { text: 'npm', highlight: true },
    ])
  })
})
