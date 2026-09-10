<template>
  <div class="page">
    <div class="page-toolbar">
      <el-select v-model="filterModule" clearable placeholder="全部模块" style="width: 150px" @change="applyFilter">
        <el-option v-for="m in MODULES" :key="m.value" :label="m.label" :value="m.value" />
      </el-select>
      <el-select v-model="filterLevel" clearable placeholder="全部级别" style="width: 130px" @change="applyFilter">
        <el-option label="信息" value="info" />
        <el-option label="成功" value="success" />
        <el-option label="警告" value="warning" />
        <el-option label="错误" value="error" />
      </el-select>
      <el-input v-model="keyword" placeholder="检索动作 / 详情" clearable style="width: 240px" @input="applyFilter" />
      <el-button @click="load">刷新</el-button>
      <el-button @click="onExport">导出日志</el-button>
      <el-button type="danger" plain @click="onClear">清空日志</el-button>
      <span class="retention">保留 {{ settings.config.logRetentionDays }} 天，共 {{ logs.length }} 条</span>
    </div>

    <el-table :data="filtered" border stripe v-loading="loading" max-height="620">
      <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ new Date(row.time).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="模块" width="110">
        <template #default="{ row }">{{ moduleLabel(row.module) }}</template>
      </el-table-column>
      <el-table-column prop="action" label="操作" min-width="160" />
      <el-table-column prop="detail" label="详情" min-width="260" show-overflow-tooltip />
      <el-table-column label="级别" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="levelType(row.level)">{{ levelLabel(row.level) }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && filtered.length === 0" description="暂无操作日志" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLogStore } from '@/stores/useLogStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { textDownload } from '@/utils/platform'
import type { OpLog } from '@/utils/db'

defineOptions({ name: 'LogManage' })

const logStore = useLogStore()
const settings = useSettingsStore()

const MODULES = [
  { value: 'account', label: '账号' },
  { value: 'repo', label: '仓库' },
  { value: 'branch', label: '分支' },
  { value: 'action', label: 'Action' },
  { value: 'release', label: 'Release' },
  { value: 'file', label: '文件' },
  { value: 'settings', label: '设置' },
  { value: 'backup', label: '备份' },
  { value: 'lock', label: '安全' },
  { value: 'system', label: '系统' }
]

const logs = ref<OpLog[]>([])
const loading = ref(false)
const filterModule = ref('')
const filterLevel = ref('')
const keyword = ref('')

const filtered = computed(() =>
  logs.value.filter(l => {
    if (filterModule.value && l.module !== filterModule.value) return false
    if (filterLevel.value && l.level !== filterLevel.value) return false
    if (keyword.value) {
      const kw = keyword.value.toLowerCase()
      if (!l.action.toLowerCase().includes(kw) && !l.detail.toLowerCase().includes(kw)) return false
    }
    return true
  })
)

function moduleLabel(m: string) {
  return MODULES.find(x => x.value === m)?.label || m
}

function levelType(level: string) {
  return level === 'success' ? 'success' : level === 'warning' ? 'warning' : level === 'error' ? 'danger' : 'info'
}

function levelLabel(level: string) {
  return { info: '信息', success: '成功', warning: '警告', error: '错误' }[level] || level
}

async function load() {
  loading.value = true
  await logStore.refresh()
  logs.value = logStore.logs
  loading.value = false
}

function applyFilter() {
  /* computed 自动响应 */
}

async function onExport() {
  const json = await logStore.exportJson()
  textDownload(json, `gitgreen-logs-${Date.now()}.json`)
  ElMessage.success('日志已导出')
}

async function onClear() {
  try {
    await ElMessageBox.confirm('确认清空全部操作日志？', '二次确认', { type: 'warning' })
  } catch {
    return
  }
  await logStore.clearAll()
  logs.value = []
  ElMessage.success('日志已清空')
}

onMounted(load)
</script>

<style scoped>
.page-toolbar {
  margin-bottom: 14px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.retention {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: auto;
}
</style>
