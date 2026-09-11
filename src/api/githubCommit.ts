import service, { auth, type ApiResult } from './request'
import type { GithubCommitInfo } from './githubIssue'

/** 提交历史列表（默认最新在前） */
export function listCommits(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  page = 1,
  perPage = 30
): Promise<ApiResult<GithubCommitInfo[]>> {
  return service.get(
    `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}&page=${page}`,
    { headers: auth(token) }
  ) as unknown as Promise<ApiResult<GithubCommitInfo[]>>
}