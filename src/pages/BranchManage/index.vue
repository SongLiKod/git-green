<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <van-empty v-if="!ctx" description="请在顶栏选择仓库" />
      <template v-else>
        <div class="m-toolbar">
          <van-button type="primary" size="small" @click="openCreate">创建分支</van-button>
          <van-button size="small" :loading="loading" @click="loadBranches">刷新</van-button>
        </div>
        <div v-for="b in branches" :key="b.name" class="m-card">
          <div class="m-card-head">
            <div class="m-card-title">
              <div class="t">{{ b.name }}</div>
              <div class="m-sub" title="点击查看提交详情"><span class="m-link" @click="openCommit(b)">{{ b.commit.sha.slice(0, 8) }}</span></div>
            </div>
            <van-tag v-if="b.name === repo?.default_branch" type="success">默认</van-tag>
            <van-tag v-if="b.protected" type="warning">保护</van-tag>
          </div>
          <div class="m-actions">
            <van-button size="mini" plain @click="openRename(b)">重命名</van-button>
            <van-button size="mini" plain @click="openProtect(b)">保护规则</van-button>
            <van-button size="mini" type="danger" plain @click="onDelete(b)">删除</van-button>
          </div>
        </div>

        <div class="m-section-title">分支差异对比</div>
        <van-cell-group inset>
          <van-cell title="基准分支" :value="diffBase || '选择'" is-link @click="openPicker('base')" />
          <van-cell title="对比分支" :value="diffHead || '选择'" is-link @click="openPicker('head')" />
        </van-cell-group>
        <div class="m-toolbar">
          <van-button type="primary" size="small" :loading="diffLoading" @click="runDiff">开始对比</van-button>
        </div>
        <div v-if="diff" class="m-card">
          <div class="m-meta">
            <van-tag type="success">领先 {{ diff.ahead_by }}</van-tag>
            <van-tag type="warning">落后 {{ diff.behind_by }}</van-tag>
            <van-tag>{{ diff.status }}</van-tag>
            <van-tag plain type="primary">差异提交 {{ diff.total_commits }}</van-tag>
          </div>
          <FileDiffList :files="diff.files" @preview="previewDiffFile" />
        </div>

        <van-popup v-model:show="commitVisible" position="bottom" round :style="{ height: '86%' }">
          <div class="m-popup" v-if="commitDetail">
            <div class="m-popup-title">提交 {{ commitDetail.sha.slice(0, 7) }}</div>
            <div class="m-sub">{{ commitDetail.sha }}</div>
            <pre class="m-code">{{ commitDetail.commit.message }}</pre>
            <div class="m-sub">{{ commitDetail.commit.author.name }} · {{ commitDetail.author?.login || '未知' }} · {{ new Date(commitDetail.commit.author.date).toLocaleString() }}</div>
            <template v-if="commitDetail.files && commitDetail.files.length">
              <div class="m-section-title" style="margin: 12px 0 8px">变更文件（{{ commitDetail.files.length }}）</div>
