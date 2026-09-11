import MarkdownIt from 'markdown-it'

/** 本地 Markdown 解析实例：GitHub 风格（自动链接、保留换行）、禁用原始 HTML 防 XSS */
export const md = new MarkdownIt({
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

/** 渲染 Markdown 文本为 HTML，空值返回空串 */
export function renderMarkdown(source?: string | null): string {
  return md.render(source || '')
}