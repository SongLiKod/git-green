<template>
  <div class="page" :class="{ 'is-desktop': !isMobile }">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <div class="m-toolbar">
        <van-dropdown-menu style="flex: 1">
          <van-dropdown-item v-model="sort" :options="sortOptions" @change="reload" />
        </van-dropdown-menu>
        <van-button size="small" :loading="loading" @click="reload">刷新</van-button>
        <van-button size="small" type="primary" :disabled="!repo" @click="forkVisible = true">Fork 此仓库</van-button>
      </div>
      <van-empty v-if="!repo" description="请在顶栏选择仓库" />
      <template v-else>
        <div class="m-section-title">{{ repo.full_name }} 的 Fork（{{ forks.length }}{{ hasMore ? '+' : '' }}）</div>
        <van-empty v-if="forks.length === 0 && !loading" description="暂无 Fork" />
        <div v-for="f in forks" :key="f.full_name" class="m-card">
          <div class="m-card-head">
            <div class="m-card-title">
              <div class="t">{{ f.full_name }}</div>
              <div class="m-sub">{{ f.description || '暂无简介' }}</div>
            </div>
            <div class="m-tags" style="margin-top: 0">
              <van-tag :type="f.private ? 'warning' : 'success'">{{ f.private ? '私有' : '公开' }}</van-tag>
              <van-tag v-if="isMyFork(f)" type="primary">我的</van-tag>
            </div>
          </div>
          <div class="m-meta">
            <span>{{ f.language || '-' }}</span>
            <span>★ {{ f.stargazers_count }}</span>
            <span>Fork {{ f.forks_count }}</span>
            <span>{{ new Date(f.updated_at).toLocaleDateString() }}</span>
          </div>
          <div class="m-actions">
            <van-button size="mini" type="primary" plain @click="onAttach(f)">{{ isMyFork(f) ? '进入' : '接入' }}</van-button>
            <van-button size="mini" plain @click="openClone(f)">克隆</van-button>
            <van-button size="mini" plain @click="copyName(f)">复制</van-button>
            <van-button v-if="isMyFork(f)" size="mini" type="danger" plain @click="onDeleteFork(f)">删除</van-button>
          </div>
        </div>
        <div v-if="hasMore" class="m-toolbar">
          <van-button block size="small" :loading="loading" @click="loadMore">加载更多</van-button>
        </div>
      </template>

      <van-popup v-model:show="cloneVisible" position="bottom" round>
        <div class="m-popup">
          <div class="m-popup-title">克隆 {{ cloneRepo?.name || '' }}</div>
          <van-cell-group inset>
            <van-cell title="HTTPS" :label="cloneRepo ? cloneUrls(cloneRepo).https : ''" :is-link="false">
              <template #value>
                <van-button size="mini" plain @click="cloneRepo && showCloneQr(cloneUrls(cloneRepo).https, 'HTTPS')">二维码</van-button>
              </template>
            </van-cell>
            <van-cell title="SSH" :label="cloneRepo ? cloneUrls(cloneRepo).ssh : ''" :is-link="false">
              <template #value>
                <van-button size="mini" plain @click="cloneRepo && showCloneQr(cloneUrls(cloneRepo).ssh, 'SSH')">二维码</van-button>
              </template>
            </van-cell>
          </van-cell-group>
          <div class="m-actions">
            <van-button block plain @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).https : '')">复制 HTTPS</van-button>
            <van-button block plain @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).ssh : '')">复制 SSH</van-button>
          </div>
        </div>
      </van-popup>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
      <div class="page-toolbar">
        <span v-if="repo" class="ctx-label">{{ repo.full_name }} 的 Fork 网络</span>
        <el-select v-model="sort" style="width: 150px" @change="reload">
          <el-option v-for="s in sortOptions" :key="s.value" :label="s.text" :value="s.value" />
        </el-select>
        <el-button :loading="loading" :disabled="!repo" @click="reload">刷新</el-button>
        <el-button type="primary" :disabled="!repo" @click="forkVisible = true">Fork 此仓库</el-button>
      </div>

      <el-empty v-if="!repo" description="请先选择仓库" />
      <el-card v-else shadow="never" class="list-card">
        <template #header>
          <div class="card-header">
            <span>共 {{ forks.length }}{{ hasMore ? '+' : '' }} 个 Fork</span>
            <el-tag size="small" type="info">{{ repo.forks_count }} 个（GitHub 统计）</el-tag>
          </div>
        </template>
        <el-table :data="forks" border stripe v-loading="loading" height="100%">
          <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
          <el-table-column label="仓库" min-width="220">
            <template #default="{ row }">
              <div class="repo-name">
                <span class="link-text" @click="onAttach(row)">{{ row.full_name }}</span>
                <el-tag size="small" :type="row.private ? 'warning' : 'success'">{{ row.private ? '私有' : '公开' }}</el-tag>
                <el-tag v-if="isMyFork(row)" size="small" type="primary" effect="dark">我的</el-tag>
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
          <el-table-column label="更新时间" width="160">
            <template #default="{ row }">{{ new Date(row.updated_at).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="onAttach(row)">{{ isMyFork(row) ? '进入' : '接入' }}</el-button>
              <el-button link @click="openClone(row)">克隆</el-button>
              <el-button link @click="copyName(row)">复制</el-button>
              <el-button v-if="isMyFork(row)" link type="danger" @click="onDeleteFork(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <span class="empty-text">{{ loading ? '加载中…' : '暂无 Fork' }}</span>
          </template>
        </el-table>
        <div v-if="hasMore" class="load-more">
          <el-button :loading="loading" @click="loadMore">加载更多</el-button>
        </div>
      </el-card>

      <el-dialog v-model="cloneVisible" :title="`克隆 ${cloneRepo?.full_name || ''}`" width="520px">
        <div class="clone-row">
          <span class="clone-label">HTTPS</span>
          <el-input :model-value="cloneRepo ? cloneUrls(cloneRepo).https : ''" readonly />
          <el-button @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).https : '')">复制</el-button>
          <el-button v-if="cloneRepo" @click="showCloneQr(cloneUrls(cloneRepo).https, 'HTTPS')">二维码</el-button>
        </div>
        <div class="clone-row">
          <span class="clone-label">SSH</span>
          <el-input :model-value="cloneRepo ? cloneUrls(cloneRepo).ssh : ''" readonly />
          <el-button @click="copyClone(cloneRepo ? cloneUrls(cloneRepo).ssh : '')">复制</el-button>
          <el-button v-if="cloneRepo" @click="showCloneQr(cloneUrls(cloneRepo).ssh, 'SSH')">二维码</el-button>
        </div>
      </el-dialog>
    </template>

    <ForkDialog v-model="forkVisible" :repo="repo" @created="onForked" />
    <QrDialog v-model="qrVisible" :text="qrText" :title="qrTitle" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ForkManage' })
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useLogStore } from '@/stores/useLogStore'
import { listForks, type ForkSort } from '@/api/githubFork'
import { deleteRepo } from '@/api/githubRepo'
import type { GitHubRepo } from '@/api/githubRepo'
import { useIsMobile } from '@/utils/platform'
import ForkDialog from '@/components/ForkDialog.vue'
import QrDialog from '@/components/QrDialog.vue'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()
const isMobile = useIsMobile()

