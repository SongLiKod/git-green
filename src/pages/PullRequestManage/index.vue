<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <van-empty v-if="!ctx" description="请在顶栏选择仓库" />
      <template v-else>
        <div class="m-toolbar">
          <van-dropdown-menu style="flex: 1">
            <van-dropdown-item v-model="state" :options="stateOptions" @change="loadPRs" />
          </van-dropdown-menu>
          <van-button size="small" :loading="loading" @click="loadPRs">刷新</van-button>
          <van-button size="small" type="primary" @click="openCreate">新建</van-button>
        </div>
        <van-empty v-if="prs.length === 0" description="暂无 Pull Request" />
        <div v-for="p in prs" :key="p.number" class="m-card" @click="openDetail(p)">
          <div class="m-card-head">
            <div class="m-card-title">
              <div class="t">#{{ p.number }} {{ p.title }}</div>
              <div class="m-sub">{{ p.head.ref }} → {{ p.base.ref }} · {{ p.user?.login }}</div>
            </div>
            <van-tag v-if="p.draft" type="default">草稿</van-tag>
            <van-tag v-else-if="p.merged_at" type="primary">已合并</van-tag>
            <van-tag v-else :type="p.state === 'open' ? 'success' : 'danger'">{{ p.state === 'open' ? '开放' : '已关闭' }}</van-tag>
          </div>
        </div>

        <van-popup v-model:show="detailVisible" position="bottom" round :style="{ height: '86%' }">
          <div class="m-popup" v-if="detail">
            <div class="m-popup-title">#{{ detail.number }} {{ detail.title }}</div>
            <div class="m-sub">{{ detail.head.ref }} → {{ detail.base.ref }} · {{ detail.user?.login }}</div>
            <pre class="m-code" style="max-height: 18vh">{{ detail.body || '（无描述）' }}</pre>
            <div class="m-section-title" style="margin-left: 0">变更文件（{{ files.length }}）</div>
            <FileDiffList :files="files" @preview="openFilePreview" />
            <div class="m-section-title" style="margin-left: 0">评论（{{ comments.length }}）</div>
            <div v-for="c in comments" :key="c.id" class="m-card" style="margin: 0 0 8px">
              <div class="m-sub">{{ c.user?.login }} · {{ new Date(c.created_at).toLocaleString() }}</div>
              <pre class="m-code" style="max-height: none; border: none; padding: 6px 0">{{ c.body }}</pre>
            </div>
            <van-field v-model="newComment" type="textarea" rows="2" placeholder="写评论..." />
            <div class="m-actions">
              <van-button size="small" type="primary" plain :loading="saving" @click="submitComment">评论</van-button>
              <template v-if="detail.state === 'open'">
                <van-button size="small" type="success" plain :loading="saving" @click="doReview('APPROVE')">通过</van-button>
                <van-button size="small" type="warning" plain :loading="saving" @click="doReview('REQUEST_CHANGES')">要求修改</van-button>
                <van-button size="small" type="primary" :loading="saving" @click="openMerge">合并</van-button>
                <van-button size="small" type="danger" plain :loading="saving" @click="doClose">关闭</van-button>
              </template>
            </div>
          </div>
        </van-popup>

        <van-popup v-model:show="createVisible" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">新建 Pull Request</div>
            <van-cell-group inset>
              <van-field v-model="createForm.title" label="标题" required />
              <van-field v-model="createForm.body" label="描述" type="textarea" rows="3" />
              <van-field :model-value="createForm.base" label="base" placeholder="目标分支" readonly is-link @click="openPicker('base')" />
              <van-field :model-value="createForm.head" label="head" placeholder="来源分支" readonly is-link @click="openPicker('head')" />
              <van-cell title="草稿"><template #value><van-switch v-model="createForm.draft" size="20" /></template></van-cell>
            </van-cell-group>
            <van-button block type="primary" style="margin-top: 14px" :loading="saving" @click="submitCreate">创建</van-button>
          </div>
        </van-popup>

        <van-popup v-model:show="mergeVisible" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">合并方式</div>
            <van-cell v-for="m in mergeMethods" :key="m.value" :title="m.text" clickable @click="doMerge(m.value)" />
          </div>
        </van-popup>

        <van-popup v-model:show="pickerVisible" position="bottom" round>
          <van-picker :columns="branchColumns" @confirm="onPickerConfirm" @cancel="pickerVisible = false" />
        </van-popup>
      </template>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
      <template v-if="ctx">
        <div class="page-toolbar">
          <el-select v-model="state" style="width: 130px" @change="loadPRs">
            <el-option label="开放" value="open" />
            <el-option label="已关闭" value="closed" />
            <el-option label="全部" value="all" />
          </el-select>
          <el-button @click="loadPRs">刷新</el-button>
          <el-button type="primary" @click="openCreate">新建 Pull Request</el-button>
        </div>
        <el-table :data="prs" border stripe v-loading="loading">
          <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
          <el-table-column label="Pull Request" min-width="280">
            <template #default="{ row }">
              <div class="pr-title">#{{ row.number }} {{ row.title }}</div>
              <div class="pr-meta">{{ row.head.ref }} → {{ row.base.ref }} · {{ row.user?.login }} · {{ new Date(row.updated_at).toLocaleString() }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.draft" size="small" type="info">草稿</el-tag>
              <el-tag v-else-if="row.merged_at" size="small">已合并</el-tag>
              <el-tag v-else size="small" :type="row.state === 'open' ? 'success' : 'danger'">{{ row.state === 'open' ? '开放' : '已关闭' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">详情/操作</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-dialog v-model="detailVisible" :title="detail ? `#${detail.number} ${detail.title}` : ''" width="720px" top="5vh">
          <template v-if="detail">
            <div class="pr-meta">{{ detail.head.ref }} → {{ detail.base.ref }} · {{ detail.user?.login }}</div>
            <pre class="body-pre">{{ detail.body || '（无描述）' }}</pre>
            <div class="sub-title">变更文件（{{ files.length }}）</div>
            <FileDiffList :files="files" @preview="openFilePreview" />
            <div class="sub-title">评论（{{ comments.length }}）</div>
            <div v-for="c in comments" :key="c.id" class="comment-item">
              <div class="comment-head">{{ c.user?.login }} · {{ new Date(c.created_at).toLocaleString() }}</div>
              <pre class="comment-body">{{ c.body }}</pre>
            </div>
            <el-input v-model="newComment" type="textarea" :rows="3" placeholder="写评论..." />
            <div class="footer-actions">
              <el-button type="primary" plain :loading="saving" @click="submitComment">发表评论</el-button>
              <template v-if="detail.state === 'open'">
                <el-button type="success" plain :loading="saving" @click="doReview('APPROVE')">审核通过</el-button>
                <el-button type="warning" plain :loading="saving" @click="doReview('REQUEST_CHANGES')">要求修改</el-button>
                <el-select v-model="mergeMethod" style="width: 150px">
                  <el-option label="Create a merge commit" value="merge" />
                  <el-option label="Squash and merge" value="squash" />
                  <el-option label="Rebase and merge" value="rebase" />
                </el-select>
                <el-button type="primary" :loading="saving" @click="doMerge()">合并</el-button>
                <el-button type="danger" plain :loading="saving" @click="doClose">关闭</el-button>
              </template>
            </div>
          </template>
        </el-dialog>

        <el-dialog v-model="createVisible" title="新建 Pull Request" width="560px">
          <el-form label-width="70px">
            <el-form-item label="标题" required><el-input v-model="createForm.title" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="createForm.body" type="textarea" :rows="4" /></el-form-item>
            <el-form-item label="base分支">
              <el-select v-model="createForm.base" filterable style="width: 100%">
                <el-option v-for="b in branchNames" :key="b" :label="b" :value="b" />
              </el-select>
            </el-form-item>
            <el-form-item label="head分支">
              <el-select v-model="createForm.head" filterable style="width: 100%">
                <el-option v-for="b in branchNames" :key="b" :label="b" :value="b" />
              </el-select>
            </el-form-item>
            <el-form-item label="草稿"><el-switch v-model="createForm.draft" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="createVisible = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
          </template>
        </el-dialog>
      </template>
      <el-empty v-else description="请先选择仓库" />
    </template>

    <SourceFilePreview v-model="filePreviewVisible" :filename="previewFilename" :load="previewLoader" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'PullRequestManage' })
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useLogStore } from '@/stores/useLogStore'
import { listPRs, createPR, getPRDetail, listPRFiles, reviewPR, mergePR, closePR } from '@/api/githubPullRequest'
import type { GitHubPR, PRFile } from '@/api/githubPullRequest'
import type { ApiResult } from '@/api/request'
import { listComments, commentIssue } from '@/api/githubIssue'
import type { IssueComment } from '@/api/githubIssue'
import { getBranches } from '@/api/githubBranch'
import { getCollaborators } from '@/api/githubRepo'
import { useIsMobile } from '@/utils/platform'
import FileDiffList, { type DiffFile } from '@/components/FileDiffList.vue'
import SourceFilePreview, { loadSourcePreview } from '@/components/SourceFilePreview.vue'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()
const isMobile = useIsMobile()

