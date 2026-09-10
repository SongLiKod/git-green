<template>
  <div class="page dashboard">
    <!-- 欢迎条 -->
    <div class="welcome-card">
      <div class="w-info">
        <div class="w-title">{{ greeting }}{{ accountStore.activeAccount ? `，${accountStore.activeAccount.remark || accountStore.activeAccount.username}` : '，欢迎使用 GitGreen' }}</div>
        <div class="w-sub">{{ nowText }} · {{ platformName }} · 零后端 · 数据全部本地加密存储</div>
      </div>
      <div class="w-actions">
        <el-button type="primary" :loading="refreshing" @click="refreshAll">刷新数据</el-button>
        <el-button :loading="accountStore.checking" @click="accountStore.checkAll()">检测Token</el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div v-for="s in stats" :key="s.label" class="stat-card" @click="s.to && router.push(s.to)">
        <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <div class="dash-cols">
      <div class="dash-col">
        <!-- 最近活跃仓库 -->
        <div class="d-card">
          <div class="d-title">最近活跃仓库</div>
          <div v-if="recentRepos.length === 0" class="d-empty">暂无数据，请先添加账号并同步仓库</div>
          <div v-for="item in recentRepos" :key="item.repo.full_name" class="d-row" @click="enterRepo(item.repo)">
            <div class="d-row-main">
              <div class="d-row-name">{{ item.repo.full_name }}</div>
              <div class="d-row-sub">{{ item.account }} · {{ new Date(item.repo.updated_at).toLocaleString() }}</div>
            </div>
            <div class="d-row-meta">
              <van-tag v-if="item.repo.private" type="warning" size="medium">私有</van-tag>
              <span>★ {{ item.repo.stargazers_count }}</span>
            </div>
          </div>
        </div>

        <!-- Token 状态 -->
        <div class="d-card">
          <div class="d-title">账号 Token 状态</div>
          <div v-if="accountStore.accounts.length === 0" class="d-empty">暂无账号</div>
          <div v-for="a in accountStore.accounts" :key="a.id" class="d-row" @click="accountStore.switchAccount(a.id)">
            <div class="d-row-main">
              <div class="d-row-name">{{ a.remark || a.username }}</div>
              <div class="d-row-sub">{{ a.group || '未分组' }}{{ a.id === accountStore.activeId ? ' · 当前使用' : '' }}</div>
            </div>
            <van-tag :type="a.status === 'normal' ? 'success' : a.status === 'expired' ? 'warning' : 'danger'" size="medium">
              {{ a.status === 'normal' ? '正常' : a.status === 'expired' ? '过期' : '失效' }}
            </van-tag>
          </div>
        </div>
      </div>

      <div class="dash-col">
        <!-- 快捷入口 -->
        <div class="d-card">
          <div class="d-title">快捷入口</div>
          <div class="quick-grid">
            <div v-for="q in quickEntries" :key="q.path" class="quick-item" @click="router.push(q.path)">
              <el-icon :size="20" color="var(--color-primary)"><component :is="q.icon" /></el-icon>
              <span>{{ q.title }}</span>
            </div>
          </div>
        </div>

        <!-- 最近操作 -->
        <div class="d-card">
          <div class="d-title">最近操作</div>
          <div v-if="recentLogs.length === 0" class="d-empty">暂无操作记录</div>
          <div v-for="l in recentLogs" :key="l.id" class="d-row">
            <div class="d-row-main">
              <div class="d-row-name">{{ l.action }}</div>
              <div class="d-row-sub">{{ l.detail || '-' }}</div>
            </div>
            <span class="d-time">{{ new Date(l.time).toLocaleTimeString() }}</span>
          </div>
          <div v-if="recentLogs.length" class="d-more" @click="router.push('/log')">查看全部日志</div>
        </div>

        <!-- 最近下载 -->
        <div class="d-card">
          <div class="d-title">最近下载</div>
          <div v-if="recentDownloads.length === 0" class="d-empty">暂无下载记录</div>
          <div v-for="d in recentDownloads" :key="d.id" class="d-row">
            <div class="d-row-main">
              <div class="d-row-name">{{ d.filename }}</div>
              <div class="d-row-sub">{{ d.time ? new Date(d.time).toLocaleString() : '' }}</div>
            </div>
            <van-tag :type="d.status === 'done' ? 'success' : d.status === 'error' ? 'danger' : 'primary'" size="medium">
              {{ d.status === 'done' ? '完成' : d.status === 'error' ? '失败' : '下载中' }}
            </van-tag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Dashboard' })
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Folder, Tools, Share, VideoPlay, Download, Document, Tickets, Connection } from '@element-plus/icons-vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useLogStore } from '@/stores/useLogStore'
import { listDownloads } from '@/utils/db'
import { getPlatform } from '@/utils/platform'
import type { GitHubRepo } from '@/api/githubRepo'
import type { OpLog, DownloadRecord } from '@/utils/db'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const logStore = useLogStore()
const router = useRouter()

