<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <van-search v-model="searchKw" placeholder="跨账号全局搜索仓库" shape="round" />
      <van-tabs v-model:active="accountTabIndex" shrink>
        <van-tab v-for="acc in accountStore.accounts" :key="acc.id" :title="acc.remark || acc.username" />
      </van-tabs>
      <div class="m-toolbar">
        <van-button type="primary" size="small" @click="createVisible = true">新建远程仓库</van-button>
        <van-button size="small" :loading="loading" @click="repoStore.refreshCurrent()">刷新</van-button>
        <van-button size="small" plain :type="onlyFavorite ? 'warning' : 'default'" @click="onlyFavorite = !onlyFavorite">
          {{ onlyFavorite ? '看全部' : '只看收藏' }}
        </van-button>
      </div>
      <van-empty v-if="displayRepos.length === 0" description="暂无仓库" />
      <div v-for="r in displayRepos" :key="r.full_name" class="m-card" @click="openSheet(r)">
        <div class="m-card-head">
          <div class="m-card-title">
            <div class="t">
              <span v-if="repoStore.getMeta(r.full_name).pin" style="color: var(--color-primary)">★ </span>{{ r.name }}
            </div>
            <div class="m-sub">{{ r.description || '暂无简介' }}</div>
          </div>
          <van-tag :type="r.private ? 'warning' : 'success'">{{ r.private ? '私有' : '公开' }}</van-tag>
        </div>
        <div class="m-meta">
          <span>{{ r.language || '-' }}</span>
          <span>★ {{ r.stargazers_count }}</span>
          <span>Fork {{ r.forks_count }}</span>
          <span>{{ new Date(r.updated_at).toLocaleDateString() }}</span>
        </div>
        <div class="m-actions" @click.stop>
          <van-button size="mini" :type="repoStore.getMeta(r.full_name).favorite ? 'warning' : 'default'" plain @click="repoStore.toggleFavorite(r.full_name)">
            {{ repoStore.getMeta(r.full_name).favorite ? '取消收藏' : '收藏' }}
          </van-button>
          <van-button size="mini" :type="repoStore.getMeta(r.full_name).pin ? 'primary' : 'default'" plain @click="repoStore.togglePin(r.full_name)">
            {{ repoStore.getMeta(r.full_name).pin ? '取消置顶' : '置顶' }}
          </van-button>
          <van-button size="mini" type="primary" plain @click="enterRepo(r)">进入</van-button>
          <van-button size="mini" plain @click="openClone(r)">克隆</van-button>
          <van-button size="mini" type="danger" plain @click="onDeleteRepo(r)">删除</van-button>
        </div>
      </div>

      <van-action-sheet
        v-model:show="sheetVisible"
        :actions="sheetActions"
        cancel-text="取消"
        close-on-click-action
        @select="onSheetSelect"
      />

      <van-popup v-model:show="createVisible" position="bottom" round>
        <div class="m-popup">
          <div class="m-popup-title">新建远程仓库</div>
          <van-cell-group inset>
            <van-field v-model="createForm.name" label="仓库名" placeholder="my-repo" required />
            <van-field v-model="createForm.description" label="简介" />
            <van-cell title="私有仓库">
              <template #value><van-switch v-model="createForm.private" size="20" /></template>
            </van-cell>
          </van-cell-group>
          <van-button block type="primary" style="margin-top: 14px" @click="submitCreate">创建</van-button>
        </div>
      </van-popup>

      <van-popup v-model:show="cloneVisible" position="bottom" round>
        <div class="m-popup">
          <div class="m-popup-title">克隆 {{ cloneRepo?.name || '' }}</div>
          <van-cell-group inset>
            <van-cell title="HTTPS" :label="cloneRepo ? cloneUrls(cloneRepo).https : ''" :is-link="false" />
            <template v-if="cloneRepo && isCustomHost(cloneRepo)">
              <van-cell title="SSH" :label="cloneUrls(cloneRepo).ssh" :is-link="false" />
              <van-cell title="默认SSH" :label="defaultSshUrl(cloneRepo)" :is-link="false" />
            </template>
            <van-cell v-else title="SSH" :label="cloneRepo ? cloneUrls(cloneRepo).ssh : ''" :is-link="false" />
          </van-cell-group>
          <div class="m-actions">
            <van-button block plain @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).https : '')">复制 HTTPS</van-button>
            <template v-if="cloneRepo && isCustomHost(cloneRepo)">
              <van-button block plain @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).ssh : '')">复制 SSH</van-button>
              <van-button block plain @click="copyClone(cloneRepo ? defaultSshUrl(cloneRepo) : '')">复制 默认SSH</van-button>
            </template>
            <van-button v-else block plain @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).ssh : '')">复制 SSH</van-button>
          </div>
          <div class="m-sub" style="margin: 10px 16px">配置了自定义 SSH 主机时才显示两个 SSH 地址</div>
        </div>
      </van-popup>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
    <div class="page-toolbar">
      <el-input
        v-model="searchKw"
        placeholder="跨账号全局搜索仓库（名称/简介）"
        clearable
        style="width: 320px"
      />
      <el-button type="primary" @click="createVisible = true">新建远程仓库</el-button>
      <el-button :loading="loading" @click="repoStore.refreshCurrent()">刷新仓库</el-button>
    </div>

    <el-row :gutter="14">
      <!-- 树形结构：账号 → 仓库列表 -->
      <el-col :span="6">
        <el-card shadow="never" class="tree-card">
          <template #header>账号仓库树</template>
          <el-tree
            :data="treeData"
            node-key="key"
            :expand-on-click-node="false"
            highlight-current
            @node-click="onNodeClick"
          >
            <template #default="{ data }">
              <span class="tree-node" :class="{ active: data.key === currentKey }">
                <span v-if="data.isAccount" class="tree-account">●</span>
                {{ data.label }}
                <el-tag v-if="data.isAccount && data.id === accountStore.activeId" size="small" type="success">当前</el-tag>
              </span>
            </template>
          </el-tree>
          <el-empty v-if="accountStore.accounts.length === 0" description="请先添加账号" :image-size="60" />
        </el-card>
      </el-col>

      <!-- 仓库信息列表 -->
      <el-col :span="18">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ searchKw ? `全局搜索：${searchKw}` : accountTitle }}</span>
              <el-checkbox v-model="onlyFavorite">只看收藏</el-checkbox>
            </div>
          </template>
          <el-table :data="displayRepos" border stripe v-loading="loading" max-height="480">
            <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
            <el-table-column label="仓库" min-width="200">
              <template #default="{ row }">
                <div class="repo-name">
                  <el-icon v-if="repoStore.getMeta(row.full_name).pin" color="var(--color-primary)">★</el-icon>
                  <span class="link-text" @click="selectRepo(row)">{{ row.full_name }}</span>
                  <el-tag size="small" :type="row.private ? 'warning' : 'success'">{{ row.private ? '私有' : '公开' }}</el-tag>
                  <el-tag v-if="row.archived" size="small" type="info">已归档</el-tag>
                </div>
                <div class="repo-desc">{{ row.description || '暂无简介' }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="language" label="语言" width="100" />
            <el-table-column label="Stars" width="80">
              <template #default="{ row }">{{ row.stargazers_count }}</template>
            </el-table-column>
            <el-table-column label="Forks" width="80">
              <template #default="{ row }">{{ row.forks_count }}</template>
            </el-table-column>
            <el-table-column label="分组" width="110">
              <template #default="{ row }">
                <el-select
                  :model-value="repoStore.getMeta(row.full_name).group"
                  size="small"
                  placeholder="未分组"
                  @update:model-value="(v: string) => repoStore.setRepoGroup(row.full_name, v)"
                >
                  <el-option v-for="g in repoGroups" :key="g" :label="g" :value="g" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="160">
              <template #default="{ row }">{{ new Date(row.updated_at).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="300" fixed="right">
              <template #default="{ row }">
                <el-button link :type="repoStore.getMeta(row.full_name).favorite ? 'warning' : ''" @click="repoStore.toggleFavorite(row.full_name)">
                  {{ repoStore.getMeta(row.full_name).favorite ? '取消收藏' : '收藏' }}
                </el-button>
                <el-button link :type="repoStore.getMeta(row.full_name).pin ? 'primary' : ''" @click="repoStore.togglePin(row.full_name)">
                  {{ repoStore.getMeta(row.full_name).pin ? '取消置顶' : '置顶' }}
                </el-button>
                <el-button link type="primary" @click="openClone(row)">克隆</el-button>
                <el-button link @click="selectRepo(row)">进入</el-button>
                <el-button link type="danger" @click="onDeleteRepo(row)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <span class="empty-text">暂无仓库，请从左侧选择账号或点击「新建远程仓库」</span>
            </template>
          </el-table>
        </el-card>

        <!-- 本地Git能力：仅 Windows 客户端（Electron）开放 -->
        <el-card v-if="isWindows" shadow="never" class="git-card">
          <template #header>本地 Git（Windows 客户端独有）</template>
          <el-alert v-if="!repoStore.currentRepo" type="info" :closable="false" title="请先在上方选择仓库" />
          <template v-else>
            <div class="git-toolbar">
              <el-input v-model="gitDir" placeholder="本地目录（留空则克隆到当前工作目录）" style="width: 300px" />
              <el-select v-model="gitBranch" placeholder="切换分支" style="width: 180px">
                <el-option v-for="b in branchOptions" :key="b" :label="b" :value="b" />
              </el-select>
              <el-button type="primary" :loading="gitRunning" @click="runGit(['clone', '', gitTarget()], '克隆')">克隆</el-button>
              <el-button :loading="gitRunning" @click="runGit(['pull'])">Pull</el-button>
              <el-button :loading="gitRunning" @click="runGit(['push'])">Push</el-button>
              <el-button :loading="gitRunning" :disabled="!gitBranch" @click="runGit(['checkout', gitBranch])">分支切换</el-button>
              <el-button :loading="gitRunning" @click="runGit(['status', '--short'])">状态</el-button>
            </div>
            <pre class="git-output">{{ gitOutput || 'Git 命令输出将显示在这里（软件内闭环执行，不跳转任何外部程序）' }}</pre>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="createVisible" title="新建远程仓库" width="460px">
      <el-form label-width="80px">
        <el-form-item label="仓库名" required>
          <el-input v-model="createForm.name" placeholder="my-repo" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="createForm.description" />
        </el-form-item>
        <el-form-item label="可见性">
          <el-radio-group v-model="createForm.private">
            <el-radio :value="false">公开</el-radio>
            <el-radio :value="true">私有</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="cloneVisible" :title="`克隆 ${cloneRepo?.full_name || ''}`" width="560px">
      <div class="clone-row">
        <span class="clone-label">HTTPS</span>
        <el-input :model-value="cloneRepo ? cloneUrls(cloneRepo).https : ''" readonly />
        <el-button @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).https : '')">复制</el-button>
      </div>
      <template v-if="cloneRepo && isCustomHost(cloneRepo)">
        <div class="clone-row">
          <span class="clone-label">SSH</span>
          <el-input :model-value="cloneRepo ? cloneUrls(cloneRepo).ssh : ''" readonly />
          <el-button @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).ssh : '')">复制</el-button>
        </div>
        <div class="clone-row">
          <span class="clone-label">默认SSH</span>
          <el-input :model-value="cloneRepo ? defaultSshUrl(cloneRepo) : ''" readonly />
          <el-button @click="copyClone(cloneRepo ? defaultSshUrl(cloneRepo) : '')">复制</el-button>
        </div>
      </template>
      <div v-else class="clone-row">
        <span class="clone-label">SSH</span>
        <el-input :model-value="cloneRepo ? cloneUrls(cloneRepo).ssh : ''" readonly />
        <el-button @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).ssh : '')">复制</el-button>
      </div>
      <div class="form-tip">SSH 使用账号自定义主机（账号管理里可修改）；配置了自定义主机时才额外展示 默认SSH 地址</div>
    </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'RepoList' })
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { GitHubRepo } from '@/api/githubRepo'
import { getBranches } from '@/api/githubBranch'
import { isWindowsClient, useIsMobile } from '@/utils/platform'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const isWindows = isWindowsClient()
const isMobile = useIsMobile()
const router = useRouter()

