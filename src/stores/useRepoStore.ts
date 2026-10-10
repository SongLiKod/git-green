import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as repoApi from '@/api/githubRepo'
import type { GitHubRepo } from '@/api/githubRepo'
import * as forkApi from '@/api/githubFork'
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
const ADHOC_KEY = 'gitgreen_adhoc_repos'
const PREVIEW_KEY = 'gitgreen_preview_repo'

function loadMeta(): Record<string, RepoMeta> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}')
  } catch {
    return {}
  }
}

function loadAdHoc(): Record<string, GitHubRepo[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(ADHOC_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

/** 搜索结果「进入查看」的预览仓库：只作当前仓库上下文，不进任何列表 */
function loadPreview(): GitHubRepo | null {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY)
    const repo = raw ? JSON.parse(raw) : null
    return repo && typeof repo.full_name === 'string' ? (repo as GitHubRepo) : null
  } catch {
    return null
  }
}

/**
 * 仓库全局状态：树形结构 账号→仓库列表、跨账号全局搜索、
 * 收藏/置顶/自定义分组（全部本地持久化）。
 * 另含两个独立维度：
 * - 外部列表（adHocRepos）：搜索结果/「打开链接」手动加入的账号外仓库；
 * - 预览仓库（previewRepo）：搜索结果「进入查看」的临时上下文，不进任何列表。
 */
