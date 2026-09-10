<template>
  <div class="page">
    <RepoContextBar />
    <template v-if="ctx">
      <el-card shadow="never" class="mb14">
        <template #header>
          <div class="card-header">
            <span>远程分支（{{ branches.length }}）</span>
            <div>
              <el-button type="primary" @click="openCreate">创建分支</el-button>
              <el-button @click="loadBranches">刷新</el-button>
            </div>
          </div>
        </template>
        <el-table :data="branches" border stripe v-loading="loading" max-height="360">
          <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
          <el-table-column label="分支名" min-width="200">
            <template #default="{ row }">
              <span class="branch-name">{{ row.name }}</span>
              <el-tag v-if="row.name === repo?.default_branch" size="small" type="success">默认</el-tag>
              <el-tag v-if="row.protected" size="small" type="warning">受保护</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最新提交" width="140">
            <template #default="{ row }">{{ row.commit.sha.slice(0, 8) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="260">
            <template #default="{ row }">
              <el-button link type="primary" @click="openRename(row)">重命名</el-button>
              <el-button link @click="openProtect(row)">保护规则</el-button>
              <el-button link type="danger" @click="onDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>分支差异对比</template>
        <div class="diff-toolbar">
          <span>基准分支</span>
          <el-select v-model="diffBase" filterable placeholder="base" style="width: 200px">
            <el-option v-for="b in branches" :key="b.name" :label="b.name" :value="b.name" />
          </el-select>
          <span>对比分支</span>
          <el-select v-model="diffHead" filterable placeholder="head" style="width: 200px">
            <el-option v-for="b in branches" :key="b.name" :label="b.name" :value="b.name" />
          </el-select>
          <el-button type="primary" :loading="diffLoading" @click="runDiff">开始对比</el-button>
        </div>
        <template v-if="diff">
          <div class="diff-summary">
            <el-tag type="success">领先 {{ diff.ahead_by }} 提交</el-tag>
            <el-tag type="warning">落后 {{ diff.behind_by }} 提交</el-tag>
            <el-tag>状态：{{ diff.status }}</el-tag>
            <el-tag type="info">共 {{ diff.total_commits }} 个差异提交</el-tag>
          </div>
          <el-table :data="diff.files" border size="small" max-height="260">
            <el-table-column prop="filename" label="变更文件" min-width="240" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">{{ statusText(row.status) }}</template>
            </el-table-column>
            <el-table-column prop="additions" label="新增" width="80" />
            <el-table-column prop="deletions" label="删除" width="80" />
          </el-table>
        </template>
      </el-card>
    </template>
    <el-empty v-else description="请先选择仓库" />

    <el-dialog v-model="createVisible" title="创建远程分支" width="440px">
      <el-form label-width="90px">
        <el-form-item label="新分支名" required>
          <el-input v-model="createForm.name" placeholder="feature/xxx" />
        </el-form-item>
        <el-form-item label="源分支" required>
          <el-select v-model="createForm.from" filterable style="width: 100%">
            <el-option v-for="b in branches" :key="b.name" :label="b.name" :value="b.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="protectVisible" :title="`分支保护规则 - ${protectTarget}`" width="480px">
      <el-form label-width="100px">
        <el-form-item label="管理员强制"><el-switch v-model="protection.enforceAdmins" /></el-form-item>
        <el-form-item label="状态检查"><el-switch v-model="protection.statusChecks" /></el-form-item>
        <el-form-item label="必需检查项">
          <el-select v-model="protection.contexts" multiple filterable allow-create default-first-option style="width: 100%" :disabled="!protection.statusChecks" />
        </el-form-item>
        <el-form-item label="PR审核"><el-switch v-model="protection.prReviews" /></el-form-item>
        <el-form-item label="必需批准数">
          <el-input-number v-model="protection.reviewCount" :min="1" :max="6" :disabled="!protection.prReviews" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="protectVisible = false">取消</el-button>
        <el-button type="danger" plain @click="removeProtect">移除规则</el-button>
        <el-button type="primary" :loading="saving" @click="submitProtect">保存绑定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'BranchManage' })
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import RepoContextBar from '@/components/RepoContextBar.vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useLogStore } from '@/stores/useLogStore'
import {
  getBranches,
  createBranch,
  deleteBranch,
  renameBranch,
  getBranchDiff,
  getBranchProtection,
  saveBranchProtection,
  deleteBranchProtection
} from '@/api/githubBranch'
import type { GitHubBranch, BranchCompareResult } from '@/api/githubBranch'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()

