import axios from 'axios'
import service, { auth, type ApiResult } from './request'
import { encryptPAT } from '@/utils/crypto'

/** 账号状态：正常 / 过期 / 失效 */
export type AccountStatus = 'normal' | 'expired' | 'invalid'

export interface GitHubAccount {
  id: string
  username: string
  avatarUrl: string
  remark: string
  tags: string[]
  group: string
  /** AES-256-CBC 加密后的 PAT，仅本地存储 */
  encryptedPat: string
  status: AccountStatus
  createdAt: number
}

export interface GitHubUserInfo {
  login: string
  avatar_url: string
  name: string
}

const ACCOUNTS_KEY = 'gitgreen_accounts'

/** 校验 PAT 有效性，并区分 过期 / 失效 */
export async function verifyPat(
  token: string
): Promise<ApiResult<{ status: AccountStatus } & Partial<GitHubUserInfo>>> {
  const res = (await service.get('/user', { headers: auth(token) })) as unknown as ApiResult<GitHubUserInfo>
  if (res.code === 200) {
    return { code: 200, msg: 'success', data: { ...res.data!, status: 'normal' } }
  }
  if (res.code === 401) {
    let status: AccountStatus = 'invalid'
    try {
      await axios.get('https://api.github.com/user', { headers: auth(token) })
    } catch (e: any) {
      if (/expired/i.test(String(e?.response?.data?.message || ''))) status = 'expired'
    }
    return { code: 401, msg: status === 'expired' ? 'Token已过期' : 'Token失效', data: { status } }
  }
  return { code: res.code, msg: res.msg }
}

/** 读取本地账号列表（全部本地持久化，不上传任何服务器） */
export function getLocalAccountList(): GitHubAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]') as GitHubAccount[]
  } catch {
    return []
  }
}

function saveLocalAccountList(list: GitHubAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list))
}

/** 新增 GitHub 账号：先校验 PAT，再 AES 加密本地存储 */
export async function addAccount(
  pat: string,
  remark: string,
  tags: string[],
  group: string
): Promise<ApiResult<GitHubAccount>> {
  const v = await verifyPat(pat)
  if (v.code !== 200 || !v.data?.login) return { code: v.code, msg: v.msg }
  const list = getLocalAccountList()
  if (list.some(a => a.username === v.data!.login)) return { code: 500, msg: '该GitHub账号已存在' }
  const account: GitHubAccount = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: v.data.login,
    avatarUrl: v.data.avatar_url || '',
    remark,
    tags,
    group,
    encryptedPat: await encryptPAT(pat),
    status: v.data.status,
    createdAt: Date.now()
  }
  list.push(account)
  saveLocalAccountList(list)
  return { code: 200, msg: 'success', data: account }
}

/** 修改账号备注/标签/分组 */
export function editAccount(
  id: string,
  patch: Partial<Pick<GitHubAccount, 'remark' | 'tags' | 'group'>>
): ApiResult {
  const list = getLocalAccountList()
  const acc = list.find(a => a.id === id)
  if (!acc) return { code: 500, msg: '账号不存在' }
  Object.assign(acc, patch)
  saveLocalAccountList(list)
  return { code: 200, msg: 'success', data: acc }
}

/** 更新账号状态（正常/过期/失效） */
export function setAccountStatus(id: string, status: AccountStatus): ApiResult {
  const list = getLocalAccountList()
  const acc = list.find(a => a.id === id)
  if (!acc) return { code: 500, msg: '账号不存在' }
  acc.status = status
  saveLocalAccountList(list)
  return { code: 200, msg: 'success' }
}

/** 删除账号 */
export function deleteAccount(id: string): ApiResult {
  const list = getLocalAccountList()
  const idx = list.findIndex(a => a.id === id)
  if (idx < 0) return { code: 500, msg: '账号不存在' }
  list.splice(idx, 1)
  saveLocalAccountList(list)
  return { code: 200, msg: 'success' }
}

/** 导出加密账号配置（PAT 密文导出，导入端需同设备解密） */
export function exportAccounts(): string {
  return JSON.stringify({ app: 'GitGreen', version: 1, exportedAt: Date.now(), accounts: getLocalAccountList() }, null, 2)
}

/** 导入账号配置备份 */
export function importAccounts(json: string): ApiResult<number> {
  let parsed: any
  try {
    parsed = JSON.parse(json)
  } catch {
    return { code: 500, msg: '导入文件格式错误' }
  }
  const incoming: GitHubAccount[] = Array.isArray(parsed) ? parsed : parsed?.accounts
  if (!Array.isArray(incoming)) return { code: 500, msg: '导入文件格式错误' }
  const list = getLocalAccountList()
  let count = 0
  for (const acc of incoming) {
    if (!acc?.id || !acc?.username || !acc?.encryptedPat) continue
    if (list.some(a => a.id === acc.id)) continue
    list.push(acc)
    count++
  }
  saveLocalAccountList(list)
  return { code: 200, msg: `成功导入 ${count} 个账号`, data: count }
}
