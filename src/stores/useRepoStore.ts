import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as repoApi from '@/api/githubRepo'
import type { GitHubRepo } from '@/api/githubRepo'
import { useAccountStore } from './useAccountStore'
import { useLogStore } from './useLogStore'

export interface RepoMeta {
  favorite: boolean
  pin: boolean
  group: string
}

const META_KEY = 'gitgreen_repo_meta'
const CURRENT_ACCOUNT_KEY = 'gitgreen_current_account'
const CURRENT_REPO_KEY = 'gitgreen_current_repo'

function loadMeta(): Record<string, RepoMeta> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}')
  } catch {
    return {}
  }
}

/**
 * 仓库全局状态：树形结构 账号→仓库列表、跨账号全局搜索、
 * 收藏/置顶/自定义分组（全部本地持久化）。
 */
export const useRepoStore = defineStore('repo', () => {
  const accountStore = useAccountStore()
  const logStore = useLogStore()

  /** accountId -> repos */
  const reposByAccount = ref<Record<string, GitHubRepo[]>>({})
  const loadingMap = ref<Record<string, boolean>>({})
  const metaMap = ref<Record<string, RepoMeta>>(loadMeta())
  const currentAccountId = ref<string>(localStorage.getItem(CURRENT_ACCOUNT_KEY) || '')
  const currentRepoFullName = ref<string>(localStorage.getItem(CURRENT_REPO_KEY) || '')

  const currentRepos = computed<GitHubRepo[]>(() => reposByAccount.value[currentAccountId.value] || [])

  const currentRepo = computed<GitHubRepo | null>(
    () => currentRepos.value.find(r => r.full_name === currentRepoFullName.value) || null
  )

  /** 全部已加载仓库（用于跨账号全局搜索） */
  const allLoadedRepos = computed(() => {
    const list: { account: string; repo: GitHubRepo }[] = []
    for (const [accountId, repos] of Object.entries(reposByAccount.value)) {
      const acc = accountStore.accounts.find(a => a.id === accountId)
      for (const repo of repos) list.push({ account: acc ? acc.remark || acc.username : accountId, repo })
    }
    return list
  })

  function persistMeta() {
    localStorage.setItem(META_KEY, JSON.stringify(metaMap.value))
  }

  /** 备份还原/重置后重新读取本地收藏分组 */
  function reloadMeta() {
    metaMap.value = loadMeta()
  }

  function getMeta(fullName: string): RepoMeta {
    if (!metaMap.value[fullName]) metaMap.value[fullName] = { favorite: false, pin: false, group: '' }
    return metaMap.value[fullName]
  }

  function toggleFavorite(fullName: string) {
    const m = getMeta(fullName)
    m.favorite = !m.favorite
    persistMeta()
  }

  function togglePin(fullName: string) {
    const m = getMeta(fullName)
    m.pin = !m.pin
    persistMeta()
  }

  function setRepoGroup(fullName: string, group: string) {
    getMeta(fullName).group = group
    persistMeta()
  }

  /** 置顶优先排序 */
  function sortedRepos(repos: GitHubRepo[]): GitHubRepo[] {
    return [...repos].sort((a, b) => Number(getMeta(b.full_name).pin) - Number(getMeta(a.full_name).pin))
  }

  /** 加载指定账号的仓库列表 */
  async function loadRepos(accountId: string, force = false) {
    if (!accountId) return
    if (reposByAccount.value[accountId] && !force) return
    const pat = await accountStore.getPat(accountId)
    if (!pat) return
    loadingMap.value[accountId] = true
    const res = await repoApi.getUserRepos(pat)
    loadingMap.value[accountId] = false
    if (res.code === 200) {
      reposByAccount.value[accountId] = res.data!
      // 恢复持久化的仓库选择；失效（如已删除）则回退到首个仓库
      if (accountId === currentAccountId.value) {
        const saved = localStorage.getItem(CURRENT_REPO_KEY) || ''
        const exists = res.data!.some(r => r.full_name === currentRepoFullName.value)
        if (!exists) {
          if (res.data!.some(r => r.full_name === saved)) currentRepoFullName.value = saved
          else if (res.data!.length > 0) setCurrentRepo(res.data![0].full_name)
          else setCurrentRepo('')
        }
      }
    } else {
      ElMessage.error(`仓库加载失败：${res.msg}`)
      if (res.code === 401) accountStore.checkAll()
    }
  }

  /** 刷新当前账号仓库 */
  async function refreshCurrent() {
    await loadRepos(currentAccountId.value, true)
  }

  function setCurrentAccount(accountId: string) {
    currentAccountId.value = accountId
    localStorage.setItem(CURRENT_ACCOUNT_KEY, accountId)
    accountStore.switchAccount(accountId)
    const saved = localStorage.getItem(CURRENT_REPO_KEY) || ''
    const repos = reposByAccount.value[accountId] || []
    if (saved && repos.some(r => r.full_name === saved)) {
      currentRepoFullName.value = saved
    } else if (repos.length > 0 && !repos.some(r => r.full_name === currentRepoFullName.value)) {
      setCurrentRepo(repos[0].full_name)
    }
    loadRepos(accountId)
  }

  function setCurrentRepo(fullName: string) {
    currentRepoFullName.value = fullName
    localStorage.setItem(CURRENT_REPO_KEY, fullName)
  }

  /** 当前选中仓库的 owner / name */
  function currentOwnerName(): { owner: string; repo: string } | null {
    const r = currentRepo.value
    if (!r) return null
    return { owner: r.owner.login, repo: r.name }
  }

  /** 跨账号全局搜索 */
  function search(keyword: string) {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return []
    return allLoadedRepos.value.filter(
      item =>
        item.repo.name.toLowerCase().includes(kw) ||
        (item.repo.description || '').toLowerCase().includes(kw) ||
        item.repo.full_name.toLowerCase().includes(kw)
    )
  }

  /** 全局搜索仓库所属账号（跨账号搜索结果选中时用于同步切换账号） */
  function findAccountIdByRepo(fullName: string): string | null {
    for (const [accountId, repos] of Object.entries(reposByAccount.value)) {
      if (repos.some(r => r.full_name === fullName)) return accountId
    }
    return null
  }

  /** 选中仓库：自动确保所属账号为当前账号（跨账号搜索场景） */
  function selectRepo(fullName: string) {
    const ownerId = findAccountIdByRepo(fullName)
    if (ownerId && ownerId !== currentAccountId.value) setCurrentAccount(ownerId)
    setCurrentRepo(fullName)
  }

  /** 新建远程仓库 */
  async function createRepo(payload: { name: string; description?: string; private?: boolean }) {
    const pat = await accountStore.getPat(currentAccountId.value)
    if (!pat) return false
    const res = await repoApi.createRepo(pat, payload)
    if (res.code === 200) {
      ElMessage.success('远程仓库创建成功')
      await logStore.write({ module: 'repo', action: '新建远程仓库', detail: `创建仓库 ${payload.name}`, level: 'success' })
      await loadRepos(currentAccountId.value, true)
      return true
    }
    ElMessage.error(`创建失败：${res.msg}`)
    return false
  }

  /** 删除远程仓库（高危操作由页面二次确认后调用） */
  async function deleteRepo(owner: string, repo: string) {
    const pat = await accountStore.getPat(currentAccountId.value)
    if (!pat) return false
    const res = await repoApi.deleteRepo(pat, owner, repo)
    if (res.code === 200) {
      ElMessage.success('远程仓库已删除')
      await logStore.write({ module: 'repo', action: '删除远程仓库', detail: `删除仓库 ${owner}/${repo}`, level: 'warning' })
      await loadRepos(currentAccountId.value, true)
      return true
    }
    ElMessage.error(`删除失败：${res.msg}`)
    return false
  }

  return {
    reposByAccount,
    loadingMap,
    metaMap,
    currentAccountId,
    currentRepoFullName,
    currentRepos,
    currentRepo,
    allLoadedRepos,
    getMeta,
    toggleFavorite,
    togglePin,
    setRepoGroup,
    sortedRepos,
    loadRepos,
    refreshCurrent,
    setCurrentAccount,
    setCurrentRepo,
    selectRepo,
    findAccountIdByRepo,
    currentOwnerName,
    search,
    createRepo,
    deleteRepo,
    reloadMeta
  }
})