const repo = computed(() => repoStore.currentRepo)
const loading = ref(false)
const sort = ref<ForkSort>('newest')
const forks = ref<GitHubRepo[]>([])
const page = ref(1)
const hasMore = ref(false)
const forkVisible = ref(false)

const sortOptions = [
  { text: '最新创建', value: 'newest' },
  { text: '最早创建', value: 'oldest' },
  { text: 'Star 最多', value: 'stargazers' },
  { text: 'Watch 最多', value: 'watchers' }
]

/** 该 fork 是否属于本机已绑定的某个账号 */
function forkAccountId(f: GitHubRepo): string | null {
  const acc = accountStore.accounts.find(a => a.username === f.owner.login)
  return acc ? acc.id : null
}
function isMyFork(f: GitHubRepo): boolean {
  return forkAccountId(f) !== null
}

async function withPat(): Promise<string> {
  return await accountStore.getPat(repoStore.currentAccountId)
}

async function reload() {
  page.value = 1
  forks.value = []
  await loadMore()
}

async function loadMore() {
  const r = repo.value
  if (!r) return
  loading.value = true
  const pat = await withPat()
  const res = await listForks(pat, r.owner.login, r.name, sort.value, page.value, 30)
  loading.value = false
  if (res.code === 200) {
    const list = res.data || []
    const seen = new Set(forks.value.map(f => f.full_name))
    forks.value.push(...list.filter(f => !seen.has(f.full_name)))
    hasMore.value = list.length === 30
    page.value++
  } else {
    ElMessage.error(`Fork 列表加载失败：${res.msg}`)
  }
}

