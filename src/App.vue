<template>
  <div v-if="booted">
    <AppLock />
    <el-container class="app-layout">
      <el-aside v-if="!isMobile" :width="collapsed ? '64px' : '210px'" class="app-aside">
        <div class="app-logo">
          <img src="./favicon.svg" class="app-logo-img" alt="GG" />
          <span v-if="!collapsed">GitGreen</span>
        </div>
        <el-menu :default-active="route.path" :collapse="collapsed" :collapse-transition="false" router class="app-menu">
          <el-menu-item index="/dashboard">
            <GgIcon :size="16" /><template #title>仪表盘</template>
          </el-menu-item>
          <el-menu-item index="/account">
            <GgIcon :size="16" /><template #title>账号管理</template>
          </el-menu-item>
          <el-menu-item index="/repo">
            <GgIcon :size="16" /><template #title>仓库列表</template>
          </el-menu-item>
          <el-menu-item index="/repo-setting">
            <GgIcon :size="16" /><template #title>仓库设置</template>
          </el-menu-item>
          <el-menu-item index="/branch">
            <GgIcon :size="16" /><template #title>分支管理</template>
          </el-menu-item>
          <el-menu-item index="/action">
            <GgIcon :size="16" /><template #title>Action流水线</template>
          </el-menu-item>
          <el-menu-item index="/release">
            <GgIcon :size="16" /><template #title>Release管理</template>
          </el-menu-item>
          <el-menu-item index="/file">
            <GgIcon :size="16" /><template #title>文件管理</template>
          </el-menu-item>
          <el-menu-item index="/issue">
            <GgIcon :size="16" /><template #title>Issue管理</template>
          </el-menu-item>
          <el-menu-item index="/pull">
            <GgIcon :size="16" /><template #title>PullRequest</template>
          </el-menu-item>
          <el-menu-item index="/log">
            <GgIcon :size="16" /><template #title>操作日志</template>
          </el-menu-item>
          <el-menu-item index="/settings">
            <GgIcon :size="16" /><template #title>设置</template>
          </el-menu-item>
        </el-menu>
        <div class="collapse-bar" @click="toggleCollapse">
          <GgIcon :size="16" />
          <span v-if="!collapsed">收起</span>
        </div>
      </el-aside>
      <el-container direction="vertical" class="app-body">
        <!-- 桌面顶栏 -->
        <el-header v-if="!isMobile" class="app-header">
          <div class="header-left">
            <span class="header-label">当前账号</span>
            <el-select v-model="activeId" placeholder="请选择账号" style="width: 220px" @change="onSwitch">
              <el-option
                v-for="a in accountStore.accounts"
                :key="a.id"
                :label="a.remark ? `${a.remark}（${a.username}）` : a.username"
                :value="a.id"
              />
            </el-select>
            <template v-if="showContextBar">
              <span class="header-label">仓库</span>
              <el-select
                :model-value="repoStore.currentRepoFullName"
                placeholder="请选择仓库"
                filterable
                style="width: 260px"
                :loading="repoLoading"
                @update:model-value="(v: any) => repoStore.setCurrentRepo(String(v))"
              >
                <el-option v-for="r in repoStore.currentRepos" :key="r.full_name" :label="r.full_name" :value="r.full_name" />
              </el-select>
              <el-button link type="primary" @click="repoStore.refreshCurrent()">刷新</el-button>
            </template>
            <el-tag v-if="accountStore.activeAccount" :type="statusType" effect="dark" size="small">
              {{ statusText }}
            </el-tag>
            <span class="platform-tag">{{ platformName }}</span>
          </div>
          <div class="header-right">
            <ThemeSwitch />
          </div>
        </el-header>
        <!-- 移动端顶栏 -->
        <header v-else class="mobile-header">
          <div class="mobile-title">{{ currentTitle }}</div>
          <div class="mobile-header-right">
            <el-select
              v-if="showContextBar"
              :model-value="repoStore.currentRepoFullName"
              placeholder="仓库"
              filterable
              size="small"
              style="width: 150px"
              :loading="repoLoading"
              @update:model-value="(v: any) => repoStore.setCurrentRepo(String(v))"
            >
              <el-option v-for="r in repoStore.currentRepos" :key="r.full_name" :label="r.name" :value="r.full_name" />
            </el-select>
            <div class="icon-btn" title="主题切换" @click="cycleTheme">
              <GgIcon :size="18" />
            </div>
            <div class="icon-btn" title="刷新" @click="onMobileRefresh">
              <GgIcon :size="18" />
            </div>
          </div>
        </header>
        <!-- 多标签页模式（仅桌面端） -->
        <div v-if="isDesktop && multiTab" class="tab-bar">
          <el-tabs
            :model-value="route.path"
            type="card"
            closable
            @tab-change="(p: any) => router.push(String(p))"
            @tab-remove="onTabRemove"
          >
            <el-tab-pane v-for="t in tabStore.tabs" :key="t.path" :name="t.path" :label="t.title" />
          </el-tabs>
        </div>
        <el-main class="app-main">
          <router-view v-slot="{ Component }">
            <keep-alive :include="tabStore.cachedNames">
              <component :is="Component" />
            </keep-alive>
          </router-view>
        </el-main>
        <!-- 移动端底部导航 -->
        <nav v-if="isMobile" class="mobile-tabbar">
          <template v-for="t in mobileTabs" :key="t.title">
            <div
              v-if="t.menu"
              class="mobile-tabbar__item"
              :class="{ 'is-active': repoTabActive }"
              @click="repoMenuVisible = true"
            >
              <GgIcon :size="20" />
              <span class="mobile-tabbar__label">{{ t.title }}</span>
            </div>
            <router-link
              v-else
              :to="t.path"
              class="mobile-tabbar__item"
              :class="{ 'is-active': route.path === t.path }"
            >
              <GgIcon :size="20" />
              <span class="mobile-tabbar__label">{{ t.title }}</span>
            </router-link>
          </template>
        </nav>
        <van-action-sheet
          v-model:show="repoMenuVisible"
          :actions="repoMenuActions"
          cancel-text="取消"
          close-on-click-action
          title="仓库功能"
          @select="onRepoMenuSelect"
        />
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GgIcon from '@/components/GgIcon.vue'
import ThemeSwitch from '@/components/ThemeSwitch.vue'
import AppLock from '@/components/AppLock.vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useThemeStore } from '@/stores/useThemeStore'
import type { ThemeMode } from '@/stores/useThemeStore'
import { useTabStore } from '@/stores/useTabStore'
import { initCrypto } from '@/utils/crypto'
import { initLock } from '@/utils/lockService'
import { getPlatform, isWindowsClient, useIsMobile } from '@/utils/platform'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settingsStore = useSettingsStore()
const themeStore = useThemeStore()
const tabStore = useTabStore()

