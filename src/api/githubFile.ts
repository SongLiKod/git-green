import service, { auth, encPath, type ApiResult } from './request'
import { base64ToUtf8, utf8ToBase64 } from '@/utils/crypto'

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size: number
  sha: string
}

export interface FileContentResult {
  content: string
  sha: string
  size: number
}

/** 获取仓库文件目录结构（单层懒加载） */
export async function getFileTree(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<ApiResult<FileEntry[]>> {
  const res = (await service.get(
    `/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`,
    { headers: auth(token) }
  )) as unknown as ApiResult<
    | { name: string; path: string; type: string; size: number; sha: string }[]
    | { name: string; path: string; type: string; size: number; sha: string }
  >
  if (res.code !== 200 || !res.data) {
    // 新建的空仓库（无任何提交）Contents API 会返回 "This repository is empty."，按空目录处理
    if (/\bempty\b/i.test(res.msg || '')) return { code: 200, msg: 'success', data: [] }
    return { code: res.code, msg: res.msg }
  }
  const items = Array.isArray(res.data) ? res.data : [res.data]
  const entries: FileEntry[] = items.map(item => ({
    name: item.name,
    path: item.path,
    type: item.type === 'dir' ? 'dir' : 'file',
    size: item.size,
    sha: item.sha
  }))
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  return { code: 200, msg: 'success', data: entries }
}

/** 在线读取文件内容（预览/编辑） */
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<ApiResult<FileContentResult>> {
  const res = (await service.get(
    `/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`,
    { headers: auth(token) }
  )) as unknown as ApiResult<{ content?: string; sha: string; size: number }>
  if (res.code !== 200 || !res.data) return { code: res.code, msg: res.msg }
  if (!res.data.content) return { code: 500, msg: '文件过大或为二进制文件，无法在线预览' }
  return {
    code: 200,
    msg: 'success',
    data: { content: base64ToUtf8(res.data.content), sha: res.data.sha, size: res.data.size }
  }
}

export interface FileRawResult {
  /** Base64 原始内容（文件>1MB时为null，需用 getFileRawBytes 回退） */
  base64: string | null
  sha: string
  size: number
  downloadUrl: string
}

/** 读取文件原始Base64（图片等二进制预览用，不经UTF-8解码） */
export async function getFileRaw(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<ApiResult<FileRawResult>> {
  const res = (await service.get(
    `/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`,
    { headers: auth(token) }
  )) as unknown as ApiResult<{ content?: string; sha: string; size: number; download_url: string }>
  if (res.code !== 200 || !res.data) return { code: res.code, msg: res.msg }
  return {
    code: 200,
    msg: 'success',
    data: {
      base64: res.data.content ? res.data.content.replace(/\s/g, '') : null,
      sha: res.data.sha,
      size: res.data.size,
      downloadUrl: res.data.download_url
    }
  }
}

/** contents API 的原始内容地址（原生下载等需要真实 URL 的场景） */
export function contentsRawUrl(owner: string, repo: string, path: string, ref: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`
}

/**
 * 拉取文件原始字节（单文件下载、>1MB 大文件回退预览）。
 * 走 api.github.com 的 `application/vnd.github.raw` 媒体类型：
 * 1) 带 Token，私有仓库可用
 * 2) 大文件同样返回字节（contents JSON 的 content 为空）
 * 3) 兼容浏览器 CORS：raw.githubusercontent.com 对带 Authorization 的请求
 *    预检固定返回 403，请求会被浏览器拦成 Network Error（提示“网络失败”）
 * 4) 追加时间戳参数绕开 60s 的 HTTP 缓存，避免刚提交就下载到旧内容
 */
export function getFileRawBytes(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<ApiResult<Blob>> {
  return service.get(`/repos/${owner}/${repo}/contents/${encPath(path)}`, {
    params: { ref, _: Date.now() },
    responseType: 'blob',
    timeout: 0,
    headers: { ...auth(token), Accept: 'application/vnd.github.raw' },
    onDownloadProgress: e => onProgress?.(e.loaded, e.total || 0)
  }) as unknown as Promise<ApiResult<Blob>>
}

/** 在线编辑/新增远程文件，直接提交到 GitHub 远程仓库 */
export function saveFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string | null,
  message: string,
  branch: string
): Promise<ApiResult> {
  const body: Record<string, string> = { message, content: utf8ToBase64(content), branch }
  if (sha) body.sha = sha
  return service.put(`/repos/${owner}/${repo}/contents/${encPath(path)}`, body, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

/** 在线删除远程文件 */
export function deleteFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  sha: string,
  message: string,
  branch: string
): Promise<ApiResult> {
  return service.delete(`/repos/${owner}/${repo}/contents/${encPath(path)}`, {
    headers: auth(token),
    data: { message, sha, branch }
  }) as unknown as Promise<ApiResult>
}
