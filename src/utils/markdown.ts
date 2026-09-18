import MarkdownIt from 'markdown-it'

const MarkdownCtor =
  (typeof MarkdownIt === 'function' ? MarkdownIt : (MarkdownIt as { default?: typeof MarkdownIt }).default) ||
  MarkdownIt

export const md = new MarkdownCtor({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false
})

const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens: any, idx: number, options: any, _env: any, self: any) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens: any, idx: number, options: any, env: any, self: any) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'nofollow noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

md.core.ruler.after('inline', 'github-task-lists', (state: any) => {
  const tokens = state.tokens as any[]
  for (let i = 2; i < tokens.length; i++) {
    if (tokens[i].type !== 'inline') continue
    const paragraph = tokens[i - 1]
    const listItem = tokens[i - 2]
    if (paragraph?.type !== 'paragraph_open' || listItem?.type !== 'list_item_open') continue
    const children = tokens[i].children
    if (!children?.length) continue
    const first = children[0]
    if (first.type !== 'text') continue
    const m = /^\[([ xX])\][ \t]+/.exec(first.content)
    if (!m) continue
    const checked = m[1].toLowerCase() === 'x'
    first.content = first.content.slice(m[0].length)
    const checkbox = new state.Token('html_inline', '', 0)
    checkbox.content = `<input type="checkbox" disabled${checked ? ' checked' : ''} /> `
    children.unshift(checkbox)
    const itemCls = listItem.attrGet('class')
    listItem.attrSet('class', itemCls ? `${itemCls} task-list-item` : 'task-list-item')
    for (let j = i - 3; j >= 0; j--) {
      if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
        const listCls = tokens[j].attrGet('class')
        tokens[j].attrSet('class', listCls ? `${listCls} contains-task-list` : 'contains-task-list')
        break
      }
    }
  }
})

export function renderMarkdown(source?: string | null): string {
  const s = source || ''
  if (!s) return ''
  try {
    return md.render(s)
  } catch {
    return md.utils.escapeHtml(s)
  }
}