const ctx = computed(() => repoStore.currentOwnerName())
const repo = computed(() => repoStore.currentRepo)
const prs = ref<GitHubPR[]>([])
const branchNames = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const state = ref('open')

const detailVisible = ref(false)
const detail = ref<GitHubPR | null>(null)
const files = ref<PRFile[]>([])
const comments = ref<IssueComment[]>([])
const newComment = ref('')
const mergeMethod = ref<'merge' | 'squash' | 'rebase'>('merge')

const createVisible = ref(false)
const createForm = reactive({ title: '', body: '', base: '', head: '', draft: false })

const mergeVisible = ref(false)
const pickerVisible = ref(false)
const pickerTarget = ref<'base' | 'head'>('base')
const branchColumns = computed(() => branchNames.value.map(b => ({ text: b, value: b })))
const mergeMethods = [
  { text: 'Create a merge commit', value: 'merge' as const },
  { text: 'Squash and merge', value: 'squash' as const },
  { text: 'Rebase and merge', value: 'rebase' as const }
]

const stateOptions = [
  { text: '开放', value: 'open' },
  { text: '已关闭', value: 'closed' },
  { text: '全部', value: 'all' }
]

async function withPat() {
  return await accountStore.getPat(repoStore.currentAccountId)
}

/** 仅新增/修改的文件可点击预览源文件（PR head 分支存在该文件） */
function fileClickable(f: DiffFile): boolean {
  return f.status === 'added' || f.status === 'modified'
}

