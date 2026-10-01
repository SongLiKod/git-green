import { auth } from '@/api/request'
import { downloadResumable } from '@/api/resumable'
import { loadDownloadPart, saveDownloadPart, removeDownloadPart } from './db'
import {
  blobDownload,
  isAndroidClient,
  requestAndroidNotificationPermission,
  startNativeDownload,
  supportsRangeResume
} from './platform'

/** 一次下载所需的全部上下文；`id` 同时是续传分片的键 */
export interface DownloadSpec {
  id: string
  url: string
  filename: string
  /** Contents API 必须用 raw 媒体类型，否则返回 base64 JSON 而非字节 */
  accept?: string
  /** 已知文件大小，进度未知时兜底 */
  size?: number
  accountId?: string
  /** 取消下载（仅 Web/Windows 生效；Android 走 cancelNativeDownload） */
  signal?: AbortSignal
}

export interface DownloadHandlers {
  onProgress?: (loaded: number, total: number, percent: number) => void
  /** 完成：Android 原生路径回传 path/uri，Web/Windows 回传 blob 由调用方落盘 */
  onDone?: (info: { blob?: Blob; path?: string; uri?: string; total: number }) => void
  /**
   * 失败：`partial` 为已保存的分片，带它表示「可继续下载」。
   * 原生路径的进度由 onProgress 维护，这里不带 partial。
   */
  onError?: (msg: string, partial?: { loaded: number; total: number }) => void
}

export function percentOf(loaded: number, total: number, fallback = 0): number {
  const t = total || fallback
  if (t <= 0 || loaded <= 0) return 0
  return Math.min(99, Math.round((loaded / t) * 100))
}

/** 本会话进行中的下载记录 id：用于区分「真·中断」与「正在下载」 */
const activeIds = new Set<string>()

export function isDownloadActive(id: string): boolean {
  return activeIds.has(id)
}

/**
 * 统一的下载执行器，新任务与「继续下载」共用同一段逻辑：
 *
 * - Android：交给原生流式下载，原生侧按「下载地址+文件名」找回上次的分片继续写
 * - Web/Windows：带 `Range` 从 IndexedDB 分片接着拉；环境不支持 Range 时自动降级为整包
 *
 * 两条路径的分片键都是记录 `id`，因此只要 url 相同，再次调用即为断点续传。
 */

export async function executeDownload(task: DownloadSpec, pat: string, handlers: DownloadHandlers = {}): Promise<void> {
  const headers = { ...auth(pat), Accept: task.accept || 'application/octet-stream' }
  if (isAndroidClient()) requestAndroidNotificationPermission()
  activeIds.add(task.id)
  const release = () => activeIds.delete(task.id)

  const nativeHandled = startNativeDownload(task.id, task.url, headers, task.filename, {
    onProgress: (loaded, total) => handlers.onProgress?.(loaded, total, percentOf(loaded, total, task.size)),
    onDone: saved => {
      release()
      handlers.onDone?.({ path: saved.path, uri: saved.uri, total: task.size || 0 })
    },
    onError: msg => {
      release()
      handlers.onError?.(msg)
    }
  })
  if (nativeHandled) return

  try {
    const canResume = supportsRangeResume()
    const partial = canResume ? await loadDownloadPart(task.id) : null
    const res = await downloadResumable(pat, task.url, {
      accept: task.accept,
      partial,
      signal: task.signal,
      onProgress: (loaded, total) => handlers.onProgress?.(loaded, total, percentOf(loaded, total, task.size))
    })

    if (res.code === 200 && res.data?.blob) {
      await removeDownloadPart(task.id)
      const total = res.data.total || task.size || 0
      handlers.onProgress?.(res.data.loaded, total, 100)
      handlers.onDone?.({ blob: res.data.blob, total })
      return
    }

    const leftover = res.data?.partial
    // 只有环境真支持 Range 时分片才有意义，否则白白占空间
    if (leftover && canResume) {
      await saveDownloadPart(task.id, leftover)
      const loaded = res.data?.loaded || leftover.size
      const total = res.data?.total || 0
      handlers.onProgress?.(loaded, total, percentOf(loaded, total, task.size))
      handlers.onError?.(res.msg, { loaded, total })
    } else {
      await removeDownloadPart(task.id)
      handlers.onError?.(res.msg)
    }
  } finally {
    release()
  }
}

/** Web/Windows 的默认落盘（浏览器 blob 下载，不跳转任何外链页面） */
export function saveBlob(blob: Blob, filename: string): void {
  blobDownload(blob, filename)
}
