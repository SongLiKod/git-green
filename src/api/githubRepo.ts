import service, { auth, type ApiResult } from './request'

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  private: boolean
  fork: boolean
  archived: boolean
  default_branch: string
  has_issues: boolean
  has_wiki: boolean
  has_discussions: boolean
  homepage: string | null
  updated_at: string
  clone_url: string
}

export interface CreateRepoPayload {
  name: string
  description?: string
  private?: boolean
  homepage?: string
}

export interface RepoBasicPayload {
  name?: string
  description?: string
  homepage?: string | null
}

export interface RepoFeaturePayload {
  archived?: boolean
  has_issues?: boolean
  has_wiki?: boolean
  has_discussions?: boolean
  default_branch?: string
}

export interface Collaborator {
  login: string
  id: number
  avatar_url: string
  permissions?: Record<string, boolean>
  role_name?: string
}

/** 获取账号仓库列表（含协作/组织仓库，分页拉取） */
export async function getUserRepos(token: string): Promise<ApiResult<GitHubRepo[]>> {
  const all: GitHubRepo[] = []
  let page = 1
  for (;;) {
    const res = (await service.get(
      `/user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
      { headers: auth(token) }
    )) as unknown as ApiResult<GitHubRepo[]>
    if (res.code !== 200 || !res.data) return res
    all.push(...res.data)
    if (res.data.length < 100) break
    page++
  }
  return { code: 200, msg: 'success', data: all }
}

/** 新建远程仓库 */
export function createRepo(token: string, payload: CreateRepoPayload): Promise<ApiResult<GitHubRepo>> {
  return service.post('/user/repos', payload, { headers: auth(token) }) as unknown as Promise<ApiResult<GitHubRepo>>
}

/** 删除远程仓库 */
export function deleteRepo(token: string, owner: string, repo: string): Promise<ApiResult> {
  return service.delete(`/repos/${owner}/${repo}`, { headers: auth(token) }) as unknown as Promise<ApiResult>
}

/** 获取仓库完整配置 */
export function getRepoSetting(token: string, owner: string, repo: string): Promise<ApiResult<GitHubRepo>> {
  return service.get(`/repos/${owner}/${repo}`, { headers: auth(token) }) as unknown as Promise<ApiResult<GitHubRepo>>
}

/** 修改仓库信息（名称、描述、主页链接） */
export function updateRepoBasic(
  token: string,
  owner: string,
  repo: string,
  payload: RepoBasicPayload
): Promise<ApiResult<GitHubRepo>> {
  return service.patch(`/repos/${owner}/${repo}`, payload, { headers: auth(token) }) as unknown as Promise<
    ApiResult<GitHubRepo>
  >
}

/** 公开/私有权限切换 */
export function updateRepoVisibility(
  token: string,
  owner: string,
  repo: string,
  isPrivate: boolean
): Promise<ApiResult<GitHubRepo>> {
  return service.patch(`/repos/${owner}/${repo}`, { private: isPrivate }, { headers: auth(token) }) as unknown as Promise<
    ApiResult<GitHubRepo>
  >
}

/** 功能开关：归档/取消归档、Issues、Wiki、Discussions、默认分支 */
export function updateRepoFeatures(
  token: string,
  owner: string,
  repo: string,
  payload: RepoFeaturePayload
): Promise<ApiResult<GitHubRepo>> {
  return service.patch(`/repos/${owner}/${repo}`, payload, { headers: auth(token) }) as unknown as Promise<
    ApiResult<GitHubRepo>
  >
}

/** 协作者列表 */
export function getCollaborators(token: string, owner: string, repo: string): Promise<ApiResult<Collaborator[]>> {
  return service.get(`/repos/${owner}/${repo}/collaborators?per_page=100`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<Collaborator[]>>
}

/** 添加协作者并配置权限 */
export function addCollaborator(
  token: string,
  owner: string,
  repo: string,
  username: string,
  permission: 'pull' | 'push' | 'admin' | 'maintain' | 'triage'
): Promise<ApiResult> {
  return service.put(`/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`, { permission }, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

/** 删除协作者 */
export function removeCollaborator(token: string, owner: string, repo: string, username: string): Promise<ApiResult> {
  return service.delete(`/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}