const filePreviewVisible = ref(false)
const previewFilename = ref('')

function openFilePreview(f: DiffFile) {
  if (!fileClickable(f)) return
  previewFilename.value = f.filename
  filePreviewVisible.value = true
}

async function previewLoader(name: string) {
  const c = ctx.value
  if (!c || !detail.value) throw new Error('请先打开 PR 详情')
  const pat = await withPat()
  return loadSourcePreview(pat, c.owner, c.repo, name, detail.value.head.sha)
}

async function loadPRs() {
  if (!ctx.value) return
  loading.value = true
  const pat = await withPat()
  const res = await listPRs(pat, ctx.value.owner, ctx.value.repo, state.value)
  loading.value = false
  if (res.code === 200) prs.value = res.data || []
  else ElMessage.error(`PR加载失败：${res.msg}`)
}

async function loadBranches() {
  if (!ctx.value) return
  const pat = await withPat()
  const res = await getBranches(pat, ctx.value.owner, ctx.value.repo)
  if (res.code === 200) branchNames.value = (res.data || []).map(b => b.name)
}

async function openDetail(row: GitHubPR) {
  if (!ctx.value) return
  const pat = await withPat()
  const d = await getPRDetail(pat, ctx.value.owner, ctx.value.repo, row.number)
  detail.value = d.code === 200 && d.data ? d.data : row
  files.value = []
  comments.value = []
  newComment.value = ''
  detailVisible.value = true
  const [f, c] = await Promise.all([
    listPRFiles(pat, ctx.value.owner, ctx.value.repo, row.number),
    listComments(pat, ctx.value.owner, ctx.value.repo, row.number)
  ])
  if (f.code === 200) files.value = f.data || []
  if (c.code === 200) comments.value = c.data || []
}

