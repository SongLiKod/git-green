<template>
  <div class="page">
    <RepoContextBar />
    <template v-if="ctx">
      <el-tabs v-model="tab" class="action-tabs">
        <el-tab-pane label="Workflow工作流" name="workflows">
          <el-table :data="workflows" border stripe v-loading="loading">
            <el-table-column prop="name" label="工作流名称" min-width="160" />
            <el-table-column prop="path" label="文件路径" min-width="220">
              <template #default="{ row }"><span class="mono">{{ row.path }}</span></template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.state === 'active' ? 'success' : 'info'">
                  {{ row.state === 'active' ? '启用' : row.state }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="280">
              <template #default="{ row }">
                <el-button link type="primary" @click="openTrigger(row)">触发</el-button>
                <el-button link @click="viewRuns(row)">运行记录</el-button>
                <el-button link type="primary" @click="openEditor(row)">编辑YML</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="执行记录" name="runs">
          <div class="runs-toolbar">
            <el-select v-model="runFilterWorkflow" clearable placeholder="全部工作流" style="width: 220px" @change="loadRuns">
              <el-option v-for="w in workflows" :key="w.id" :label="w.name" :value="w.id" />
            </el-select>
            <el-button @click="loadRuns">刷新</el-button>
            <el-checkbox v-model="autoRefresh">自动刷新（运行中实时状态）</el-checkbox>
          </div>
          <el-table :data="runs" border stripe v-loading="runsLoading">
            <el-table-column label="运行" min-width="200">
              <template #default="{ row }">
                <span class="mono">#{{ row.run_number }}</span> {{ row.display_title || row.name }}
              </template>
            </el-table-column>
            <el-table-column prop="branch" label="分支" width="140" />
            <el-table-column prop="event" label="触发方式" width="130" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="runTagType(row)">{{ runText(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="开始时间" width="170">
              <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="220">
              <template #default="{ row }">
                <el-button link type="primary" @click="openLogs(row)">日志</el-button>
                <el-button v-if="row.status !== 'completed'" link type="warning" @click="cancel(row)">取消</el-button>
                <el-button v-if="row.status === 'completed'" link @click="rerun(row)">重新运行</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </template>
    <el-empty v-else description="请先选择仓库" />

    <el-dialog v-model="triggerVisible" title="手动触发流水线" width="440px">
      <el-form label-width="80px">
        <el-form-item label="工作流">
          <span>{{ triggerTarget?.name }}</span>
        </el-form-item>
        <el-form-item label="分支">
          <el-select v-model="triggerRef" filterable style="width: 100%">
            <el-option v-for="b in branchNames" :key="b" :label="b" :value="b" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="triggerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitTrigger">触发运行</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editorVisible" :title="`在线编辑 ${editorPath}`" width="760px" top="4vh">
      <el-input v-model="editorContent" type="textarea" :rows="22" class="yml-editor" spellcheck="false" />
      <el-input v-model="commitMessage" placeholder="提交信息（commit message）" style="margin-top: 10px" />
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveWorkflowYml">保存并提交到远程仓库</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="logsVisible" :title="`运行日志 #${logsRun?.run_number || ''}（实时流式）`" width="820px" top="4vh">
      <pre ref="logsRef" class="logs-box">{{ logsText || '等待日志输出...' }}</pre>
      <template #footer>
        <el-tag v-if="logsRunning" type="warning">运行中，每3秒自动刷新...</el-tag>
        <el-button @click="closeLogs">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import RepoContextBar from '@/components/RepoContextBar.vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import {
  listWorkflows,
  listRuns,
  triggerWorkflow,
  cancelRun,
  rerunRun,
  getRunLogs,
  getWorkflowFileContent,
  saveWorkflowFile
} from '@/api/githubAction'
import type { Workflow, WorkflowRun } from '@/api/githubAction'
import { getBranches } from '@/api/githubBranch'
import { base64ToUtf8 } from '@/utils/crypto'

const accountStore = useAccountStore()
const repoStore = useRepoStore()

const ctx = computed(() => repoStore.currentOwnerName())
const tab = ref('workflows')
const loading = ref(false)
const runsLoading = ref(false)
const saving = ref(false)

const workflows = ref<Workflow[]>([])
const runs = ref<WorkflowRun[]>([])
const runFilterWorkflow = ref<number | undefined>(undefined)
const autoRefresh = ref(false)
const branchNames = ref<string[]>([])

const triggerVisible = ref(false)
const triggerTarget = ref<Workflow | null>(null)
const triggerRef = ref('')

const editorVisible = ref(false)
const editorPath = ref('')
const editorSha = ref('')
const editorWorkflowId = ref(0)
const editorContent = ref('')
const commitMessage = ref('Update workflow')

const logsVisible = ref(false)
const logsRun = ref<WorkflowRun | null>(null)
const logsText = ref('')
const logsRunning = ref(false)
const logsRef = ref<HTMLElement>()
let logsTimer: number | undefined
let refreshTimer: number | undefined

async function withPat() {
  return await accountStore.getPat(repoStore.currentAccountId)
}

async function loadWorkflows() {
  if (!ctx.value) return
  loading.value = true
  const pat = await withPat()
  const res = await listWorkflows(pat, ctx.value.owner, ctx.value.repo)
  loading.value = false
  if (res.code === 200) workflows.value = res.data?.workflows || []
  else ElMessage.error(`工作流加载失败：${res.msg}`)
  const bres = await getBranches(pat, ctx.value.owner, ctx.value.repo)
  if (bres.code === 200) branchNames.value = (bres.data || []).map(b => b.name)
}

async function loadRuns() {
  if (!ctx.value) return
  runsLoading.value = true
  const pat = await withPat()
  const res = await listRuns(pat, ctx.value.owner, ctx.value.repo, runFilterWorkflow.value)
  runsLoading.value = false
  if (res.code === 200) runs.value = res.data?.workflow_runs || []
  else ElMessage.error(`运行记录加载失败：${res.msg}`)
}

function runTagType(row: WorkflowRun) {
  if (row.status === 'in_progress' || row.status === 'queued') return 'warning'
  if (row.conclusion === 'success') return 'success'
  if (row.conclusion === 'cancelled') return 'info'
  return 'danger'
}

function runText(row: WorkflowRun) {
  if (row.status === 'in_progress') return '运行中'
  if (row.status === 'queued') return '排队中'
  if (row.status === 'completed') {
    return ({ success: '成功', failure: '失败', cancelled: '取消', skipped: '跳过', neutral: '无结果', timed_out: '超时', action_required: '需处理' } as Record<string, string>)[row.conclusion || ''] || row.conclusion
  }
  return row.status
}

function viewRuns(w: Workflow) {
  runFilterWorkflow.value = w.id
  tab.value = 'runs'
  loadRuns()
}

function openTrigger(w: Workflow) {
  triggerTarget.value = w
  triggerRef.value = repoStore.currentRepo?.default_branch || branchNames.value[0] || 'main'
  triggerVisible.value = true
}

async function submitTrigger() {
  if (!ctx.value || !triggerTarget.value) return
  saving.value = true
  const pat = await withPat()
  const res = await triggerWorkflow(pat, ctx.value.owner, ctx.value.repo, triggerTarget.value.id, triggerRef.value)
  saving.value = false
  if (res.code === 200 || res.code === 202) {
    ElMessage.success('流水线已触发（若失败请确认该Workflow是否支持 workflow_dispatch 事件）')
    triggerVisible.value = false
    tab.value = 'runs'
    loadRuns()
  } else {
    ElMessage.error(`触发失败：${res.msg}`)
  }
}

async function cancel(row: WorkflowRun) {
  if (!ctx.value) return
  try {
    await ElMessageBox.confirm(`确认取消运行 #${row.run_number}？`, '二次确认', { type: 'warning' })
  } catch {
    return
  }
  const pat = await withPat()
  const res = await cancelRun(pat, ctx.value.owner, ctx.value.repo, row.id)
  if (res.code === 202) {
    ElMessage.success('已提交取消请求')
    loadRuns()
  } else {
    ElMessage.error(`取消失败：${res.msg}`)
  }
}

async function rerun(row: WorkflowRun) {
  if (!ctx.value) return
  const pat = await withPat()
  const res = await rerunRun(pat, ctx.value.owner, ctx.value.repo, row.id)
  if (res.code === 201 || res.code === 200) {
    ElMessage.success('已重新运行')
    loadRuns()
  } else {
    ElMessage.error(`重跑失败：${res.msg}`)
  }
}

/* 实时流式日志：轮询拉取合并 Job 日志 */
async function openLogs(row: WorkflowRun) {
  logsRun.value = row
  logsText.value = ''
  logsVisible.value = true
  logsRunning.value = true
  await pullLogs()
  logsTimer = window.setInterval(pullLogs, 3000)
}

async function pullLogs() {
  if (!ctx.value || !logsRun.value) return
  const pat = await withPat()
  const res = await getRunLogs(pat, ctx.value.owner, ctx.value.repo, logsRun.value.id)
  if (res.code === 200) {
    logsText.value = res.data || ''
    nextTick(() => {
      if (logsRef.value) logsRef.value.scrollTop = logsRef.value.scrollHeight
    })
  }
  const runRes = await listRuns(pat, ctx.value.owner, ctx.value.repo, undefined)
  if (runRes.code === 200) {
    const cur = (runRes.data?.workflow_runs || []).find(r => r.id === logsRun.value?.id)
    if (cur) {
      logsRun.value = cur
      logsRunning.value = cur.status !== 'completed'
      if (cur.status === 'completed' && logsTimer) {
        window.clearInterval(logsTimer)
        logsTimer = undefined
      }
    }
  }
}

function closeLogs() {
  logsVisible.value = false
  if (logsTimer) {
    window.clearInterval(logsTimer)
    logsTimer = undefined
  }
}

/* 在线编辑 Workflow yml */
async function openEditor(w: Workflow) {
  if (!ctx.value) return
  const pat = await withPat()
  const res = await getWorkflowFileContent(pat, ctx.value.owner, ctx.value.repo, w.path, repoStore.currentRepo?.default_branch || 'main')
  if (res.code !== 200 || !res.data) {
    ElMessage.error(`读取失败：${res.msg}`)
    return
  }
  editorWorkflowId.value = w.id
  editorPath.value = w.path
  editorSha.value = res.data.sha
  editorContent.value = res.data.content ? base64ToUtf8(res.data.content) : ''
  commitMessage.value = `Update ${w.path}`
  editorVisible.value = true
}

async function saveWorkflowYml() {
  if (!ctx.value) return
  if (!commitMessage.value.trim()) {
    ElMessage.warning('请输入提交信息')
    return
  }
  saving.value = true
  const pat = await withPat()
  const res = await saveWorkflowFile(
    pat,
    ctx.value.owner,
    ctx.value.repo,
    editorPath.value,
    editorContent.value,
    editorSha.value,
    commitMessage.value.trim(),
    repoStore.currentRepo?.default_branch || 'main'
  )
  saving.value = false
  if (res.code === 200) {
    ElMessage.success('Workflow 已保存并直接提交到远程仓库')
    editorVisible.value = false
    loadWorkflows()
  } else {
    ElMessage.error(`保存失败：${res.msg}`)
  }
}

watch(autoRefresh, v => {
  if (v) refreshTimer = window.setInterval(loadRuns, 5000)
  else if (refreshTimer) window.clearInterval(refreshTimer)
})

watch(() => repoStore.currentRepoFullName, () => {
  loadWorkflows()
  loadRuns()
})
watch(() => accountStore.activeId, () => {
  loadWorkflows()
  loadRuns()
})

onMounted(() => {
  loadWorkflows()
  loadRuns()
})
onBeforeUnmount(() => {
  closeLogs()
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<style scoped>
.mono {
  font-family: Consolas, monospace;
}
.action-tabs {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 14px;
}
.runs-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.logs-box {
  background: #0d1117;
  color: #c9d1d9;
  padding: 12px;
  border-radius: 6px;
  height: 56vh;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
:deep(.yml-editor textarea) {
  font-family: Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}
</style>
