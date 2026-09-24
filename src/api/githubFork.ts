import service, { auth, type ApiResult } from './request'
import type { GitHubRepo } from './githubRepo'

/** Fork 排序：最新 / 最旧 / Star 最多 / Watch 最多 */
export type ForkSort = 'newest' | 'oldest' | 'stargazers' | 'watchers'

export interface CreateForkPayload {
  /** Fork 到组织（缺省 = Fork 到个人账号） */
  organization?: string
  /** 自定义 Fork 仓库名 */
  name?: string
  /** 仅 Fork 默认分支 */
  default_branch_only?: boolean
}

export interface SyncUpstreamResult {
  message: string
  merge_type?: 'merge' | 'fast-forward' | 'none'
  base_branch?: string
}

/** 创建 Fork（异步操作：GitHub 返回 202 后仓库对象可能数秒后才就绪，调用方需轮询刷新） */
export function createFork(
  token: string,
  owner: string,
  repo: string,
  payload: CreateForkPayload = {}
): Promise<ApiResult<GitHubRepo>> {
  return service.post(`/repos/${owner}/${repo}/forks`, payload, { headers: auth(token) }) as unknown as Promise<
    ApiResult<GitHubRepo>
  >
}

/** 分页获取仓库的 Fork 列表（不全量拉取，由页面控制加载更多） */
export function listForks(
  token: string,
  owner: string,
  repo: string,
  sort: ForkSort = 'newest',
  page = 1,
  perPage = 30
): Promise<ApiResult<GitHubRepo[]>> {
  return service.get(`/repos/${owner}/${repo}/forks?sort=${sort}&per_page=${perPage}&page=${page}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<GitHubRepo[]>>
}

/** 当前登录用户所属组织（用于「Fork 到组织」下拉，分页拉取） */
export async function getMyOrgs(token: string): Promise<ApiResult<string[]>> {
  const all: string[] = []
  let page = 1
  for (;;) {
    const res = (await service.get(`/user/orgs?per_page=100&page=${page}`, {
      headers: auth(token)
    })) as unknown as ApiResult<{ login: string }[]>
    if (res.code !== 200 || !res.data) return { code: res.code, msg: res.msg }
    all.push(...res.data.map(o => o.login))
    if (res.data.length < 100) break
    page++
  }
  return { code: 200, msg: 'success', data: all }
}

/**
 * 同步上游（Sync a fork branch）：把 fork 的指定分支与上游对齐。
 * 200=成功（返回 merge_type）/ 409=存在冲突 / 422=其他原因（如该分支非 fork 分支）
 */
export function syncUpstream(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<ApiResult<SyncUpstreamResult>> {
  return service.post(
    `/repos/${owner}/${repo}/merge-upstream`,
    { branch },
    { headers: auth(token) }
  ) as unknown as Promise<ApiResult<SyncUpstreamResult>>
}
