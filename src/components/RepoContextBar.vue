<template>
  <div class="context-bar">
    <span class="label">账号</span>
    <el-select
      :model-value="repoStore.currentAccountId"
      placeholder="选择账号"
      style="width: 200px"
      @update:model-value="onAccount"
    >
      <el-option
        v-for="a in accountStore.accounts"
        :key="a.id"
        :label="a.remark ? `${a.remark}（${a.username}）` : a.username"
        :value="a.id"
      />
    </el-select>
    <span class="label">仓库</span>
    <el-select
      :model-value="repoStore.currentRepoFullName"
      placeholder="选择仓库"
      filterable
      style="width: 260px"
      :loading="loading"
      @update:model-value="repoStore.setCurrentRepo"
    >
      <el-option v-for="r in repoStore.currentRepos" :key="r.full_name" :label="r.full_name" :value="r.full_name" />
    </el-select>
    <el-button link type="primary" @click="repoStore.refreshCurrent()">刷新</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'

const accountStore = useAccountStore()
const repoStore = useRepoStore()

const loading = computed(() => !!repoStore.loadingMap[repoStore.currentAccountId])

function onAccount(id: string) {
  repoStore.setCurrentAccount(id)
  accountStore.switchAccount(id)
}
</script>

<style scoped>
.context-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 14px;
}
.label {
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