<FileDiffList :files="commitDetail.files" @preview="previewCommitFile" />
            </template>
            <van-button block style="margin-top: 10px" @click="commitVisible = false">关闭</van-button>
          </div>
        </van-popup>

        <van-popup v-model:show="createVisible" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">创建远程分支</div>
            <van-cell-group inset>
              <van-field v-model="createForm.name" label="新分支名" placeholder="feature/xxx" required />
              <van-field :model-value="createForm.from" label="源分支" placeholder="选择源分支" readonly is-link @click="openPicker('from')" />
            </van-cell-group>
            <van-button block type="primary" style="margin-top: 14px" :loading="saving" @click="submitCreate">创建</van-button>
          </div>
        </van-popup>

        <van-popup v-model:show="protectVisible" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">保护规则 - {{ protectTarget }}</div>
            <van-cell-group inset>
              <van-cell title="管理员强制"><template #value><van-switch v-model="protection.enforceAdmins" size="20" /></template></van-cell>
              <van-cell title="状态检查"><template #value><van-switch v-model="protection.statusChecks" size="20" /></template></van-cell>
              <van-field v-model="contextsText" label="必需检查项" placeholder="逗号分隔" :disabled="!protection.statusChecks" />
              <van-cell title="PR审核"><template #value><van-switch v-model="protection.prReviews" size="20" /></template></van-cell>
              <van-cell title="必需批准数"><template #value><van-stepper v-model="protection.reviewCount" min="1" max="6" /></template></van-cell>
            </van-cell-group>
            <div class="m-actions">
              <van-button type="primary" block :loading="saving" @click="submitProtect">保存绑定</van-button>
              <van-button type="danger" plain block @click="removeProtect">移除规则</van-button>
            </div>
          </div>
        </van-popup>

        <van-popup v-model:show="pickerVisible" position="bottom" round>
          <van-picker :columns="pickerColumns" @confirm="onPickerConfirm" @cancel="pickerVisible = false" />
        </van-popup>
      </template>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
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
          <el-table-column label="最新提交" width="150">
            <template #default="{ row }">
              <el-button link type="primary" @click="openCommit(row)">{{ row.commit.sha.slice(0, 8) }}</el-button>
            </template>
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
          <FileDiffList :files="diff.files" @preview="previewDiffFile" />
        </template>
      </el-card>
    </template>
    <el-empty v-else description="请先选择仓库" />

    <el-dialog v-model="commitVisible" :title="commitDetail ? `提交 ${commitDetail.sha.slice(0, 7)}` : ''" width="680px" top="4vh">
      <template v-if="commitDetail">
        <pre class="body-pre">{{ commitDetail.commit.message }}</pre>
        <div class="comment-meta">{{ commitDetail.sha }} · {{ commitDetail.commit.author.name }} · {{ commitDetail.author?.login || '未知' }} · {{ new Date(commitDetail.commit.author.date).toLocaleString() }}</div>
        <template v-if="commitDetail.files && commitDetail.files.length">
          <div class="sub-title">变更文件（{{ commitDetail.files.length }}）</div>
          <FileDiffList :files="commitDetail.files" @preview="previewCommitFile" />
        </template>
      </template>
      <template #footer>
        <el-button @click="commitVisible = false">关闭</el-button>
      </template>
    </el-dialog>

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
    </template>

    <SourceFilePreview v-model="filePreviewVisible" :filename="previewFilename" :load="previewLoader" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'BranchManage' })
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
import { getCommit } from '@/api/githubIssue'
import type { GithubCommitInfo } from '@/api/githubIssue'
import { useIsMobile } from '@/utils/platform'
import FileDiffList, { type DiffFile } from '@/components/FileDiffList.vue'
import SourceFilePreview, { loadSourcePreview } from '@/components/SourceFilePreview.vue'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()
const isMobile = useIsMobile()

const contextsText = ref('')
const pickerVisible = ref(false)
const pickerTarget = ref<'from' | 'base' | 'head'>('base')
const pickerColumns = computed(() => branches.value.map(b => ({ text: b.name })))

function openPicker(target: 'from' | 'base' | 'head') {
  pickerTarget.value = target
  pickerVisible.value = true
}

function onPickerConfirm(payload: { selectedValues: string[] }) {
  const v = payload.selectedValues[0]
  if (pickerTarget.value === 'from') createForm.from = v
  else if (pickerTarget.value === 'base') diffBase.value = v
  else diffHead.value = v
  pickerVisible.value = false
}

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

/** 仅新增/修改的文件可点击预览源文件（对比分支存在该文件） */
function fileClickable(f: DiffFile): boolean {
  return f.status === 'added' || f.status === 'modified'
}

const filePreviewVisible = ref(false)
const previewFilename = ref('')
const previewRef = ref('')

function openFilePreview(f: DiffFile, ref: string) {
  if (!fileClickable(f)) return
  previewFilename.value = f.filename
  previewRef.value = ref
  filePreviewVisible.value = true
}

function previewDiffFile(f: DiffFile) {
  if (!diffHead.value) return
  openFilePreview(f, diffHead.value)
}

function previewCommitFile(f: DiffFile) {
  if (!commitDetail.value) return
  openFilePreview(f, commitDetail.value.sha)
}

async function previewLoader(name: string) {
  const c = ctx.value
  if (!c || !previewRef.value) throw new Error('预览上下文已失效')
  const pat = await withPat()
  return loadSourcePreview(pat, c.owner, c.repo, name, previewRef.value)
}

const commitVisible = ref(false)
const commitDetail = ref<GithubCommitInfo | null>(null)

async function openCommit(b: GitHubBranch) {
  if (!ctx.value) return
  commitVisible.value = true
  commitDetail.value = null
  const pat = await withPat()
  const res = await getCommit(pat, ctx.value.owner, ctx.value.repo, b.commit.sha)
  commitDetail.value = res.code === 200 ? res.data || null : null
  if (res.code !== 200) ElMessage.error(`提交详情加载失败：${res.msg}`)
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
  contextsText.value = protection.contexts.join(',')
}

async function submitProtect() {
  if (!ctx.value) return
  if (contextsText.value) {
    protection.contexts = contextsText.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  }
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

watch(() => [repoStore.currentRepoFullName, repoStore.currentRepo?.id, accountStore.activeId], loadBranches)
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
.m-link {
  color: var(--color-primary);
  cursor: pointer;
}
.m-link:hover {
  text-decoration: underline;
}
.body-pre {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 13px;
}
.comment-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0 12px;
  word-break: break-all;
}
.sub-title {
  font-weight: 600;
  margin: 12px 0 8px;
}
</style>
