import service, { auth, encPath, type ApiResult } from './request'
import type { GitHubRepo } from './githubRepo'

export interface GitHubBranch {
  name: string
  commit: { sha: string }
  protected: boolean
}

export interface BranchProtection {
  required_status_checks: { strict: boolean; contexts: string[] } | null
  required_pull_request_reviews: { required_approving_review_count: number } | null
  enforce_admins: Record<string, unknown> | null
  restrictions: null
}

export interface BranchCompareResult {
  status: string
  ahead_by: number
  behind_by: number
  total_commits: number
  commits: { sha: string; commit: { message: string; author: { name: string; date: string } } }[]
  files: { filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }[]
}

/** 获取所有远程分支列表 */
export async function getBranches(token: string, owner: string, repo: string): Promise<ApiResult<GitHubBranch[]>> {
  const all: GitHubBranch[] = []
  let page = 1
  for (;;) {
    const res = (await service.get(`/repos/${owner}/${repo}/branches?per_page=100&page=${page}`, {
      headers: auth(token)
    })) as unknown as ApiResult<GitHubBranch[]>
    if (res.code !== 200 || !res.data) return res
    all.push(...res.data)
    if (res.data.length < 100) break
    page++
  }
  return { code: 200, msg: 'success', data: all }
}

/** 读取分支当前提交 SHA */
async function getRefSha(token: string, owner: string, repo: string, branch: string): Promise<ApiResult<string>> {
  const res = (await service.get(`/repos/${owner}/${repo}/git/ref/heads/${encPath(branch)}`, {
    headers: auth(token)
  })) as unknown as ApiResult<{ object: { sha: string } }>
  if (res.code !== 200 || !res.data) return { code: res.code, msg: res.msg }
  return { code: 200, msg: 'success', data: res.data.object.sha }
}

/** 从指定源分支创建远程分支 */
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  fromBranch: string
): Promise<ApiResult> {
  const shaRes = await getRefSha(token, owner, repo, fromBranch)
  if (shaRes.code !== 200) return { code: shaRes.code, msg: `获取源分支失败：${shaRes.msg}` }
  return service.post(
    `/repos/${owner}/${repo}/git/refs`,
    { ref: `refs/heads/${branch}`, sha: shaRes.data },
    { headers: auth(token) }
  ) as unknown as Promise<ApiResult>
}

/** 删除远程分支 */
export function deleteBranch(token: string, owner: string, repo: string, branch: string): Promise<ApiResult> {
  return service.delete(`/repos/${owner}/${repo}/git/refs/heads/${encPath(branch)}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

/** 重命名远程分支（新建目标分支 → 必要时切换默认分支 → 删除原分支） */
export async function renameBranch(
  token: string,
  owner: string,
  repo: string,
  oldBranch: string,
  newBranch: string,
  defaultBranch: string
): Promise<ApiResult> {
  const shaRes = await getRefSha(token, owner, repo, oldBranch)
  if (shaRes.code !== 200) return { code: shaRes.code, msg: `获取原分支失败：${shaRes.msg}` }
  const createRes = (await service.post(
    `/repos/${owner}/${repo}/git/refs`,
    { ref: `refs/heads/${newBranch}`, sha: shaRes.data },
    { headers: auth(token) }
  )) as unknown as ApiResult
  if (createRes.code !== 200) return createRes
  if (oldBranch === defaultBranch) {
    const patchRes = (await service.patch(
      `/repos/${owner}/${repo}`,
      { default_branch: newBranch },
      { headers: auth(token) }
    )) as unknown as ApiResult<GitHubRepo>
    if (patchRes.code !== 200) return { code: patchRes.code, msg: `分支已创建，但默认分支切换失败：${patchRes.msg}` }
  }
  return deleteBranch(token, owner, repo, oldBranch)
}

/** 分支差异对比 base...head */
export function getBranchDiff(
  token: string,
  owner: string,
  repo: string,
  base: string,
  head: string
): Promise<ApiResult<BranchCompareResult>> {
  return service.get(`/repos/${owner}/${repo}/compare/${encPath(base)}...${encPath(head)}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<BranchCompareResult>>
}

/** 查看分支保护规则（未配置时返回 404 → code 500） */
export function getBranchProtection(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<ApiResult<BranchProtection>> {
  return service.get(`/repos/${owner}/${repo}/branches/${encPath(branch)}/protection`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<BranchProtection>>
}

/** 创建/更新分支保护规则 */
export function saveBranchProtection(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  payload: BranchProtection
): Promise<ApiResult> {
  return service.put(`/repos/${owner}/${repo}/branches/${encPath(branch)}/protection`, payload, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

/** 删除分支保护规则 */
export function deleteBranchProtection(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<ApiResult> {
  return service.delete(`/repos/${owner}/${repo}/branches/${encPath(branch)}/protection`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}