const booted = ref(false)
const activeId = ref('')

/* ---------- 移动端自适应（Android 客户端或窄屏） ---------- */
const isMobile = useIsMobile()

const currentTitle = computed(() => String(route.meta.title || 'GitGreen'))

const mobileTabs: { path: string; title: string; menu?: boolean }[] = [
  { path: '/dashboard', title: '首页' },
  { path: '/account', title: '账号' },
  { path: '', title: '仓库', menu: true },
  { path: '/log', title: '日志' },
  { path: '/settings', title: '设置' }
]

/* 仓库功能菜单（移动端底部「仓库」Tab 弹出） */
const repoPages = ['/repo', '/repo-setting', '/branch', '/action', '/release', '/file', '/issue', '/pull']
const repoMenuVisible = ref(false)
const repoTabActive = computed(() => repoPages.includes(route.path))
const repoMenuActions = [
  { name: '仓库列表', path: '/repo' },
  { name: '仓库设置', path: '/repo-setting' },
  { name: '分支管理', path: '/branch' },
  { name: 'Action流水线', path: '/action' },
  { name: 'Release管理', path: '/release' },
  { name: '文件管理', path: '/file' },
  { name: 'Issue管理', path: '/issue' },
  { name: 'PullRequest', path: '/pull' }
]