const searchKw = ref('')
const onlyFavorite = ref(false)
const createVisible = ref(false)
const createForm = reactive({ name: '', description: '', private: false })
const currentKey = ref('')

const loading = computed(() => !!repoStore.loadingMap[repoStore.currentAccountId])

const accountTitle = computed(() => {
  const acc = accountStore.accounts.find(a => a.id === repoStore.currentAccountId)
  return acc ? `${acc.remark || acc.username} 的仓库` : '请选择账号'
})

interface TreeNode {
  key: string
  label: string
  isAccount: boolean
  id: string
  children?: TreeNode[]
}

const treeData = computed<TreeNode[]>(() =>
  accountStore.accounts.map(acc => {
    const repos = repoStore.reposByAccount[acc.id] || []
    return {
      key: `acc:${acc.id}`,
      label: acc.remark ? `${acc.remark}（${acc.username}）` : acc.username,
      isAccount: true,
      id: acc.id,
      children: repoStore.sortedRepos(repos).map(r => ({
        key: `repo:${acc.id}:${r.full_name}`,
        label: r.name,
        isAccount: false,
        id: r.full_name
      }))
    }
  })
)

const displayRepos = computed<GitHubRepo[]>(() => {
  if (searchKw.value.trim()) {
    return repoStore
      .search(searchKw.value)
      .map(item => item.repo)
      .filter(r => !onlyFavorite.value || repoStore.getMeta(r.full_name).favorite)
  }
  return repoStore.sortedRepos(repoStore.currentRepos).filter(
    r => !onlyFavorite.value || repoStore.getMeta(r.full_name).favorite
  )
})

