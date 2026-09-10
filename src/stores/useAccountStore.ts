import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as accountApi from '@/api/githubAccount'
import type { GitHubAccount, AccountStatus } from '@/api/githubAccount'
import { decryptPAT } from '@/utils/crypto'
import { textDownload } from '@/utils/platform'

const ACTIVE_KEY = 'gitgreen_active_account'

/**
 * 多账号常驻状态管理：
 * 所有账号凭证 AES-256-CBC 本地加密存储，多账号并行常驻、点击即切换、无登出操作。
 */
export const useAccountStore = defineStore('account', () => {
  const accounts = ref<GitHubAccount[]>([])
  const activeId = ref<string>('')
  const checking = ref(false)

  const activeAccount = computed(() => accounts.value.find(a => a.id === activeId.value) || null)

  function reload() {
    accounts.value = accountApi.getLocalAccountList()
    const saved = localStorage.getItem(ACTIVE_KEY)
    if (saved && accounts.value.some(a => a.id === saved)) activeId.value = saved
    else if (!accounts.value.some(a => a.id === activeId.value)) activeId.value = accounts.value[0]?.id || ''
  }

  /** 获取解密后的当前账号 PAT（仅在内存中使用，绝不外传） */
  async function getPat(accountId?: string): Promise<string> {
    const acc = accounts.value.find(a => a.id === (accountId || activeId.value))
    if (!acc) {
      ElMessage.warning('请先在账号管理中添加GitHub账号')
      return ''
    }
    return await decryptPAT(acc.encryptedPat)
  }

  function switchAccount(id: string) {
    activeId.value = id
    localStorage.setItem(ACTIVE_KEY, id)
  }

  async function addAccount(pat: string, remark: string, tags: string[], group: string): Promise<boolean> {
    const res = await accountApi.addAccount(pat, remark, tags, group)
    if (res.code === 200) {
      reload()
      ElMessage.success('账号添加成功，已本地加密常驻')
      return true
    }
    ElMessage.error(res.msg)
    return false
  }

  function editAccount(id: string, patch: Partial<Pick<GitHubAccount, 'remark' | 'tags' | 'group'>>) {
    const res = accountApi.editAccount(id, patch)
    if (res.code === 200) {
      reload()
      ElMessage.success('账号信息已更新')
    } else {
      ElMessage.error(res.msg)
    }
  }

  function deleteAccount(id: string) {
    const res = accountApi.deleteAccount(id)
    if (res.code === 200) {
      if (activeId.value === id) {
        activeId.value = ''
        localStorage.removeItem(ACTIVE_KEY)
      }
      reload()
      ElMessage.success('账号已删除')
    } else {
      ElMessage.error(res.msg)
    }
  }

  /** 账号状态检测：正常 / 过期 / 失效 */
  async function refreshStatus(acc: GitHubAccount): Promise<AccountStatus> {
    try {
      const pat = await decryptPAT(acc.encryptedPat)
      const res = await accountApi.verifyPat(pat)
      let status: AccountStatus
      if (res.code === 200) status = 'normal'
      else if (res.code === 401) status = res.data?.status === 'expired' ? 'expired' : 'invalid'
      else status = acc.status
      accountApi.setAccountStatus(acc.id, status)
      reload()
      return status
    } catch {
      return acc.status
    }
  }

  /** 检测全部账号，Token失效自动弹窗提示 */
  async function checkAll(showTip = true) {
    if (checking.value || accounts.value.length === 0) return
    checking.value = true
    const failed: string[] = []
    for (const acc of accounts.value) {
      const status = await refreshStatus(acc)
      if (status !== 'normal') failed.push(`${acc.username}（${status === 'expired' ? '已过期' : '已失效'}）`)
    }
    checking.value = false
    if (showTip && failed.length > 0) {
      ElMessageBox.alert(`以下账号的Token已失效，请重新配置：\n${failed.join('\n')}`, 'Token失效提醒', {
        type: 'warning',
        confirmButtonText: '知道了'
      })
    } else if (showTip) {
      ElMessage.success('全部账号状态正常')
    }
  }

  /** 导出加密账号配置备份 */
  function exportConfig() {
    if (accounts.value.length === 0) {
      ElMessage.warning('暂无账号可导出')
      return
    }
    textDownload(accountApi.exportAccounts(), `gitgreen-accounts-${Date.now()}.json`)
    ElMessage.success('账号配置已导出（PAT为AES密文）')
  }

  /** 导入账号配置备份 */
  async function importConfig(json: string) {
    const res = accountApi.importAccounts(json)
    if (res.code === 200) {
      reload()
      ElMessage.success(res.msg)
    } else {
      ElMessage.error(res.msg)
    }
  }

  reload()
  return {
    accounts,
    activeId,
    activeAccount,
    checking,
    reload,
    getPat,
    switchAccount,
    addAccount,
    editAccount,
    deleteAccount,
    refreshStatus,
    checkAll,
    exportConfig,
    importConfig
  }
})
