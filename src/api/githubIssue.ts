import service, { auth, encPath, type ApiResult } from './request'

export interface IssueLabel {
  id: number
  name: string
  color: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed' | string
  body: string | null
  user: { login: string } | null
  labels: IssueLabel[]
  comments: number
  created_at: string
  updated_at: string
  pull_request?: unknown
}

export interface IssueComment {
  id: number
  body: string
  user: { login: string } | null
  created_at: string
}

export interface CreateIssuePayload {
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
}

/** Issue 列表（自动过滤掉混在 issues 接口里的 PR） */
export async function listIssues(
  token: string,
  owner: string,
  repo: string,
  state = 'open',
  page = 1
): Promise<ApiResult<GitHubIssue[]>> {
  const res = (await service.get(
    `/repos/${owner}/${repo}/issues?state=${state}&per_page=30&page=${page}&sort=updated&direction=desc`,
    { headers: auth(token) }
  )) as unknown as ApiResult<GitHubIssue[]>
  if (res.code !== 200 || !res.data) return { code: res.code, msg: res.msg }
  return { code: 200, msg: 'success', data: res.data.filter(i => !i.pull_request) }
}

/** Issue 详情 */
export function getIssue(token: string, owner: string, repo: string, num: number): Promise<ApiResult<GitHubIssue>> {
  return service.get(`/repos/${owner}/${repo}/issues/${num}`, { headers: auth(token) }) as unknown as Promise<
    ApiResult<GitHubIssue>
  >
}

export interface RepoLabel {
  id: number
  node_id?: string
  name: string
  color: string
  description: string | null
}

/** 仓库现有标签（新建/编辑 Issue 时选标签用） */
export function listLabels(token: string, owner: string, repo: string): Promise<ApiResult<RepoLabel[]>> {
  return service.get(`/repos/${owner}/${repo}/labels?per_page=100`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<RepoLabel[]>>
}

/** 删除仓库标签（需写权限） */
export function deleteLabel(token: string, owner: string, repo: string, name: string): Promise<ApiResult> {
  return service.delete(`/repos/${owner}/${repo}/labels/${encPath(name)}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

/** 新建 Issue */
export function createIssue(
  token: string,
  owner: string,
  repo: string,
  payload: CreateIssuePayload
): Promise<ApiResult<GitHubIssue>> {
  return service.post(`/repos/${owner}/${repo}/issues`, payload, { headers: auth(token) }) as unknown as Promise<
    ApiResult<GitHubIssue>
  >
}

/** 关闭 / 重新打开 Issue */
export function setIssueState(
  token: string,
  owner: string,
  repo: string,
  num: number,
  state: 'open' | 'closed'
): Promise<ApiResult<GitHubIssue>> {
  return service.patch(`/repos/${owner}/${repo}/issues/${num}`, { state }, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<GitHubIssue>>
}

/** 编辑 Issue（标题 / 描述 / 标签） */
export function updateIssue(
  token: string,
  owner: string,
  repo: string,
  num: number,
  payload: { title?: string; body?: string | null; labels?: string[] }
): Promise<ApiResult<GitHubIssue>> {
  return service.patch(`/repos/${owner}/${repo}/issues/${num}`, payload, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<GitHubIssue>>
}

/** Issue 评论列表（PR 详情评论区复用此接口） */
export async function listComments(
  token: string,
  owner: string,
  repo: string,
  num: number
): Promise<ApiResult<IssueComment[]>> {
  const res = (await service.get(`/repos/${owner}/${repo}/issues/${num}/comments?per_page=50`, {
    headers: auth(token)
  })) as unknown as ApiResult<IssueComment[]>
  return res
}

/** 新增评论 */
export function commentIssue(
  token: string,
  owner: string,
  repo: string,
  num: number,
  body: string
): Promise<ApiResult<IssueComment>> {
  return service.post(`/repos/${owner}/${repo}/issues/${num}/comments`, { body }, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<IssueComment>>
}

/* ==================== 关联提交（issue 时间线 + 提交详情） ==================== */

export interface IssueTimelineEvent {
  id: number
  event: string
  commit_id: string | null
  actor: { login: string } | null
  created_at: string
}

export interface CommitFile {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

export interface GithubCommitInfo {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { name: string; date: string }
  }
  author: { login: string } | null
  files?: CommitFile[]
}

/** issue 时间线（需要 preview 头），从中提取 referenced 事件的 commit_id 得到关联提交 */
export function listIssueTimeline(
  token: string,
  owner: string,
  repo: string,
  num: number
): Promise<ApiResult<IssueTimelineEvent[]>> {
  return service.get(`/repos/${owner}/${repo}/issues/${num}/timeline?per_page=100`, {
    headers: { ...auth(token), Accept: 'application/vnd.github.mockingbird-preview+json' }
  }) as unknown as Promise<ApiResult<IssueTimelineEvent[]>>
}

/** 提交详情（展示关联提交的 message / 作者 / sha） */
export function getCommit(
  token: string,
  owner: string,
  repo: string,
  sha: string
): Promise<ApiResult<GithubCommitInfo>> {
  return service.get(`/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<GithubCommitInfo>>
}
