import { auth, type ApiResult } from './request'
import { supportsRangeResume } from '@/utils/platform'

export interface ResumableOutcome {
  /** 下载完成时的完整文件 */
  blob?: Blob
  /** 中断时已收到的字节；下次以 `partial` 传入即可从该偏移继续 */
  partial?: Blob
  /** 已下载字节数 */
  loaded: number
  /** 总字节数（服务端未告知时为 0） */
  total: number
}

/** 进度回报间隔，避免高频 setState 拖慢渲染 */
const PROGRESS_STEP = 128 * 1024

/** 解析 `Content-Range: bytes 100-999/1000` → 总字节数 */
function parseTotal(contentRange: string | null): number {
  const m = contentRange && /\/(\d+)\s*$/.exec(contentRange)
  return m ? Number(m[1]) : 0
}

function interrupted(chunks: Blob[], parts: BlobPart[], loaded: number, total: number): ApiResult<ResumableOutcome> {
  const data: ResumableOutcome = { loaded, total }
  if (loaded > 0) data.partial = new Blob([...chunks, ...parts])
  return { code: 500, msg: '下载中断，可继续下载', data }
}

/**
 * 可断点续传的下载器（Release 资产 / 单文件 / Artifact 通用）。
 *
 * - 带 `Range` 拉取剩余字节，服务端回 206 → 追加；回 200 → 说明不接受续传，丢弃旧分片整包重来
 * - 中断时不丢已收到的字节：整段打成 `partial` 交还调用方落库，下次从该偏移继续
 * - 完整性校验：已知总长却提前 EOF → 按中断处理，避免把半成品当完整文件落盘
 *
 * 注意：`Range` 属于非简单请求头，Web 生产环境会被 GitHub 的 CORS 预检拒绝
 * （白名单不含 Range），因此由 `supportsRangeResume()` 门控，不支持时退化为整包下载。
 */
export async function downloadResumable(
  token: string,
  url: string,
  opts: {
    accept?: string
    /** 上次未完成的分片 */
    partial?: Blob | null
    onProgress?: (loaded: number, total: number) => void
    /** 取消下载（中断处返回 partial，是否保留由调用方决定） */
    signal?: AbortSignal
  } = {}
): Promise<ApiResult<ResumableOutcome>> {
  // Web 开发环境改走 vite 代理（代理端跟随 302），规避 release-assets 域名无 CORS 头的问题
  const reqUrl =
    import.meta.env.DEV && /^https:\/\/api\.github\.com/.test(url)
      ? url.replace(/^https:\/\/api\.github\.com/, '/gh-download')
      : url

  const canRange = supportsRangeResume()
  let chunks: Blob[] = opts.partial && opts.partial.size > 0 ? [opts.partial] : []
  let loaded = chunks.reduce((n, c) => n + c.size, 0)
  let total = 0

  // 416（起点越界）时清掉分片重来，最多重试一次
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers: Record<string, string> = {
      ...auth(token),
      Accept: opts.accept || 'application/octet-stream'
    }
    if (canRange && loaded > 0) headers.Range = `bytes=${loaded}-`

    opts.onProgress?.(loaded, total)

    let res: Response
    try {
      res = await fetch(reqUrl, { headers, redirect: 'follow', signal: opts.signal })
    } catch (e: any) {
      if (e?.name === 'AbortError') return interrupted(chunks, [], loaded, total)
      return {
        code: 500,
        msg: `网络异常：${String(e?.message || e)}`,
        data: { loaded, total, ...(loaded > 0 ? { partial: new Blob(chunks) } : {}) }
      }
    }

    if (res.status === 416) {
      // 本地分片与远端已不一致（资源被替换/分片损坏），丢弃后从头下载
      res.body?.cancel().catch(() => {})
      chunks = []
      loaded = 0
      total = 0
      continue
    }

    if (!res.ok) {
      let detail = ''
      try {
        const text = await res.text()
        try {
          detail = JSON.parse(text)?.message || ''
        } catch {
          detail = text.slice(0, 200)
        }
      } catch {
        /* 忽略读取失败 */
      }
      const suffix = detail ? `：${detail}` : ''
      // 即便出错也要把已收到的分片交还，否则续传会从 0 开始
      const data: ResumableOutcome = { loaded, total }
      if (loaded > 0) data.partial = new Blob(chunks)
      if (res.status === 401) return { code: 401, msg: `Token失效${suffix}`, data }
      if (res.status === 403) return { code: 403, msg: `请求限流或权限不足${suffix}`, data }
      if (res.status === 404) return { code: 500, msg: `资源不存在${suffix}`, data }
      return { code: 500, msg: `下载失败${suffix}`, data }
    }

    const contentRange = res.headers.get('content-range')
    if (contentRange) {
      total = parseTotal(contentRange)
    } else {
      // 未带 Content-Range = 200 整包响应，服务端没接受续传，旧分片作废
      chunks = []
      loaded = 0
      total = Number(res.headers.get('content-length') || 0)
    }
    // 立刻回传一次，让调用方拿到真实总长（续传时进度条也能直接跳到位）
    opts.onProgress?.(loaded, total)

    const parts: BlobPart[] = []
    try {
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader()
        let reported = loaded
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          // 传输层给出的视图可能是 ArrayBufferLike，这里仅作为 Blob 分片使用，收窄类型即可
          parts.push(value as unknown as BlobPart)
          loaded += value.byteLength
          if (loaded - reported >= PROGRESS_STEP) {
            reported = loaded
            opts.onProgress?.(loaded, total)
          }
        }
      } else {
        const buf = new Uint8Array(await res.arrayBuffer())
        parts.push(buf)
        loaded += buf.byteLength
      }
    } catch {
      // 读取中断：把历史分片与本轮字节一起交还，供下次续传
      return interrupted(chunks, parts, loaded, total)
    }

    // 已知总长却提前 EOF → 连接被静默截断，按中断处理
    if (total > 0 && loaded < total) return interrupted(chunks, parts, loaded, total)

    const blob = new Blob([...chunks, ...parts], {
      type: res.headers.get('content-type') || 'application/octet-stream'
    })
    const done: ResumableOutcome = { blob, loaded, total: total || loaded }
    opts.onProgress?.(done.loaded, done.total)
    return { code: 200, msg: 'success', data: done }
  }

  return { code: 500, msg: '下载失败：分片起点无效', data: { loaded, total } }
}