export const useRepoStore = defineStore('repo', () => {
  const accountStore = useAccountStore()
  const logStore = useLogStore()

  /** accountId -> repos */
  const reposByAccount = ref<Record<string, GitHubRepo[]>>({})
  /** 「打开链接」「加入外部列表」接入的外部仓库（非拥有/协作）：accountId -> repos，本地持久化 */
  const adHocRepos = ref<Record<string, GitHubRepo[]>>(loadAdHoc())
  /** 搜索结果「进入查看」的预览仓库：仅作为当前仓库上下文，不写入任何列表 */
  const previewRepo = ref<GitHubRepo | null>(loadPreview())
  const loadingMap = ref<Record<string, boolean>>({})
  const metaMap = ref<Record<string, RepoMeta>>(loadMeta())
  const currentAccountId = ref<string>(localStorage.getItem(CURRENT_ACCOUNT_KEY) || '')
  /** 当前选中仓库（预览态兜底见 currentRepo） */
  const currentRepoFullName = ref<string>(localStorage.getItem(CURRENT_REPO_KEY) || '')
  /**
   * GitHub 全站搜索模式开关：由 App 顶栏「GitHub搜索」入口与仓库列表页分段选择器共同驱动，
   * 提升可发现性（顶栏任意页面一键进入搜索态）。
   */
  const githubSearchMode = ref(false)

  const currentRepos = computed<GitHubRepo[]>(() => reposByAccount.value[currentAccountId.value] || [])

  const currentRepo = computed<GitHubRepo | null>(() => {
    const inList = currentRepos.value.find(r => r.full_name === currentRepoFullName.value)
    if (inList) return inList
    // 预览仓库（搜索结果「进入查看」）不在任何列表中，单独兜底解析
    const p = previewRepo.value
    return p && p.full_name === currentRepoFullName.value ? p : null
  })

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

  function persistAdHoc() {
    localStorage.setItem(ADHOC_KEY, JSON.stringify(adHocRepos.value))
  }

  function persistPreview() {
    if (previewRepo.value) localStorage.setItem(PREVIEW_KEY, JSON.stringify(previewRepo.value))
    else localStorage.removeItem(PREVIEW_KEY)
  }

  /** 当前上下文是否为「进入查看」的预览仓库（不在任何列表中） */
  function isPreviewRepo(fullName: string): boolean {
    return !!previewRepo.value && previewRepo.value.full_name === fullName
  }

  /**
   * 搜索结果「进入查看」：把仓库设为当前上下文供各功能页使用，
   * 不写入账号列表、也不写入外部列表（只有点击「加入外部」才会写入）。
   */
  function enterPreviewRepo(repo: GitHubRepo) {
    previewRepo.value = repo
    setCurrentRepo(repo.full_name)
    persistPreview()
  }

  /** 是否为「打开链接」临时接入的外部仓库（任意账号维度） */
  function isAdHocRepo(fullName: string): boolean {
    return Object.values(adHocRepos.value).some(list => (list || []).some(r => r.full_name === fullName))
  }

  /** 从本地移除外部仓库（仅清理本地注入，不触碰远程数据） */
  async function removeAdHocRepo(fullName: string): Promise<boolean> {
    let hit = false
    for (const [accountId, list] of Object.entries(adHocRepos.value)) {
      if (!list?.some(r => r.full_name === fullName)) continue
      hit = true
      adHocRepos.value[accountId] = list.filter(r => r.full_name !== fullName)
      const repos = reposByAccount.value[accountId]
      if (repos) {
        const rest = repos.filter(r => r.full_name !== fullName)
        reposByAccount.value[accountId] = rest
        if (accountId === currentAccountId.value && currentRepoFullName.value === fullName) {
          setCurrentRepo(rest[0]?.full_name || '')
        }
      }
    }
    if (!hit) return false
    persistAdHoc()
    await logStore.write({ module: 'repo', action: '移除外部仓库', detail: fullName, level: 'warning' })
    return true
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
      const fresh = res.data!
      const adHocSaved = adHocRepos.value[accountId] || []
      const adhoc = adHocSaved.filter(a => !fresh.some(r => r.full_name === a.full_name))
      if (adhoc.length !== adHocSaved.length) {
        adHocRepos.value[accountId] = adhoc
        persistAdHoc()
      }
      reposByAccount.value[accountId] = [...fresh, ...adhoc]
      // 恢复持久化的仓库选择；失效（如已删除）则回退到首个仓库
      if (accountId === currentAccountId.value) {
        const saved = localStorage.getItem(CURRENT_REPO_KEY) || ''
        const list = reposByAccount.value[accountId]
        const exists = list.some(r => r.full_name === currentRepoFullName.value)
        // 预览仓库（搜索结果「进入查看」）本就不在列表里，保持其选中状态不被回退
        const previewing = isPreviewRepo(currentRepoFullName.value)
        if (!exists && !previewing) {
          if (list.some(r => r.full_name === saved)) currentRepoFullName.value = saved
          else if (list.length > 0) setCurrentRepo(list[0].full_name)
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
    } else if (
      repos.length > 0 &&
      !repos.some(r => r.full_name === currentRepoFullName.value) &&
      // 预览仓库正被查看时保持上下文，不回退到列表首个仓库
      !isPreviewRepo(currentRepoFullName.value)
    ) {
      setCurrentRepo(repos[0].full_name)
    }
    loadRepos(accountId)
  }

  function setCurrentRepo(fullName: string) {
    // 选中列表内（或其它）仓库时退出预览态，避免旧预览残留
    if (previewRepo.value && previewRepo.value.full_name !== fullName) {
      previewRepo.value = null
      persistPreview()
    }
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

  /** 把仓库注入指定账号列表并登记为「外部」（纯本地持久化，不触碰远程） */
  function injectAdHoc(accountId: string, repo: GitHubRepo) {
    const list = reposByAccount.value[accountId] || []
    if (!list.some(r => r.full_name === repo.full_name)) reposByAccount.value[accountId] = [...list, repo]
    const saved = adHocRepos.value[accountId] || []
    if (!saved.some(r => r.full_name === repo.full_name)) {
      adHocRepos.value[accountId] = [repo, ...saved]
      persistAdHoc()
    }
  }

  /**
   * 搜索结果「加入外部列表」：只有点击这里，仓库才会写入外部列表并带「外部」标记。
   * 与「进入查看」互不影响——查看不落库，加入才落库。
   */
  async function addAdHocRepo(repo: GitHubRepo): Promise<boolean> {
    const accountId = currentAccountId.value
    if (!accountId) {
      ElMessage.warning('请先在账号管理中添加GitHub账号')
      return false
    }
    if (findAccountIdByRepo(repo.full_name)) {
      ElMessage.info(`${repo.full_name} 已在仓库列表中`)
      return true
    }
    injectAdHoc(accountId, repo)
    // 加入列表后该仓库不再需要预览态兜底（同名预览清理，上下文由列表接管）
    if (isPreviewRepo(repo.full_name)) {
      previewRepo.value = null
      persistPreview()
    }
    await logStore.write({ module: 'repo', action: '加入外部列表', detail: repo.full_name })
    ElMessage.success(`已加入外部列表：${repo.full_name}`)
    return true
  }

  /** 打开非本账号列表的 GitHub 仓库（「打开链接」入口）：拉取元数据注入当前账号列表并选中，本地持久化 */
  async function openExternalRepo(owner: string, repo: string): Promise<boolean> {
    const accountId = currentAccountId.value
    if (!accountId) {
      ElMessage.warning('请先在账号管理中添加GitHub账号')
      return false
    }
    const fullName = `${owner}/${repo}`
    const pat = await accountStore.getPat(accountId)
    if (!pat) return false
    const res = await repoApi.getRepoSetting(pat, owner, repo)
    if (res.code !== 200 || !res.data) {
      ElMessage.error(`仓库获取失败（不存在或无权访问）：${res.msg}`)
      return false
    }
    injectAdHoc(accountId, res.data)
    setCurrentRepo(fullName)
    await logStore.write({ module: 'repo', action: '打开外部仓库', detail: fullName })
    return true
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

  /** 等待新仓库在 GitHub 侧就绪（fork 为异步操作，最多等 60s） */
  async function waitRepoReady(
    accountId: string,
    owner: string,
    name: string,
    timeoutMs = 60000
  ): Promise<boolean> {
    const pat = await accountStore.getPat(accountId)
    if (!pat) return false
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const res = await repoApi.getRepoSetting(pat, owner, name)
      if (res.code === 200) return true
      if (Date.now() >= deadline) return false
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  /**
   * Fork 仓库到指定账号（可改名 / Fork 到组织 / 仅默认分支）。
   * GitHub 的 Fork 是异步操作：创建提交后轮询目标仓库就绪，成功自动切到目标账号并选中新仓库。
   * 返回新仓库 full_name，失败返回空串。
   */
  async function forkRepo(payload: {
    sourceOwner: string
    sourceRepo: string
    accountId: string
    name?: string
    organization?: string
    defaultBranchOnly?: boolean
  }): Promise<string> {
    const targetAcc = accountStore.accounts.find(a => a.id === payload.accountId)
    if (!targetAcc) {
      ElMessage.warning('请选择目标账号')
      return ''
    }
    const pat = await accountStore.getPat(payload.accountId)
    if (!pat) return ''
    const repoName = (payload.name || '').trim() || payload.sourceRepo
    const res = await forkApi.createFork(pat, payload.sourceOwner, payload.sourceRepo, {
      name: payload.name?.trim() || undefined,
      organization: payload.organization?.trim() || undefined,
      default_branch_only: payload.defaultBranchOnly || undefined
    })
    if (res.code !== 200) {
      const hint =
        res.code === 404
          ? '源仓库不存在或目标账号无读取权限'
          : res.code === 403
            ? '目标账号权限不足或源仓库禁止 Fork'
            : res.code === 422
              ? `参数不合法或已存在同名 Fork（${res.msg}）`
              : res.msg
      ElMessage.error(`Fork 失败：${hint}`)
      await logStore.write({
        module: 'repo',
        action: 'Fork仓库失败',
        detail: `${payload.sourceOwner}/${payload.sourceRepo} → @${targetAcc.username}：${hint}`,
        level: 'error'
      })
      return ''
    }
    const owner = payload.organization?.trim() || targetAcc.username
    const fullName = `${owner}/${repoName}`
    ElMessage.info('Fork 已提交，GitHub 正在异步创建，等待仓库就绪…')
    const ready = await waitRepoReady(payload.accountId, owner, repoName)
    if (!ready) {
      ElMessage.warning('Fork 创建已提交，但仓库尚未就绪，请稍后点击「刷新仓库」查看')
      await logStore.write({
        module: 'repo',
        action: 'Fork仓库',
        detail: `${payload.sourceOwner}/${payload.sourceRepo} → ${fullName}（已提交，尚未就绪）`,
        level: 'warning'
      })
      return ''
    }
    await loadRepos(payload.accountId, true)
    if (payload.accountId !== currentAccountId.value) setCurrentAccount(payload.accountId)
    setCurrentRepo(fullName)
    ElMessage.success(`Fork 成功：${fullName}`)
    await logStore.write({
      module: 'repo',
      action: 'Fork仓库',
      detail: `${payload.sourceOwner}/${payload.sourceRepo} → ${fullName}（@${targetAcc.username}）`,
      level: 'success'
    })
    return fullName
  }

  return {
    reposByAccount,
    adHocRepos,
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
    openExternalRepo,
    addAdHocRepo,
    isAdHocRepo,
    removeAdHocRepo,
    previewRepo,
    isPreviewRepo,
    enterPreviewRepo,
    githubSearchMode,
    findAccountIdByRepo,
    currentOwnerName,
    search,
    createRepo,
    forkRepo,
    deleteRepo,
    reloadMeta
  }
})