async function submitComment() {
  if (!ctx.value || !detail.value) return
  if (!newComment.value.trim()) {
    ElMessage.warning('请输入评论内容')
    return
  }
  saving.value = true
  const pat = await withPat()
  const res = await commentIssue(pat, ctx.value.owner, ctx.value.repo, detail.value.number, newComment.value.trim())
  saving.value = false
  if (res.code === 200 || res.code === 201) {
    ElMessage.success('评论已发布')
    logStore.write({ module: 'pull', action: '评论PR', detail: `#${detail.value.number} ${detail.value.title}` })
    openDetail(detail.value)
  } else {
    ElMessage.error(`评论失败：${res.msg}`)
  }
}

/** 自审被 GitHub 拒绝时，寻找有仓库写权限的其他账号用于审核 */
async function findReviewerAccount(
  owner: string,
  repo: string,
  authorLogin: string
): Promise<{ id: string; username: string } | null> {
  const candidates = accountStore.accounts.filter(a => a.id !== accountStore.activeId && a.username !== authorLogin)
  for (const acc of candidates) {
    const token = await accountStore.getPat(acc.id)
    if (!token) continue
    const res = await getCollaborators(token, owner, repo)
    if (res.code !== 200) continue
    const me = (res.data || []).find(c => c.login === acc.username)
    if (me && me.permissions && !(me.permissions.push || me.permissions.admin || me.permissions.maintain)) continue
    return { id: acc.id, username: acc.username }
  }
  return null
}

async function doReview(event: 'APPROVE' | 'REQUEST_CHANGES') {
  if (!ctx.value || !detail.value) return
  const comment = newComment.value.trim()
  if (event === 'REQUEST_CHANGES' && !comment) {
    ElMessage.warning('要求修改必须填写评论内容')
    return
  }
  const authorLogin = detail.value.user?.login
  const isSelfReview =
    !!authorLogin && !!accountStore.activeAccount?.username && accountStore.activeAccount.username === authorLogin
  saving.value = true
  const pat = await withPat()
  let reviewerName = ''
  let res: Promise<ApiResult> | ApiResult
  if (isSelfReview) {
    const reviewer = await findReviewerAccount(ctx.value.owner, ctx.value.repo, authorLogin)
    res = { code: 422, msg: '自审' }
    if (reviewer) {
      const token = await accountStore.getPat(reviewer.id)
      res = reviewPR(token, ctx.value.owner, ctx.value.repo, detail.value.number, event, comment)
      reviewerName = reviewer.username
    }
  } else {
    res = reviewPR(pat, ctx.value.owner, ctx.value.repo, detail.value.number, event, comment)
  }
  const r = await res
  saving.value = false
  if (r.code === 200 || r.code === 201) {
    await logStore.write({
      module: 'pull',
      action: event === 'APPROVE' ? '审核通过PR' : '要求修改PR',
      detail: `#${detail.value.number} ${detail.value.title}${reviewerName ? `（${reviewerName}）` : ''}`,
      level: 'warning'
    })
    if (reviewerName) ElMessage.success(`已由账号 ${reviewerName} 完成审核`)
    else ElMessage.success(event === 'APPROVE' ? '已审核通过' : '已要求修改')
    openDetail(detail.value)
  } else if (r.code === 422 && isSelfReview) {
    saving.value = true
    let ok = false
    if (event === 'APPROVE') {
      try {
        await ElMessageBox.confirm(
          'GitHub 不允许 PR 作者自我审核，但作者可以直接合并自己发起的 PR。是否直接进入合并？',
          '无法自我审核',
          { type: 'warning', confirmButtonText: '去合并', cancelButtonText: '取消' }
        )
        ok = true
      } catch {
        /* 用户取消 */
      }
    }
    saving.value = false
    if (ok) openMerge()
  } else {
    ElMessage.error(`审核失败：${r.msg}`)
  }
}

function openMerge() {
  mergeVisible.value = true
}

