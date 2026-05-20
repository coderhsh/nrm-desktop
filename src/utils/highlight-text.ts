export interface HighlightSegment {
  text: string
  highlight: boolean
}

/**
 * Split text into segments, marking case-insensitive query matches.
 */
export function getHighlightSegments(text: string, query: string): HighlightSegment[] {
  const q = query.trim()
  if (!q) {
    return [{ text, highlight: false }]
  }

  const lowerText = text.toLowerCase()
  const lowerQuery = q.toLowerCase()
  const segments: HighlightSegment[] = []
  let start = 0
  let index = lowerText.indexOf(lowerQuery, start)

  while (index !== -1) {
    if (index > start) {
      segments.push({ text: text.slice(start, index), highlight: false })
    }
    segments.push({ text: text.slice(index, index + q.length), highlight: true })
    start = index + q.length
    index = lowerText.indexOf(lowerQuery, start)
  }

  if (start < text.length) {
    segments.push({ text: text.slice(start), highlight: false })
  }

  return segments.length > 0 ? segments : [{ text, highlight: false }]
}
