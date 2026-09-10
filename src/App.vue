<template>
  <div v-if="booted">
    <AppLock />
    <el-container class="app-layout">
      <el-aside :width="collapsed ? '64px' : '210px'" class="app-aside">
        <div class="app-logo">{{ collapsed ? 'GG' : 'GitGreen' }}</div>
        <el-menu :default-active="route.path" :collapse="collapsed" :collapse-transition="false" router class="app-menu">
          <el-menu-item index="/account">
            <el-icon><User /></el-icon><template #title>账号管理</template>
          </el-menu-item>
          <el-menu-item index="/repo">
            <el-icon><Folder /></el-icon><template #title>仓库列表</template>
          </el-menu-item>
          <el-menu-item index="/repo-setting">
            <el-icon><Tools /></el-icon><template #title>仓库设置</template>
          </el-menu-item>
          <el-menu-item index="/branch">
            <el-icon><Share /></el-icon><template #title>分支管理</template>
          </el-menu-item>
          <el-menu-item index="/action">
            <el-icon><VideoPlay /></el-icon><template #title>Action流水线</template>
          </el-menu-item>
          <el-menu-item index="/release">
            <el-icon><Download /></el-icon><template #title>Release管理</template>
          </el-menu-item>
          <el-menu-item index="/file">
            <el-icon><Document /></el-icon><template #title>文件管理</template>
          </el-menu-item>
          <el-menu-item index="/log">
            <el-icon><Notebook /></el-icon><template #title>操作日志</template>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon><template #title>设置</template>
          </el-menu-item>
        </el-menu>
        <div class="collapse-bar" @click="toggleCollapse">
          <el-icon><Expand v-if="collapsed" /><Fold v-else /></el-icon>
          <span v-if="!collapsed">收起</span>
        </div>
      </el-aside>
      <el-container>
        <el-header class="app-header">
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
            <el-tag v-if="accountStore.activeAccount" :type="statusType" effect="dark" size="small">
              {{ statusText }}
            </el-tag>
            <span class="platform-tag">{{ platformName }}</span>
          </div>
          <div class="header-right">
            <ThemeSwitch />
          </div>
        </el-header>
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
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { User, Folder, Tools, Share, VideoPlay, Download, Document, Setting, Notebook, Expand, Fold } from '@element-plus/icons-vue'
import ThemeSwitch from '@/components/ThemeSwitch.vue'
import AppLock from '@/components/AppLock.vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTabStore } from '@/stores/useTabStore'
import { initCrypto } from '@/utils/crypto'
import { initLock } from '@/utils/lockService'
import { getPlatform, isWindowsClient } from '@/utils/platform'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settingsStore = useSettingsStore()
const tabStore = useTabStore()

const booted = ref(false)
const activeId = ref('')

const collapsed = computed(() => settingsStore.config.menuCollapsed)
const isDesktop = isWindowsClient()
const multiTab = computed(() => settingsStore.config.pageMode === 'multi')

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
  activeId.value = accountStore.activeId
  if (accountStore.activeId) repoStore.setCurrentAccount(accountStore.activeId)
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
  line-height: 60px;
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
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
</style>
