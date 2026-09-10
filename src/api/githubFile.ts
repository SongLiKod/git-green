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
  if (res.code !== 200 || !res.data) return { code: res.code, msg: res.msg }
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
  /** Base64 原始内容（文件>1MB时为null，需用downloadUrl回退） */
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

/** 大文件回退：经 download_url 带Token拉取blob（raw.githubusercontent 支持CORS） */
export function getFileBlob(token: string, url: string): Promise<ApiResult<Blob>> {
  return service.get(url, {
    responseType: 'blob',
    timeout: 0,
    headers: auth(token)
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
