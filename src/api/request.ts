import axios from 'axios'

/** 请求性能运行时配置（由设置页 useSettingsStore.applyRuntime 写入） */
export const requestRuntime = {
  /** 单次请求超时（毫秒） */
  timeout: 30000,
  /** 失败重试次数（429/5xx/网络错误时指数退避重试） */
  retryTimes: 0,
  /** 最大并发请求数 */
  concurrency: 4
}

/** 并发门闩：超过上限的请求排队等待，避免触发 GitHub 限流 */
let activeCount = 0
const waiters: (() => void)[] = []

async function acquire(): Promise<void> {
  if (activeCount < requestRuntime.concurrency) {
    activeCount++
    return
  }
  await new Promise<void>(resolve => waiters.push(resolve))
  activeCount++
}

function release(): void {
  activeCount--
  const next = waiters.shift()
  if (next) next()
}

const service = axios.create({
  baseURL: 'https://api.github.com',
  timeout: 30000
})

service.interceptors.request.use(async config => {
  await acquire()
  ;(config as any).__gated = true
  return config
})

service.interceptors.response.use(
  res => {
    if ((res.config as any).__gated) release()
    return { code: 200, msg: 'success', data: res.data } as any
  },
  async err => {
    if (err.config?.__gated) release()
    const cfg = err.config
    const status = err.response?.status
    const rateLimited = status === 403 && err.response?.headers?.['x-ratelimit-remaining'] === '0'
    const retryable = !err.response || status >= 500 || rateLimited
    if (cfg && retryable && requestRuntime.retryTimes > 0) {
      cfg.__retry = (cfg.__retry || 0) + 1
      if (cfg.__retry <= requestRuntime.retryTimes) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, cfg.__retry - 1)))
        return service(cfg)
      }
    }
    const c = err.response?.status
    const d = err.response?.data
    let detail = typeof d?.message === 'string' ? d.message : ''
    const subErrors = Array.isArray(d?.errors) ? d.errors.map((e: any) => e?.message).filter(Boolean) : []
    if (subErrors.length) detail = subErrors.join('；')
    const withDetail = (msg: string) => (detail && detail !== 'Unprocessable Entity' ? `${msg}：${detail}` : msg)
    if (c === 401) return { code: 401, msg: withDetail('Token失效') }
    if (c === 403) return { code: 403, msg: withDetail('请求限流或权限不足') }
    if (c === 422) return { code: 422, msg: withDetail('请求参数或操作状态不合法') }
    if (detail && detail !== 'Unprocessable Entity') return { code: 500, msg: detail }
    const netMsg = typeof err.message === 'string' && err.message ? err.message : ''
    if (netMsg && netMsg !== 'Request failed with status code undefined') return { code: 500, msg: netMsg }
    return { code: 500, msg: '请求异常' }
  }
)

/** API 统一返回结构：200成功 / 401 Token失效 / 403 限流或权限不足 / 422 参数或状态不合法 / 500 网络服务异常 */
export interface ApiResult<T = any> {
  code: number
  msg: string
  data?: T
}

/** PAT 认证头 */
export function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

/** 路径分段编码（分支名/文件路径含斜杠与特殊字符时安全） */
export function encPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export default service
