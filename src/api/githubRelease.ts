import service, { auth, encPath, type ApiResult } from './request'

export interface ReleaseAsset {
  id: number
  name: string
  size: number
  download_count: number
  content_type: string
  url: string
  browser_download_url: string
}

export interface Release {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  created_at: string
  published_at: string | null
  assets: ReleaseAsset[]
  zipball_url: string
  tarball_url: string
}

export interface ReleasePayload {
  tag_name: string
  name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
  target_commitish?: string
}

/** 获取所有 Release（正式版/测试版/草稿版） */
export function listReleases(token: string, owner: string, repo: string): Promise<ApiResult<Release[]>> {
  return service.get(`/repos/${owner}/${repo}/releases?per_page=100`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<Release[]>>
}

/** 仓库标签（tag 名与其指向的 commit） */
export interface RepoTag {
  name: string
  commit: { sha: string; url: string }
}

/** 获取仓库标签列表（新→旧，每页最多 100 条） */
export function listTags(token: string, owner: string, repo: string, page = 1): Promise<ApiResult<RepoTag[]>> {
  return service.get(`/repos/${owner}/${repo}/tags?per_page=100&page=${page}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<RepoTag[]>>
}

/** Release 版本详情 */
export function getReleaseDetail(token: string, owner: string, repo: string, id: number): Promise<ApiResult<Release>> {
  return service.get(`/repos/${owner}/${repo}/releases/${id}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<Release>>
}

/** 按标签名获取 Release 详情（深链跳转使用） */
export function getReleaseByTag(token: string, owner: string, repo: string, tag: string): Promise<ApiResult<Release>> {
  return service.get(`/repos/${owner}/${repo}/releases/tags/${encPath(tag)}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<Release>>
}

/** 新建 Release */
export function createRelease(
  token: string,
  owner: string,
  repo: string,
  payload: ReleasePayload
): Promise<ApiResult<Release>> {
  return service.post(`/repos/${owner}/${repo}/releases`, payload, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<Release>>
}

/** 编辑 Release */
export function updateRelease(
  token: string,
  owner: string,
  repo: string,
  id: number,
  payload: Partial<ReleasePayload>
): Promise<ApiResult<Release>> {
  return service.patch(`/repos/${owner}/${repo}/releases/${id}`, payload, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<Release>>
}

/** 删除 Release */
export function deleteRelease(token: string, owner: string, repo: string, id: number): Promise<ApiResult> {
  return service.delete(`/repos/${owner}/${repo}/releases/${id}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

// Release 资产下载已统一走 api/resumable.ts 的 downloadResumable（支持断点续传）。