const repoGroups = computed(() => {
  const groups = new Set<string>()
  for (const m of Object.values(repoStore.metaMap)) if (m.group) groups.add(m.group)
  return Array.from(groups)
})

function onNodeClick(node: TreeNode) {
  currentKey.value = node.key
  if (node.isAccount) {
    repoStore.setCurrentAccount(node.id)
  } else {
    const accountId = node.key.split(':')[1]
    if (repoStore.currentAccountId !== accountId) repoStore.setCurrentAccount(accountId)
    repoStore.setCurrentRepo(node.id)
  }
}

function selectRepo(row: GitHubRepo) {
  repoStore.selectRepo(row.full_name)
  ElMessage.success(`已选中仓库 ${row.full_name}，可进入设置/分支/Action/Release/文件模块`)
}

/* ---------- 克隆地址 ---------- */
const cloneVisible = ref(false)
const cloneRepo = ref<GitHubRepo | null>(null)

function cloneUrls(row: GitHubRepo): { https: string; ssh: string } {
  const accId = repoStore.findAccountIdByRepo(row.full_name) || repoStore.currentAccountId
  const acc = accountStore.accounts.find(a => a.id === accId)
  const host = acc?.sshHost?.trim() || 'github.com'
  return {
    https: `https://github.com/${row.full_name}.git`,
    ssh: `git@${host}:${row.full_name}.git`
  }
}

