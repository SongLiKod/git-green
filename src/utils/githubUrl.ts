/** GitHub 网页链接解析：把 github.com / api.github.com URL 解析为应用内可跳转的结构 */

export type GitHubLinkKind =
  | 'repo'
  | 'issue'
  | 'issues'
  | 'pr'
  | 'pulls'
  | 'commit'
  | 'file'
  | 'tree'
  | 'release'
  | 'releases'
  | 'run'
  | 'actions'
  | 'user'

export interface GitHubLink {
  kind: GitHubLinkKind
  owner: string
  repo: string
  fullName: string
  /** issue/pr/run 编号 */
  number?: number
  /** commit SHA */
  sha?: string
  /** blob/tree 的分支或SHA */
  ref?: string
  /** blob/tree 文件路径 */
  path?: string
  /** release 标签名 */
  tag?: string
}

export const LINK_KIND_LABELS: Record<GitHubLinkKind, string> = {
  repo: '仓库',
  issue: 'Issue',
  issues: 'Issue列表',
  pr: 'Pull Request',
  pulls: 'PR列表',
  commit: '提交',
  file: '文件',
  tree: '目录',
  release: 'Release',
  releases: 'Release列表',
  run: 'Action运行',
  actions: 'Action列表',
  user: '用户主页'
}

function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function toNumber(s?: string): number | undefined {
  return s && /^\d+$/.test(s) ? Number(s) : undefined
}

/** 解析失败返回 null；用户主页等无法定位仓库的返回 kind:'user' */
export function parseGitHubUrl(input: string): GitHubLink | null {
  const raw = (input || '').trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (host !== 'github.com' && host !== 'www.github.com' && host !== 'api.github.com') return null
  let segs = url.pathname.split('/').filter(Boolean).map(decodeSegment)
  if (!segs.length) return null
  if (host === 'api.github.com' && segs[0].toLowerCase() === 'repos') segs = segs.slice(1)
  if (segs.length < 2) return { kind: 'user', owner: segs[0], repo: '', fullName: segs[0] }
  const owner = segs[0]
  const repo = segs[1].replace(/\.git$/i, '')
  const base: GitHubLink = { kind: 'repo', owner, repo, fullName: `${owner}/${repo}` }
  const tail = segs.slice(2)
  switch ((tail[0] || '').toLowerCase()) {
    case '':
      return base
    case 'issues': {
      const n = toNumber(tail[1])
      return n ? { ...base, kind: 'issue', number: n } : { ...base, kind: 'issues' }
    }
    case 'pull': {
      const n = toNumber(tail[1])
      return n ? { ...base, kind: 'pr', number: n } : { ...base, kind: 'pulls' }
    }
    case 'commit':
    case 'commits':
      return tail[1] ? { ...base, kind: 'commit', sha: tail[1] } : base
    case 'blob':
      return tail[1] ? { ...base, kind: 'file', ref: tail[1], path: tail.slice(2).join('/') } : base
    case 'contents':
      return tail[1]
        ? { ...base, kind: 'file', ref: url.searchParams.get('ref') || tail[1], path: tail.slice(2).join('/') }
        : base
    case 'tree':
      return { ...base, kind: 'tree', ref: tail[1] || '', path: tail.slice(2).join('/') }
    case 'releases':
      if (tail[1] === 'tag' && tail[2]) return { ...base, kind: 'release', tag: tail[2] }
      return { ...base, kind: 'releases' }
    case 'actions': {
      if (tail[1] === 'runs') {
        const n = toNumber(tail[2])
        if (n) return { ...base, kind: 'run', number: n }
      }
      return { ...base, kind: 'actions' }
    }
    default:
      return base
  }
}

/** 解析结果 → 应用内路由（含 query 深链参数）；无法映射返回 null */
export function linkRoute(link: GitHubLink): { path: string; query: Record<string, string> } | null {
  switch (link.kind) {
    case 'repo':
      return { path: '/file', query: {} }
    case 'issues':
      return { path: '/issue', query: {} }
    case 'issue':
      return { path: '/issue', query: { issue: String(link.number) } }
    case 'pulls':
      return { path: '/pull', query: {} }
    case 'pr':
      return { path: '/pull', query: { pr: String(link.number) } }
    case 'commit':
      return { path: '/commits', query: { sha: link.sha || '' } }
    case 'file':
      return { path: '/file', query: { preview: link.path || '', ref: link.ref || '' } }
    case 'tree':
      return { path: '/file', query: { dir: link.path || '', ref: link.ref || '' } }
    case 'releases':
      return { path: '/release', query: {} }
    case 'release':
      return { path: '/release', query: { tag: link.tag || '' } }
    case 'actions':
      return { path: '/action', query: {} }
    case 'run':
      return { path: '/action', query: { run: String(link.number) } }
    default:
      return null
  }
}

/** 解析结果的一行摘要（对话框预览用） */
export function linkSummary(link: GitHubLink): string {
  const label = LINK_KIND_LABELS[link.kind]
  switch (link.kind) {
    case 'issue':
    case 'pr':
      return `${label} #${link.number} · ${link.fullName}`
    case 'run':
      return `${label} #${link.number} · ${link.fullName}`
    case 'commit':
      return `${label} ${link.sha?.slice(0, 7) || ''} · ${link.fullName}`
    case 'file':
    case 'tree':
      return `${label} ${link.path || link.fullName}${link.ref ? `（${link.ref}）` : ''}`
    case 'release':
      return `${label} ${link.tag} · ${link.fullName}`
    case 'user':
      return `${label} ${link.owner}（暂不支持应用内打开）`
    default:
      return `${label} ${link.fullName}`
  }
}