/** 进入（本账号 fork）或接入（外部 fork） */
async function onAttach(f: GitHubRepo) {
  const accId = forkAccountId(f)
  if (accId) {
    repoStore.selectRepo(f.full_name)
    ElMessage.success(`已选中 ${f.full_name}`)
    return
  }
  const ok = await repoStore.openExternalRepo(f.owner.login, f.name)
  if (ok) await logStore.write({ module: 'repo', action: '接入Fork', detail: f.full_name })
}

/** 删除自己账号下的 fork（高危二次确认；仅删除 fork 副本，不影响源仓库） */
async function onDeleteFork(f: GitHubRepo) {
  const accId = forkAccountId(f)
  if (!accId) return
  try {
    await ElMessageBox.confirm(
      `高危操作：将永久删除 Fork 副本「${f.full_name}」及其全部数据（不影响源仓库 ${repo.value?.full_name || ''}）！`,
      '删除 Fork',
      { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const pat = await accountStore.getPat(accId)
  if (!pat) return
  const res = await deleteRepo(pat, f.owner.login, f.name)
  if (res.code === 200) {
    ElMessage.success(`Fork ${f.full_name} 已删除`)
    await logStore.write({ module: 'repo', action: '删除Fork', detail: f.full_name, level: 'warning' })
    await repoStore.refreshCurrent()
    reload()
  } else {
    ElMessage.error(`删除失败：${res.msg}`)
  }
}

function onForked(fullName: string) {
  repoStore.selectRepo(fullName)
  reload()
}

/* ---------- 克隆地址（复用仓库列表逻辑：按账号 sshHost 生成） ---------- */
const cloneVisible = ref(false)
const cloneRepo = ref<GitHubRepo | null>(null)
const qrVisible = ref(false)
const qrText = ref('')
const qrTitle = ref('')

function cloneUrls(row: GitHubRepo): { https: string; ssh: string } {
  const accId = repoStore.findAccountIdByRepo(row.full_name) || repoStore.currentAccountId
  const acc = accountStore.accounts.find(a => a.id === accId)
  const host = acc?.sshHost?.trim() || 'github.com'
  return {
    https: `https://github.com/${row.full_name}.git`,
    ssh: `git@${host}:${row.full_name}.git`
  }
}

function openClone(row: GitHubRepo) {
  cloneRepo.value = row
  cloneVisible.value = true
}

function showCloneQr(text: string, label: string) {
  if (!cloneRepo.value) return
  qrText.value = text
  qrTitle.value = `${cloneRepo.value.name} · ${label}克隆地址`
  qrVisible.value = true
}

function copyText(text: string, okMsg: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => ElMessage.success(okMsg),
      () => ElMessage.warning('复制失败，请手动复制')
    )
  } else {
    ElMessage.warning('复制失败，请手动复制')
  }
}

function copyClone(text: string) {
  copyText(text, '已复制克隆地址')
}
function copyName(f: GitHubRepo) {
  copyText(f.full_name, '已复制仓库名')
}

watch(() => [repoStore.currentRepoFullName, accountStore.activeId], reload)
onMounted(reload)
</script>

<style scoped>
.page-toolbar {
  margin-bottom: 14px;
  display: flex;
  gap: 10px;
  align-items: center;
}
/* 桌面端：页面撑满可视高度，列表卡片填满剩余空间，底部不留空白 */
.page.is-desktop {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.page.is-desktop > .list-card {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.page.is-desktop > .list-card :deep(.el-card__body) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.page.is-desktop > .list-card :deep(.el-table) {
  flex: 1 1 auto;
  min-height: 0;
}
.ctx-label {
  font-weight: 600;
  color: var(--text-main);
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
.repo-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.load-more {
  margin-top: 12px;
  text-align: center;
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
.empty-text {
  color: var(--text-secondary);
}
</style>