function isCustomHost(row: GitHubRepo): boolean {
  const accId = repoStore.findAccountIdByRepo(row.full_name) || repoStore.currentAccountId
  const acc = accountStore.accounts.find(a => a.id === accId)
  return (acc?.sshHost?.trim() || 'github.com') !== 'github.com'
}

function openClone(row: GitHubRepo) {
  cloneRepo.value = row
  cloneVisible.value = true
}

function defaultSshUrl(row: GitHubRepo): string {
  return `git@github.com:${row.full_name}.git`
}

function copyClone(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => ElMessage.success('已复制克隆地址'),
      () => ElMessage.warning('复制失败，请手动复制')
    )
  } else {
    ElMessage.warning('复制失败，请手动复制')
  }
}

/* ---------- 移动端辅助 ---------- */
const accountTabIndex = computed({
  get: () => Math.max(0, accountStore.accounts.findIndex(a => a.id === repoStore.currentAccountId)),
  set: (i: number) => {
    const acc = accountStore.accounts[i]
    if (acc) repoStore.setCurrentAccount(acc.id)
  }
})

const sheetVisible = ref(false)
const sheetRepo = ref<GitHubRepo | null>(null)
const sheetActions = [
  { name: '仓库设置', path: '/repo-setting' },
  { name: '分支管理', path: '/branch' },
  { name: 'Action流水线', path: '/action' },
  { name: 'Release管理', path: '/release' },
  { name: '文件管理', path: '/file' }
]