function onRepoMenuSelect(action: { path: string }) {
  router.push(action.path)
}

function cycleTheme() {
  const order: ThemeMode[] = ['system', 'light', 'dark']
  const idx = order.indexOf(themeStore.themeMode)
  themeStore.setThemeMode(order[(idx + 1) % order.length])
}

function onMobileRefresh() {
  if (showContextBar.value) repoStore.refreshCurrent()
  else accountStore.checkAll()
}

const collapsed = computed(() => settingsStore.config.menuCollapsed)
const isDesktop = isWindowsClient()
const multiTab = computed(() => settingsStore.config.pageMode === 'multi')

/** 仅仓库相关页面显示顶部 仓库 选择上下文 */
const showContextBar = computed(() =>
  ['/repo-setting', '/branch', '/action', '/release', '/file', '/issue', '/pull'].includes(route.path)
)

const repoLoading = computed(() => !!repoStore.loadingMap[repoStore.currentAccountId])

function toggleCollapse() {
  settingsStore.update({ menuCollapsed: !settingsStore.config.menuCollapsed })
}

const platformName = computed(() => {
  const p = getPlatform()
  return p === 'windows' ? 'Windows客户端' : p === 'android' ? 'Android客户端' : 'Web网页端'
})

const statusType = computed(() => {
  const s = accountStore.activeAccount?.status
  return s === 'normal' ? 'success' : s === 'expired' ? 'warning' : 'danger'
})

const statusText = computed(() => {
  const s = accountStore.activeAccount?.status
  return s === 'normal' ? '正常' : s === 'expired' ? '已过期' : '已失效'
})

function onSwitch(id: string) {
  accountStore.switchAccount(id)
  repoStore.setCurrentAccount(id)
}

function onTabRemove(path: any) {
  const next = tabStore.remove(String(path))
  if (String(path) === route.path) {
    router.push(next || '/account')
  }
}

/** 多标签页模式：路由变化登记页签 */
watch(
  () => route.path,
  () => {
    if (!isDesktop || !multiTab.value) return
    tabStore.open({ path: route.path, name: String(route.name || ''), title: String(route.meta.title || route.path) })
  },
  { immediate: true }
)

/* ---------- 定时任务：Token巡检 / 仓库自动同步（受设置控制） ---------- */
let inspectionTimer: number | undefined
let syncTimer: number | undefined

function scheduleInspection() {
  if (inspectionTimer) window.clearInterval(inspectionTimer)
  const { inspectionEnabled, inspectionIntervalMinutes } = settingsStore.config
  if (inspectionEnabled && inspectionIntervalMinutes > 0) {
    inspectionTimer = window.setInterval(() => accountStore.checkAll(false), inspectionIntervalMinutes * 60 * 1000)
  }
}

function scheduleSync() {
  if (syncTimer) window.clearInterval(syncTimer)
  const { autoSyncEnabled, syncInterval } = settingsStore.config
  if (autoSyncEnabled && syncInterval > 0) {
    syncTimer = window.setInterval(() => {
      for (const acc of accountStore.accounts) repoStore.loadRepos(acc.id, true)
    }, syncInterval * 60 * 1000)
  }
}

watch(() => [settingsStore.config.inspectionEnabled, settingsStore.config.inspectionIntervalMinutes], scheduleInspection)
watch(() => [settingsStore.config.autoSyncEnabled, settingsStore.config.syncInterval], scheduleSync)

onMounted(async () => {
  settingsStore.init()
  await initCrypto()
  await initLock()
  accountStore.reload()
  // 优先恢复刷新前的账号+仓库选择（持久化），无效时回退到当前激活账号
  const restoreId =
    repoStore.currentAccountId && accountStore.accounts.some(a => a.id === repoStore.currentAccountId)
      ? repoStore.currentAccountId
      : accountStore.activeId
  activeId.value = restoreId
  if (restoreId) repoStore.setCurrentAccount(restoreId)
  booted.value = true
  accountStore.checkAll(false)
  scheduleInspection()
  scheduleSync()
})

