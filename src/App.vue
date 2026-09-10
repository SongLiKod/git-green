<template>
  <el-container class="app-layout">
    <el-aside width="210px" class="app-aside">
      <div class="app-logo">GitGreen</div>
      <el-menu :default-active="route.path" router class="app-menu">
        <el-menu-item index="/account">账号管理</el-menu-item>
        <el-menu-item index="/repo">仓库列表</el-menu-item>
        <el-menu-item index="/repo-setting">仓库设置</el-menu-item>
        <el-menu-item index="/branch">分支管理</el-menu-item>
        <el-menu-item index="/action">Action流水线</el-menu-item>
        <el-menu-item index="/release">Release管理</el-menu-item>
        <el-menu-item index="/file">文件管理</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-header">
        <div class="header-left">
          <span class="header-label">当前账号</span>
          <el-select
            v-model="activeId"
            placeholder="请选择账号"
            style="width: 220px"
            @change="onSwitch"
          >
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
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ThemeSwitch from '@/components/ThemeSwitch.vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { getPlatform } from '@/utils/platform'

const route = useRoute()
const accountStore = useAccountStore()
const repoStore = useRepoStore()

const activeId = ref(accountStore.activeId)

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

/** Token失效自动检测：启动即检测 + 定时轮询 */
let timer: number | undefined
onMounted(() => {
  accountStore.reload()
  activeId.value = accountStore.activeId
  if (accountStore.activeId) repoStore.setCurrentAccount(accountStore.activeId)
  accountStore.checkAll(false)
  timer = window.setInterval(() => accountStore.checkAll(false), 5 * 60 * 1000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
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
}
.app-logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 1px;
}
.app-menu {
  border-right: none;
  background: transparent;
  flex: 1;
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
.app-main {
  background: var(--bg-page);
  padding: 16px;
  overflow: auto;
}
</style>
