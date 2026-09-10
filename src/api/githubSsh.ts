import service, { auth, type ApiResult } from './request'

export interface SshKey {
  id: number
  key: string
  title: string
  created_at: string
  verified: boolean
  read_only: boolean
}

/** 当前账号 SSH 公钥列表 */
export function listSshKeys(token: string): Promise<ApiResult<SshKey[]>> {
  return service.get('/user/keys?per_page=100', { headers: auth(token) }) as unknown as Promise<ApiResult<SshKey[]>>
}

/** 添加 SSH 公钥 */
export function createSshKey(token: string, title: string, key: string): Promise<ApiResult<SshKey>> {
  return service.post('/user/keys', { title, key }, { headers: auth(token) }) as unknown as Promise<ApiResult<SshKey>>
}

/** 删除 SSH 公钥 */
export function deleteSshKey(token: string, keyId: number): Promise<ApiResult> {
  return service.delete(`/user/keys/${keyId}`, { headers: auth(token) }) as unknown as Promise<ApiResult>
}