async function doMerge(method?: 'merge' | 'squash' | 'rebase') {
  if (!ctx.value || !detail.value) return
  const m = method || mergeMethod.value
  try {
    await ElMessageBox.confirm(
      `高危操作：确认以「${m === 'merge' ? 'merge commit' : m === 'squash' ? 'Squash' : 'Rebase'}」方式合并 PR #${detail.value.number}？`,
      '合并确认',
      { type: 'warning', confirmButtonText: '确认合并', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  saving.value = true
  mergeVisible.value = false
  const pat = await withPat()
  const res = await mergePR(pat, ctx.value.owner, ctx.value.repo, detail.value.number, m)
  saving.value = false
  if (res.code === 200) {
    ElMessage.success('PR已合并')
    await logStore.write({ module: 'pull', action: '合并PR', detail: `#${detail.value.number} ${detail.value.title}`, level: 'warning' })
    detailVisible.value = false
    loadPRs()
  } else {
    ElMessage.error(`合并失败：${res.msg}（可能有冲突或未通过必需检查）`)
  }
}

async function doClose() {
  if (!ctx.value || !detail.value) return
  saving.value = true
  const pat = await withPat()
  const res = await closePR(pat, ctx.value.owner, ctx.value.repo, detail.value.number)
  saving.value = false
  if (res.code === 200) {
    ElMessage.success('PR已关闭')
    await logStore.write({ module: 'pull', action: '关闭PR', detail: `#${detail.value.number} ${detail.value.title}`, level: 'warning' })
    detailVisible.value = false
    loadPRs()
  } else {
    ElMessage.error(`关闭失败：${res.msg}`)
  }
}

function openCreate() {
  loadBranches()
  createForm.title = ''
  createForm.body = ''
  createForm.base = repo.value?.default_branch || 'main'
  createForm.head = ''
  createForm.draft = false
  createVisible.value = true
}

function openPicker(target: 'base' | 'head') {
  pickerTarget.value = target
  if (branchNames.value.length === 0) loadBranches()
  pickerVisible.value = true
}

function onPickerConfirm(payload: { selectedValues: string[] }) {
  const v = payload.selectedValues[0]
  if (pickerTarget.value === 'base') createForm.base = v
  else createForm.head = v
  pickerVisible.value = false
}

async function submitCreate() {
  if (!ctx.value) return
  if (!createForm.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }
  if (!createForm.head || !createForm.base) {
    ElMessage.warning('请选择 head 与 base 分支')
    return
  }
  if (createForm.head === createForm.base) {
    ElMessage.warning('head 与 base 分支不能相同')
    return
  }
  saving.value = true
  const pat = await withPat()
  const res = await createPR(pat, ctx.value.owner, ctx.value.repo, {
    title: createForm.title.trim(),
    body: createForm.body || undefined,
    head: createForm.head,
    base: createForm.base,
    draft: createForm.draft
  })
  saving.value = false
  if (res.code === 201 || res.code === 200) {
    ElMessage.success(`PR #${res.data?.number} 已创建`)
    await logStore.write({ module: 'pull', action: '创建PR', detail: `#${res.data?.number} ${createForm.title}（${createForm.head} → ${createForm.base}）`, level: 'success' })
    createVisible.value = false
    loadPRs()
  } else {
    ElMessage.error(`创建失败：${res.msg}`)
  }
}

watch(() => [repoStore.currentRepoFullName, repoStore.currentRepo?.id, accountStore.activeId], () => {
  loadPRs()
  loadBranches()
})
onMounted(() => {
  loadPRs()
  loadBranches()
})
</script>

<style scoped>
.pr-title {
  font-weight: 600;
}
.pr-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0 8px;
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
.sub-title {
  font-weight: 600;
  margin: 12px 0 8px;
}
.comment-item {
  border-bottom: 1px dashed var(--border-color);
  padding: 8px 0;
}
.comment-head {
  font-size: 12px;
  color: var(--text-secondary);
}
.comment-body {
  white-space: pre-wrap;
  font-size: 13px;
  margin: 6px 0 0;
}
.footer-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  align-items: center;
}
</style>