const repo = computed(() => repoStore.currentRepo)
const ctx = computed(() => repoStore.currentOwnerName())

const branches = ref<GitHubBranch[]>([])
const loading = ref(false)
const saving = ref(false)

const createVisible = ref(false)
const createForm = reactive({ name: '', from: '' })

const diffBase = ref('')
const diffHead = ref('')
const diffLoading = ref(false)
const diff = ref<BranchCompareResult | null>(null)

const protectVisible = ref(false)
const protectTarget = ref('')
const protection = reactive({
  enforceAdmins: false,
  statusChecks: false,
  contexts: [] as string[],
  prReviews: false,
  reviewCount: 1
})

async function withPat() {
  return await accountStore.getPat(repoStore.currentAccountId)
}

async function loadBranches() {
  if (!ctx.value) return
  loading.value = true
  const pat = await withPat()
  const res = await getBranches(pat, ctx.value.owner, ctx.value.repo)
  loading.value = false
  if (res.code === 200) {
    branches.value = res.data || []
    if (!diffBase.value) diffBase.value = repo.value?.default_branch || branches.value[0]?.name || ''
    if (!diffHead.value) diffHead.value = branches.value.find(b => b.name !== diffBase.value)?.name || ''
  } else {
    ElMessage.error(`分支加载失败：${res.msg}`)
  }
}

function openCreate() {
  createForm.name = ''
  createForm.from = repo.value?.default_branch || branches.value[0]?.name || ''
  createVisible.value = true
}

async function submitCreate() {
  if (!ctx.value || !createForm.name.trim()) {
    ElMessage.warning('请输入新分支名')
    return
  }
  saving.value = true
  const pat = await withPat()
  const res = await createBranch(pat, ctx.value.owner, ctx.value.repo, createForm.name.trim(), createForm.from)
  saving.value = false
  if (res.code === 200 || res.code === 201) {
    ElMessage.success(`分支 ${createForm.name} 创建成功`)
    logStore.write({ module: 'branch', action: '创建分支', detail: `${ctx.value.owner}/${ctx.value.repo}：${createForm.from} → ${createForm.name}`, level: 'success' })
    createVisible.value = false
    loadBranches()
  } else {
    ElMessage.error(`创建失败：${res.msg}`)
  }
}

