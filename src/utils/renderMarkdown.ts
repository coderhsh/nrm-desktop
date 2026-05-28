import type MarkdownIt from 'markdown-it'

let instance: MarkdownIt | null = null

async function getMarkdownIt(): Promise<MarkdownIt> {
  if (instance) return instance
  const mod = await import('markdown-it')
  const md = new mod.default({
    html: false,
    linkify: true,
    breaks: true,
  })

  const defaultLinkOpen = md.renderer.rules.link_open
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))

  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index]
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
    return defaultLinkOpen(tokens, index, options, env, self)
  }

  instance = md
  return md
}

export async function renderMarkdown(source: string): Promise<string> {
  const md = await getMarkdownIt()
  return md.render(source)
}
