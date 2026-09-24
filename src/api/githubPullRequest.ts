import service, { auth, type ApiResult } from './request'

export interface GitHubPR {
  number: number
  title: string
  state: 'open' | 'closed' | string
  draft: boolean
  body: string | null
  user: { login: string } | null
  /** 跨 fork 提交时 label 形如 `forkOwner:branch`，repo 为来源仓库 */
  head: { ref: string; sha: string; label?: string; repo?: { full_name?: string } }
  base: { ref: string; label?: string; repo?: { full_name?: string } }
  mergeable?: boolean | null
  created_at: string
  updated_at: string
  merged_at: string | null
}

export interface PRFile {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

export interface CreatePRPayload {
  title: string
  body?: string
  /** 同仓库时为分支名；跨 fork 时为 `forkOwner:branch` */
  head: string
  base: string
  draft?: boolean
}

/** Pull Request 列表 */
export function listPRs(
  token: string,
  owner: string,
  repo: string,
  state = 'open',
  page = 1
): Promise<ApiResult<GitHubPR[]>> {
  return service.get(
    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=30&page=${page}&sort=updated&direction=desc`,
    { headers: auth(token) }
  ) as unknown as Promise<ApiResult<GitHubPR[]>>
}

/** 创建 Pull Request */
export function createPR(
  token: string,
  owner: string,
  repo: string,
  payload: CreatePRPayload
): Promise<ApiResult<GitHubPR>> {
  return service.post(`/repos/${owner}/${repo}/pulls`, payload, { headers: auth(token) }) as unknown as Promise<
    ApiResult<GitHubPR>
  >
}

/** PR 详情 */
export function getPRDetail(token: string, owner: string, repo: string, num: number): Promise<ApiResult<GitHubPR>> {
  return service.get(`/repos/${owner}/${repo}/pulls/${num}`, { headers: auth(token) }) as unknown as Promise<
    ApiResult<GitHubPR>
  >
}

/** PR 变更文件列表 */
export function listPRFiles(
  token: string,
  owner: string,
  repo: string,
  num: number
): Promise<ApiResult<PRFile[]>> {
  return service.get(`/repos/${owner}/${repo}/pulls/${num}/files?per_page=100`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<PRFile[]>>
}

/** 审核 PR：通过 / 要求修改 / 仅评论 */
export function reviewPR(
  token: string,
  owner: string,
  repo: string,
  num: number,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  body = ''
): Promise<ApiResult> {
  return service.post(`/repos/${owner}/${repo}/pulls/${num}/reviews`, { event, body }, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

/** 合并 PR */
export function mergePR(
  token: string,
  owner: string,
  repo: string,
  num: number,
  mergeMethod: 'merge' | 'squash' | 'rebase'
): Promise<ApiResult<{ merged: boolean; sha: string }>> {
  return service.put(`/repos/${owner}/${repo}/pulls/${num}/merge`, { merge_method: mergeMethod }, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<{ merged: boolean; sha: string }>>
}

/** 关闭 PR */
export function closePR(
  token: string,
  owner: string,
  repo: string,
  num: number
): Promise<ApiResult<GitHubPR>> {
  return service.patch(`/repos/${owner}/${repo}/pulls/${num}`, { state: 'closed' }, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<GitHubPR>>
}
