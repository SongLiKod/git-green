import service, { auth, type ApiResult } from './request'

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

/** Release 版本详情 */
export function getReleaseDetail(token: string, owner: string, repo: string, id: number): Promise<ApiResult<Release>> {
  return service.get(`/repos/${owner}/${repo}/releases/${id}`, {
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

/**
 * 软件内直接下载打包资源/二进制/安装包/源码包：
 * 通过 API 带 Token 拉取 blob，全程不跳转浏览器、不打开 GitHub 官网。
 * onProgress 回传下载进度，实现下载进度可视化。
 */
export async function downloadWithProgress(
  token: string,
  url: string,
  onProgress: (loaded: number, total: number) => void
): Promise<ApiResult<Blob>> {
  // Web开发环境：走vite代理并在代理端跟随302，规避 release-assets 域名无CORS头的问题
  let reqUrl = url
  if (import.meta.env.DEV && /^https:\/\/api\.github\.com/.test(url)) {
    reqUrl = url.replace(/^https:\/\/api\.github\.com/, '/gh-download')
  }
  const res = (await service.get(reqUrl, {
    responseType: 'blob',
    timeout: 0,
    headers: { ...auth(token), Accept: 'application/octet-stream' },
    onDownloadProgress: e => onProgress(e.loaded, e.total || 0)
  })) as unknown as ApiResult<Blob>
  return res
}