function openSheet(r: GitHubRepo) {
  sheetRepo.value = r
  sheetVisible.value = true
}

function onSheetSelect(action: { path: string }) {
  if (!sheetRepo.value) return
  repoStore.selectRepo(sheetRepo.value.full_name)
  router.push(action.path)
}

function enterRepo(r: GitHubRepo) {
  repoStore.selectRepo(r.full_name)
  router.push('/repo-setting')
}

async function submitCreate() {
  if (!createForm.name.trim()) {
    ElMessage.warning('请输入仓库名')
    return
  }
  const ok = await repoStore.createRepo({
    name: createForm.name.trim(),
    description: createForm.description.trim() || undefined,
    private: createForm.private
  })
  if (ok) {
    createVisible.value = false
    createForm.name = ''
    createForm.description = ''
    createForm.private = false
  }
}

async function onDeleteRepo(row: GitHubRepo) {
  try {
    await ElMessageBox.confirm(
      `高危操作：即将永久删除远程仓库「${row.full_name}」及其全部数据，不可恢复！`,
      '删除远程仓库',
      { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await repoStore.deleteRepo(row.owner.login, row.name)
}

/* ---------- 本地 Git（仅 Windows / Electron） ---------- */
const gitDir = ref('')
const gitBranch = ref('')
const gitRunning = ref(false)
const gitOutput = ref('')
const branchOptions = ref<string[]>([])

function gitTarget(): string {
  return gitDir.value.trim() || repoStore.currentRepo?.name || '.'
}

async function gitCloneUrl(): Promise<string> {
  const repo = repoStore.currentRepo
  if (!repo) return ''
  const pat = await accountStore.getPat(repoStore.currentAccountId)
  return `https://x-access-token:${pat}@github.com/${repo.full_name}.git`
}

async function runGit(args: string[], label?: string) {
  const repo = repoStore.currentRepo
  if (!repo || !window.electronAPI) return
  gitRunning.value = true
  if (args[0] === 'clone') args[1] = await gitCloneUrl()
  const cwd = args[0] === 'clone' ? undefined : gitTarget()
  const res = await window.electronAPI.gitExec(args, cwd)
  gitOutput.value =
    `$ git ${args[0] === 'clone' ? 'clone <token-url> ...' : args.join(' ')}\n${res.stdout}${res.stderr}\n[退出码 ${res.code}]`
  gitRunning.value = false
  if (res.code === 0 && label) ElMessage.success(`${label}完成`)
}

async function loadBranchOptions() {
  const ctx = repoStore.currentOwnerName()
  if (!ctx) return
  const pat = await accountStore.getPat(repoStore.currentAccountId)
  if (!pat) return
  const res = await getBranches(pat, ctx.owner, ctx.repo)
  if (res.code === 200) branchOptions.value = (res.data || []).map(b => b.name)
}

onMounted(async () => {
  if (!repoStore.currentAccountId && accountStore.activeId) repoStore.setCurrentAccount(accountStore.activeId)
  for (const acc of accountStore.accounts) repoStore.loadRepos(acc.id)
  if (isWindows) {
    const stop = setInterval(() => {
      if (repoStore.currentRepo && branchOptions.value.length === 0) {
        clearInterval(stop)
        loadBranchOptions()
      }
    }, 1000)
  }
})
</script>

<style scoped>
.page-toolbar {
  margin-bottom: 14px;
  display: flex;
  gap: 10px;
}
.tree-card {
  min-height: 400px;
}
.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tree-node.active {
  color: var(--color-primary);
  font-weight: 600;
}
.tree-account {
  color: var(--color-primary);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.repo-name {
  display: flex;
  align-items: center;
  gap: 6px;
}
.link-text {
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 600;
}
.clone-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.clone-label {
  width: 52px;
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.form-tip {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 20px;
}
.repo-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.git-card {
  margin-top: 14px;
}
.git-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.git-output {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 10px;
  min-height: 80px;
  max-height: 220px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  color: var(--text-main);
}
.empty-text {
  color: var(--text-secondary);
}
</style>