const refreshing = ref(false)
const recentLogs = ref<OpLog[]>([])
const recentDownloads = ref<DownloadRecord[]>([])

const nowText = new Date().toLocaleString()
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好'
})
const platformName = computed(() => {
  const p = getPlatform()
  return p === 'windows' ? 'Windows客户端' : p === 'android' ? 'Android客户端' : 'Web网页端'
})

const allRepos = computed(() => repoStore.allLoadedRepos)

const stats = computed(() => {
  const repos = allRepos.value.map(i => i.repo)
  return [
    { label: 'GitHub账号', value: accountStore.accounts.length, color: 'var(--color-primary)', to: '/account' },
    { label: '仓库总数', value: repos.length, color: 'var(--color-primary)', to: '/repo' },
    { label: '私有仓库', value: repos.filter(r => r.private).length, color: '#e6a23c', to: '/repo' },
    { label: '总 Stars', value: repos.reduce((s, r) => s + r.stargazers_count, 0), color: 'var(--text-main)', to: '/repo' },
    { label: '总 Forks', value: repos.reduce((s, r) => s + r.forks_count, 0), color: 'var(--text-main)', to: '/repo' },
    { label: '收藏仓库', value: Object.values(repoStore.metaMap).filter(m => m.favorite).length, color: '#e6a23c', to: '/repo' },
    { label: 'Action运行', value: '-', color: 'var(--text-main)', to: '/action' },
    { label: 'Release', value: '-', color: 'var(--text-main)', to: '/release' }
  ]
})

const recentRepos = computed(() => {
  return [...allRepos.value].sort((a, b) => b.repo.updated_at.localeCompare(a.repo.updated_at)).slice(0, 8)
})

const quickEntries = [
  { path: '/repo', title: '仓库列表', icon: Folder },
  { path: '/repo-setting', title: '仓库设置', icon: Tools },
  { path: '/branch', title: '分支管理', icon: Share },
  { path: '/action', title: 'Action流水线', icon: VideoPlay },
  { path: '/release', title: 'Release管理', icon: Download },
  { path: '/file', title: '文件管理', icon: Document },
  { path: '/issue', title: 'Issue', icon: Tickets },
  { path: '/pull', title: 'PullRequest', icon: Connection }
]

function enterRepo(repo: GitHubRepo) {
  repoStore.selectRepo(repo.full_name)
  router.push('/repo-setting')
}

async function refreshAll() {
  refreshing.value = true
  for (const acc of accountStore.accounts) await repoStore.loadRepos(acc.id, true)
  await loadSideData()
  refreshing.value = false
}

async function loadSideData() {
  await logStore.refresh()
  recentLogs.value = logStore.logs.slice(0, 8)
  recentDownloads.value = (await listDownloads()).slice(0, 5)
}

onMounted(async () => {
  for (const acc of accountStore.accounts) repoStore.loadRepos(acc.id)
  await loadSideData()
})
</script>

<style scoped>
.welcome-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(120deg, var(--color-primary-dark), var(--color-primary) 60%, var(--color-primary-light));
  border-radius: 12px;
  padding: 18px 20px;
  color: #fff;
  margin-bottom: 14px;
}
.w-title {
  font-size: 18px;
  font-weight: 700;
}
.w-sub {
  font-size: 12.5px;
  opacity: 0.85;
  margin-top: 4px;
}
.w-actions :deep(.el-button) {
  background: rgba(255, 255, 255, 0.92);
  border-color: transparent;
  color: var(--color-primary-dark);
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: 0.15s;
}
.stat-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-1px);
}
.stat-value {
  font-size: 24px;
  font-weight: 800;
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.dash-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: start;
}
.dash-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.d-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
}
.d-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}
.d-empty {
  font-size: 12.5px;
  color: var(--text-secondary);
  padding: 10px 0;
}
.d-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
  cursor: pointer;
}
.d-row:last-of-type {
  border-bottom: none;
}
.d-row-main {
  min-width: 0;
  flex: 1;
}
.d-row-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.d-row-sub {
  font-size: 11.5px;
  color: var(--text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.d-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.d-time {
  font-size: 11.5px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.d-more {
  text-align: center;
  font-size: 12.5px;
  color: var(--color-primary);
  cursor: pointer;
  padding-top: 8px;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--text-main);
  cursor: pointer;
  transition: 0.15s;
}
.quick-item:hover {
  border-color: var(--color-primary);
  background: rgba(0, 148, 88, 0.06);
}
@media (max-width: 768px) {
  .dash-cols {
    grid-template-columns: 1fr;
  }
  .welcome-card {
    padding: 14px;
  }
  .w-title {
    font-size: 16px;
  }
}
</style>
