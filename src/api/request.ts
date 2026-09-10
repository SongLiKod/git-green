import axios from 'axios'
const service = axios.create({
  baseURL: 'https://api.github.com',
  timeout: 30000
})

service.interceptors.request.use(config => {
  return config
})

service.interceptors.response.use(
  res => ({ code: 200, msg: 'success', data: res.data }) as any,
  err => {
    const c = err.response?.status
    if (c === 401) return { code: 401, msg: 'Token失效' }
    if (c === 403) return { code: 403, msg: '请求限流或权限不足' }
    return { code: 500, msg: '请求异常' }
  }
)

/** API 统一返回结构：200成功 / 401 Token失效 / 403 限流或权限不足 / 500 网络服务异常 */
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