onBeforeUnmount(() => {
  if (inspectionTimer) window.clearInterval(inspectionTimer)
  if (syncTimer) window.clearInterval(syncTimer)
})
</script>

<style scoped>
.app-layout {
  height: 100vh;
  height: 100dvh;
}
.app-body {
  flex-direction: column;
  min-width: 0;
}
.app-aside {
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
}
.app-logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
}
.app-logo-img {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  flex: none;
}
.app-menu {
  border-right: none;
  background: transparent;
  flex: 1;
  overflow-y: auto;
}
.app-menu:not(.el-menu--collapse) {
  width: 100%;
}
.app-menu :deep(.el-menu-item) {
  color: var(--text-main);
}
.app-menu :deep(.el-menu-item:hover) {
  background: rgba(0, 148, 88, 0.1);
  color: var(--color-primary);
}
.app-menu :deep(.el-menu-item.is-active) {
  background: var(--color-primary) !important;
  color: #fff !important;
  font-weight: 600;
}
.app-menu :deep(.el-menu-item.is-active .gg-mark) {
  color: #fff;
}
.collapse-bar {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-top: 1px solid var(--border-color);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  user-select: none;
}
.collapse-bar:hover {
  color: var(--color-primary);
}
.app-header {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-label {
  color: var(--text-secondary);
  font-size: 14px;
}
.platform-tag {
  font-size: 12px;
  color: var(--text-secondary);
}
.tab-bar {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  padding: 6px 12px 0;
}
.tab-bar :deep(.el-tabs__header) {
  margin: 0;
}
.app-main {
  background: var(--bg-page);
  padding: 16px;
  overflow: auto;
}
/* ---------- 移动端 ---------- */
.mobile-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 9;
}
.mobile-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mobile-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
}
.icon-btn:hover {
  background: rgba(0, 148, 88, 0.1);
  color: var(--color-primary);
}
.mobile-tabbar {
  flex: none;
  height: 56px;
  display: flex;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.mobile-tabbar__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-secondary);
  text-decoration: none;
}
.mobile-tabbar__item.is-active {
  color: var(--color-primary);
}
.mobile-tabbar__label {
  font-size: 11px;
}
</style>

<style>
/* 全局移动端适配（跨组件生效） */
@media (max-width: 768px) {
  .app-main {
    padding: 10px;
  }
  .page-toolbar {
    flex-wrap: wrap;
  }
  .page .el-col-6,
  .page .el-col-12,
  .page .el-col-18 {
    width: 100%;
    max-width: 100%;
    flex: 0 0 100%;
  }
  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .el-dialog {
    width: 92% !important;
    max-width: 520px;
  }
}

/* ---------- 移动端 Vant 页面通用样式 ---------- */
.m-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px 2px;
}
.m-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  margin: 10px 12px;
  padding: 12px;
}
.m-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.m-card-title {
  flex: 1;
  min-width: 0;
}
.m-card-title .t {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
}
.m-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.m-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.m-popup {
  padding: 16px;
  max-height: 78vh;
  overflow: auto;
}
.m-popup-title {
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 14px;
  color: var(--text-main);
}
.m-code {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  font-family: Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 60vh;
  overflow: auto;
}
.m-logs {
  background: #0d1117;
  color: #c9d1d9;
  border-radius: 8px;
  padding: 10px;
  height: 64vh;
  overflow: auto;
  font-size: 11.5px;
  font-family: Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
.m-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  margin: 14px 12px 6px;
}
.m-yml :deep(textarea),
.m-yml textarea {
  font-family: Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}
.img-view-m {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  max-height: 56vh;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-page);
}
.img-view-m img {
  max-width: 100%;
  max-height: 56vh;
}
</style>