async function onDelete(row: GitHubBranch) {
  if (!ctx.value) return
  try {
    await ElMessageBox.confirm(
      `高危操作：确认删除远程分支「${row.name}」？该操作不可恢复。`,
      '删除分支',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const pat = await withPat()
  const res = await deleteBranch(pat, ctx.value.owner, ctx.value.repo, row.name)
  if (res.code === 200 || res.code === 204) {
    ElMessage.success('分支已删除')
    logStore.write({ module: 'branch', action: '删除分支', detail: `${ctx.value.owner}/${ctx.value.repo}：${row.name}`, level: 'warning' })
    loadBranches()
  } else {
    ElMessage.error(`删除失败：${res.msg}`)
  }
}

async function openRename(row: GitHubBranch) {
  let newName = ''
  try {
    const r = await ElMessageBox.prompt(`将分支「${row.name}」重命名为：`, '重命名分支', {
      inputPattern: /^[^/\s][^\s]*$/,
      inputErrorMessage: '分支名不合法',
      confirmButtonText: '下一步',
      cancelButtonText: '取消'
    })
    newName = String(r.value).trim()
  } catch {
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认将「${row.name}」重命名为「${newName}」？将执行：新建分支 → 迁移提交 → 删除原分支${row.name === repo.value?.default_branch ? '（该分支为默认分支，将同步切换默认分支）' : ''}。`,
      '高危操作二次确认',
      { type: 'warning', confirmButtonText: '确认重命名', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  if (!ctx.value) return
  const pat = await withPat()
  const res = await renameBranch(pat, ctx.value.owner, ctx.value.repo, row.name, newName, repo.value?.default_branch || '')
  if (res.code === 200 || res.code === 204) {
    ElMessage.success('分支重命名完成')
    logStore.write({ module: 'branch', action: '重命名分支', detail: `${ctx.value.owner}/${ctx.value.repo}：${row.name} → ${newName}`, level: 'warning' })
    await repoStore.refreshCurrent()
    loadBranches()
  } else {
    ElMessage.error(`重命名失败：${res.msg}`)
  }
}

async function runDiff() {
  if (!ctx.value || !diffBase.value || !diffHead.value) {
    ElMessage.warning('请选择两个对比分支')
    return
  }
  diffLoading.value = true
  const pat = await withPat()
  const res = await getBranchDiff(pat, ctx.value.owner, ctx.value.repo, diffBase.value, diffHead.value)
  diffLoading.value = false
  if (res.code === 200) diff.value = res.data || null
  else ElMessage.error(`对比失败：${res.msg}`)
}

function statusText(s: string) {
  return ({ added: '新增', removed: '删除', modified: '修改', renamed: '重命名' } as Record<string, string>)[s] || s
}

async function openProtect(row: GitHubBranch) {
  protectTarget.value = row.name
  protectVisible.value = true
  if (!ctx.value) return
  const pat = await withPat()
  const res = await getBranchProtection(pat, ctx.value.owner, ctx.value.repo, row.name)
  if (res.code === 200 && res.data) {
    protection.enforceAdmins = !!res.data.enforce_admins
    protection.statusChecks = !!res.data.required_status_checks
    protection.contexts = res.data.required_status_checks?.contexts || []
    protection.prReviews = !!res.data.required_pull_request_reviews
    protection.reviewCount = res.data.required_pull_request_reviews?.required_approving_review_count || 1
  } else {
    protection.enforceAdmins = false
    protection.statusChecks = false
    protection.contexts = []
    protection.prReviews = false
    protection.reviewCount = 1
  }
}

async function submitProtect() {
  if (!ctx.value) return
  saving.value = true
  const pat = await withPat()
  const res = await saveBranchProtection(pat, ctx.value.owner, ctx.value.repo, protectTarget.value, {
    required_status_checks: protection.statusChecks ? { strict: true, contexts: protection.contexts } : null,
    required_pull_request_reviews: protection.prReviews ? { required_approving_review_count: protection.reviewCount } : null,
    enforce_admins: protection.enforceAdmins ? {} : null,
    restrictions: null
  })
  saving.value = false
  if (res.code === 200) {
    ElMessage.success('保护规则已绑定')
    logStore.write({ module: 'branch', action: '绑定保护规则', detail: `${ctx.value.owner}/${ctx.value.repo}:${protectTarget.value}`, level: 'warning' })
    protectVisible.value = false
    loadBranches()
  } else {
    ElMessage.error(`保存失败：${res.msg}`)
  }
}

async function removeProtect() {
  if (!ctx.value) return
  try {
    await ElMessageBox.confirm(`确认移除分支「${protectTarget.value}」的保护规则？`, '二次确认', { type: 'warning' })
  } catch {
    return
  }
  const pat = await withPat()
  const res = await deleteBranchProtection(pat, ctx.value.owner, ctx.value.repo, protectTarget.value)
  if (res.code === 200 || res.code === 204) {
    ElMessage.success('保护规则已移除')
    logStore.write({ module: 'branch', action: '移除保护规则', detail: `${ctx.value.owner}/${ctx.value.repo}:${protectTarget.value}`, level: 'warning' })
    protectVisible.value = false
    loadBranches()
  } else {
    ElMessage.error(`移除失败：${res.msg}`)
  }
}

watch(() => repoStore.currentRepoFullName, loadBranches)
watch(() => accountStore.activeId, loadBranches)
onMounted(loadBranches)
</script>

<style scoped>
.mb14 {
  margin-bottom: 14px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.branch-name {
  font-family: Consolas, monospace;
  margin-right: 6px;
}
.diff-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  color: var(--text-secondary);
}
.diff-summary {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
</style>
