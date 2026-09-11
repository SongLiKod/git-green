<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <van-empty v-if="!ctx" description="请在顶栏选择仓库" />
      <template v-else>
        <div class="m-toolbar">
          <van-dropdown-menu style="flex: 1">
            <van-dropdown-item v-model="state" :options="stateOptions" @change="loadIssues" />
          </van-dropdown-menu>
          <van-button size="small" :loading="loading" @click="loadIssues">刷新</van-button>
          <van-button size="small" type="primary" @click="openCreate">新建</van-button>
        </div>
        <van-empty v-if="issues.length === 0" description="暂无 Issue" />
        <div v-for="i in issues" :key="i.number" class="m-card" @click="openDetail(i)">
          <div class="m-card-head">
            <div class="m-card-title">
              <div class="t">#{{ i.number }} {{ i.title }}</div>
              <div class="m-sub">{{ i.user?.login }} · {{ new Date(i.updated_at).toLocaleString() }}</div>
            </div>
            <van-tag :type="i.state === 'open' ? 'success' : 'default'">{{ i.state === 'open' ? '开放' : '已关闭' }}</van-tag>
          </div>
          <div v-if="i.labels.length" class="m-tags">
            <van-tag v-for="l in i.labels" :key="l.id" :color="labelColor(l.name)" plain class="tag-no-bg">{{ l.name }}</van-tag>
          </div>
          <div class="m-sub" style="margin-top: 6px">💬 {{ i.comments }}</div>
        </div>

        <van-popup v-model:show="detailVisible" position="bottom" round :style="{ height: '86%' }">
          <div class="m-popup" v-if="detail">
            <div class="m-popup-title">#{{ detail.number }} {{ detail.title }}</div>
            <pre class="m-code" style="max-height: 20vh">{{ detail.body || '（无描述）' }}</pre>
            <div class="m-actions">
              <van-button size="small" type="primary" plain @click="openEdit(detail)">编辑</van-button>
              <van-button v-if="detail.state === 'open'" size="small" type="warning" plain @click="toggleState(detail)">关闭</van-button>
              <van-button v-else size="small" type="success" plain @click="toggleState(detail)">重新打开</van-button>
            </div>
            <div class="m-section-title" style="margin-left: 0">关联提交（{{ linkedLoading ? '加载中...' : linkedCommits.length }}）</div>
            <div v-if="linkedLoading" style="margin: 4px 12px"><van-loading size="20" style="display: inline-block; margin-right: 6px" />正在加载关联提交...</div>
            <div v-else-if="linkedCommits.length === 0" class="m-sub" style="margin: 0 6px 8px">暂无直接关联提交（提交信息里引用 #{{ detail.number }} 的提交会显示在这里）</div>
            <div v-for="c in linkedCommits" :key="c.sha" class="m-card commit-tap" style="margin: 0 0 8px" @click="openCommit(c)">
              <div class="m-sub">{{
(c.commit.message || '').split('\n')[0] }}</div>
              <div class="m-sub">{{ shortSha(c.sha) }} · {{ c.commit.author.name }} · {{ new Date(c.commit.author.date).toLocaleString() }}（点击查看详情）</div>
            </div>
            <div class="m-section-title" style="margin-left: 0">评论（{{ comments.length }}）</div>
            <div v-for="c in comments" :key="c.id" class="m-card" style="margin: 0 0 8px">
              <div class="m-sub">{{ c.user?.login }} · {{ new Date(c.created_at).toLocaleString() }}</div>
              <pre class="m-code" style="max-height: none; border: none; padding: 6px 0">{{ c.body }}</pre>
            </div>
            <van-field v-model="newComment" type="textarea" rows="2" placeholder="写评论..." />
            <van-button block type="primary" style="margin-top: 10px" :loading="saving" @click="submitComment">发表评论</van-button>
          </div>
        </van-popup>

        <van-popup v-model:show="commitVisible" position="bottom" round :style="{ height: commitFs ? '100%' : '86%' }">
          <div class="m-popup">
            <div class="m-popup-title-row">
              <span class="m-popup-title">提交详情</span>
              <van-button size="mini" plain @click="commitFs = !commitFs">{{ commitFs ? '退出全屏' : '全屏' }}</van-button>
            </div>
            <div class="m-sub" style="margin: 0 6px 8px">{{ shortSha(commitDetail?.sha || '') }}</div>
            <pre class="m-code">{{ commitDetail?.commit?.message }}</pre>
            <div class="m-sub" style="margin: 10px 6px">{{ commitDetail?.commit?.author?.name || '' }} · {{ commitDetail?.author?.login || '未知' }} · {{ commitDetail ? new Date(commitDetail.commit.author.date).toLocaleString() : '' }}</div>
            <template v-if="commitDetail?.files && commitDetail.files.length">
              <div class="m-section-title" style="margin: 12px 6px">变更文件（{{ commitDetail.files.length }}）</div>
<FileDiffList :files="commitDetail.files" @preview="openFilePreview" />
            </template>
            <div class="m-actions">
              <van-button block plain @click="commitDetail && copyText(commitDetail.sha)">复制SHA</van-button>
              <van-button block plain @click="commitDetail && copyText(commitDetail.html_url)">复制链接</van-button>
            </div>
            <van-button block style="margin-top: 10px" @click="commitVisible = false">关闭</van-button>
          </div>
        </van-popup>

        <van-popup v-model:show="createVisible" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">新建 Issue</div>
            <van-cell-group inset>
              <van-field v-model="createForm.title" label="标题" required />
              <van-field v-model="createForm.body" label="描述" type="textarea" rows="4" />
              <van-field v-model="createForm.labels" label="标签" placeholder="多个用逗号分隔" />
            </van-cell-group>
            <van-button block type="primary" style="margin-top: 14px" :loading="saving" @click="submitCreate">创建</van-button>
          </div>
        </van-popup>

        <van-popup v-model:show="editVisible" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">编辑 Issue #{{ editTarget?.number || '' }}</div>
            <van-cell-group inset>
              <van-field v-model="editForm.title" label="标题" required />
              <van-field v-model="editForm.body" label="描述" type="textarea" rows="4" />
              <van-field v-model="editForm.labels" label="标签" placeholder="多个用逗号分隔" />
            </van-cell-group>
            <van-button block type="primary" style="margin-top: 14px" :loading="saving" @click="submitEdit">保存</van-button>
          </div>
        </van-popup>
      </template>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
      <template v-if="ctx">
        <div class="page-toolbar">
          <el-select v-model="state" style="width: 130px" @change="loadIssues">
            <el-option label="开放" value="open" />
            <el-option label="已关闭" value="closed" />
            <el-option label="全部" value="all" />
          </el-select>
          <el-button @click="loadIssues">刷新</el-button>
          <el-button type="primary" @click="openCreate">新建 Issue</el-button>
        </div>
        <el-table :data="issues" border stripe v-loading="loading">
          <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
          <el-table-column label="Issue" min-width="320">
            <template #default="{ row }">
              <div class="issue-title">
                #{{ row.number }} {{ row.title }}
                <el-tag
                  v-for="l in row.labels"
                  :key="l.id"
                  size="small"
                  class="tag-item"
                  :style="{ color: labelColor(l.name), borderColor: labelColor(l.name), backgroundColor: 'transparent' }"
                >
                  {{ l.name }}
                </el-tag>
              </div>
              <div class="issue-meta">{{ row.user?.login }} · 更新于 {{ new Date(row.updated_at).toLocaleString() }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.state === 'open' ? 'success' : 'info'">{{ row.state === 'open' ? '开放' : '已关闭' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="评论" width="70">
            <template #default="{ row }">{{ row.comments }}</template>
          </el-table-column>
          <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">详情/评论</el-button>
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button v-if="row.state === 'open'" link type="warning" @click="toggleState(row)">关闭</el-button>
              <el-button v-else link type="success" @click="toggleState(row)">重新打开</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-dialog v-model="detailVisible" :title="detail ? `#${detail.number} ${detail.title}` : ''" width="680px" top="6vh">
          <template v-if="detail">
            <pre class="body-pre">{{ detail.body || '（无描述）' }}</pre>
            <div class="sub-title">关联提交（{{ linkedLoading ? '加载中...' : linkedCommits.length }}）</div>
            <div v-if="linkedLoading" class="comment-body"><el-icon class="is-loading"><Loading /></el-icon> 正在加载关联提交...</div>
            <div v-else-if="linkedCommits.length === 0" class="comment-body">暂无直接关联提交（提交信息里引用 #{{ detail.number }} 的提交会显示在这里）</div>
            <div v-for="c in linkedCommits" :key="c.sha" class="comment-item commit-item" @click="openCommit(c)" title="点击查看提交详情">
              <div class="comment-head">
                <span class="mono">{{ shortSha(c.sha) }}</span> ·
                {{ (c.commit.message || '').split('\n')[0] }}
              </div>
              <div class="comment-meta">{{ c.commit.author.name }} · {{ new Date(c.commit.author.date).toLocaleString() }}</div>
            </div>
            <div class="sub-title">评论（{{ comments.length }}）</div>
            <div v-for="c in comments" :key="c.id" class="comment-item">
              <div class="comment-head">{{ c.user?.login }} · {{ new Date(c.created_at).toLocaleString() }}</div>
              <pre class="comment-body">{{ c.body }}</pre>
            </div>
            <el-input v-model="newComment" type="textarea" :rows="3" placeholder="写评论..." />
            <el-button type="primary" style="margin-top: 10px" :loading="saving" @click="submitComment">发表评论</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="createVisible" title="新建 Issue" width="520px">
          <el-form label-width="60px">
            <el-form-item label="标题" required><el-input v-model="createForm.title" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="createForm.body" type="textarea" :rows="5" /></el-form-item>
            <el-form-item label="标签"><el-input v-model="createForm.labels" placeholder="多个用逗号分隔" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="createVisible = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="editVisible" :title="`编辑 Issue #${editTarget?.number || ''}`" width="520px">
          <el-form label-width="60px">
            <el-form-item label="标题" required><el-input v-model="editForm.title" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="editForm.body" type="textarea" :rows="5" /></el-form-item>
            <el-form-item label="标签"><el-input v-model="editForm.labels" placeholder="多个用逗号分隔" /></el-form-item>
          </el-form>
<template #footer>
          <el-button @click="editVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="commitVisible" width="680px" top="4vh" class="commit-dialog" :fullscreen="commitFs" :show-close="false">
        <template #header>
          <div class="commit-header">
            <span class="commit-header-title">{{ commitDetail ? `提交 ${shortSha(commitDetail.sha)}` : '' }}</span>
            <span class="commit-header-ops">
              <el-button link type="primary" @click="commitFs = !commitFs">{{ commitFs ? '退出全屏' : '全屏' }}</el-button>
              <el-button link @click="commitVisible = false">关闭</el-button>
            </span>
          </div>
        </template>
        <template v-if="commitDetail">
          <div class="commit-meta-line">
            <span class="mono commit-sha">{{ commitDetail.sha }}</span>
            <el-button size="small" link type="primary" @click="commitDetail && copyText(commitDetail.sha)">复制SHA</el-button>
            <el-button size="small" link type="primary" @click="commitDetail && copyText(commitDetail.html_url)">复制链接</el-button>
          </div>
          <pre class="body-pre">{{ commitDetail.commit.message }}</pre>
          <div class="comment-meta">{{ commitDetail.commit.author.name }} · {{ commitDetail.author?.login || '未知' }} · {{ new Date(commitDetail.commit.author.date).toLocaleString() }}</div>
          <template v-if="commitDetail.files && commitDetail.files.length">
            <div class="sub-title">变更文件（{{ commitDetail.files.length }}）</div>
            <FileDiffList :files="commitDetail.files" @preview="openFilePreview" />
          </template>
        </template>
        <template #footer>
          <el-button @click="commitVisible = false">关闭</el-button>
        </template>
      </el-dialog>
    </template>
    <el-empty v-else description="请先选择仓库" />
    </template>

    <SourceFilePreview v-model="filePreviewVisible" :filename="previewFilename" :load="previewLoader" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'IssueManage' })
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useLogStore } from '@/stores/useLogStore'
import { listIssues, getIssue, createIssue, setIssueState, updateIssue, listComments, commentIssue, listIssueTimeline, getCommit } from '@/api/githubIssue'
import type { GitHubIssue, IssueComment, GithubCommitInfo } from '@/api/githubIssue'
import type { ApiResult } from '@/api/request'
import { useIsMobile } from '@/utils/platform'
import FileDiffList, { type DiffFile } from '@/components/FileDiffList.vue'
import SourceFilePreview, { loadSourcePreview } from '@/components/SourceFilePreview.vue'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()
const isMobile = useIsMobile()

const ctx = computed(() => repoStore.currentOwnerName())
const issues = ref<GitHubIssue[]>([])
const loading = ref(false)
const saving = ref(false)
const state = ref('open')

const detailVisible = ref(false)
const detail = ref<GitHubIssue | null>(null)
const comments = ref<IssueComment[]>([])
const newComment = ref('')
const linkedCommits = ref<GithubCommitInfo[]>([])
const linkedLoading = ref(false)

const createVisible = ref(false)
const createForm = reactive({ title: '', body: '', labels: '' })

const editVisible = ref(false)
const editTarget = ref<GitHubIssue | null>(null)
const editForm = reactive({ title: '', body: '', labels: '' })

/** 判断 issue 是否符合当前列表筛选（open/closed/all） */
function matchesFilter(i: GitHubIssue): boolean {
  if (state.value === 'all') return true
  return i.state === state.value
}

/** 用最新返回的 issue 更新列表与详情，让变更立即体现 */
function applyIssue(it: GitHubIssue) {
  if (!matchesFilter(it)) {
    issues.value = issues.value.filter(i => i.number !== it.number)
  } else {
    issues.value = [it, ...issues.value.filter(i => i.number !== it.number)]
  }
  if (detail.value?.number === it.number) detail.value = it
}

const stateOptions = [
  { text: '开放', value: 'open' },
  { text: '已关闭', value: 'closed' },
  { text: '全部', value: 'all' }
]

const TAG_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#f032e6',
  '#42d4f4',
  '#bfef45',
  '#fabed4',
  '#469990',
  '#dcbeff',
  '#9a6324'
]

/** 按标签名稳定取一个随机色彩（用于 no-bg 边框+文字） */
function labelColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

async function withPat() {
  return await accountStore.getPat(repoStore.currentAccountId)
}

async function loadIssues() {
  if (!ctx.value) return
  loading.value = true
  const pat = await withPat()
  const res = await listIssues(pat, ctx.value.owner, ctx.value.repo, state.value)
  loading.value = false
  if (res.code === 200) issues.value = res.data || []
  else ElMessage.error(`Issue加载失败：${res.msg}`)
}

async function openDetail(row: GitHubIssue) {
  const c = ctx.value
  if (!c) return
  newComment.value = ''
  comments.value = []
  linkedCommits.value = []
  linkedLoading.value = true
  detail.value = null
  detailVisible.value = true
  const pat = await withPat()
  const [iRes, cRes, tRes] = await Promise.all([
    getIssue(pat, c.owner, c.repo, row.number),
    listComments(pat, c.owner, c.repo, row.number),
    listIssueTimeline(pat, c.owner, c.repo, row.number)
  ])
  if (iRes.code === 200 && iRes.data) {
    const fresh = { ...iRes.data as GitHubIssue }
    if (cRes.code === 200 && Array.isArray(cRes.data)) {
      fresh.comments = Math.max(fresh.comments || 0, cRes.data.length)
    }
    detail.value = fresh
    applyIssue(fresh)
  } else {
    ElMessage.error(`详情获取失败：${iRes.msg}`)
    detail.value = row
  }
  if (cRes.code === 200) comments.value = cRes.data || []
  if (tRes.code === 200 && tRes.data) {
    const shas = Array.from(
      new Set(
        (tRes.data as { event: string; commit_id: string | null }[])
          .filter(e => (e.event === 'referenced' || e.event === 'committed') && e.commit_id)
          .map(e => e.commit_id as string)
      )
    ).slice(0, 20)
    const results = await Promise.all(
      shas.map(sha => getCommit(pat, c.owner, c.repo, sha).catch(() => null))
    )
    linkedCommits.value = results
      .filter((r): r is ApiResult<GithubCommitInfo> => !!r && r.code === 200 && !!r.data)
      .map(r => r.data as GithubCommitInfo)
  }
  linkedLoading.value = false
  loadIssues()
}

function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

const commitVisible = ref(false)
const commitDetail = ref<GithubCommitInfo | null>(null)
const commitFs = ref(false)

function openCommit(c: GithubCommitInfo) {
  commitDetail.value = c
  commitVisible.value = true
}

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => ElMessage.success('已复制'),
      () => ElMessage.warning('复制失败，请手动复制')
    )
  } else {
    ElMessage.warning('复制失败，请手动复制')
  }
}

/** 仅新增/修改的文件可点击预览源文件 */
function fileClickable(f: DiffFile): boolean {
  return f.status === 'added' || f.status === 'modified'
}

const filePreviewVisible = ref(false)
const previewFilename = ref('')

async function openFilePreview(f: DiffFile) {
  if (!fileClickable(f) || !commitDetail.value) return
  const c = ctx.value
  if (!c) return
  previewFilename.value = f.filename
  filePreviewVisible.value = true
}

async function previewLoader(name: string) {
  const c = ctx.value
  if (!c || !commitDetail.value) throw new Error('上下文丢失')
  const pat = await withPat()
  return loadSourcePreview(pat, c.owner, c.repo, name, commitDetail.value.sha)
}

async function toggleState(row: GitHubIssue) {
  if (!ctx.value) return
  const pat = await withPat()
  const next = row.state === 'open' ? 'closed' : 'open'
  const res = await setIssueState(pat, ctx.value.owner, ctx.value.repo, row.number, next)
  if (res.code === 200 && res.data) {
    ElMessage.success(next === 'closed' ? 'Issue已关闭' : 'Issue已重新打开')
    await logStore.write({ module: 'issue', action: next === 'closed' ? '关闭Issue' : '重新打开Issue', detail: `#${row.number} ${row.title}`, level: 'warning' })
    applyIssue(res.data)
  } else {
    ElMessage.error(`操作失败：${res.msg}`)
  }
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
    const posted = res.data
    const num = detail.value.number
    if (posted) comments.value.push(posted)
    if (detail.value) detail.value.comments = (detail.value.comments || 0) + 1
    newComment.value = ''
    logStore.write({ module: 'issue', action: '评论Issue', detail: `#${num} ${detail.value.title}` })
    if (detail.value) {
      await openDetail(detail.value)
      // 重拉后用实际可见评论数兜底，保证列表评论数实时正确
      const cnt = Math.max(detail.value.comments || 0, comments.value.length)
      detail.value.comments = cnt
      issues.value = issues.value.map(i => (i.number === num ? { ...i, comments: cnt } : i))
      if (posted && !comments.value.some(x => x.id === posted.id)) comments.value.push(posted)
    }
  } else {
    ElMessage.error(`评论失败：${res.msg}`)
  }
}

function openCreate() {
  createForm.title = ''
  createForm.body = ''
  createForm.labels = ''
  createVisible.value = true
}

async function submitCreate() {
  if (!ctx.value) return
  if (!createForm.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }
  saving.value = true
  const pat = await withPat()
  const labels = createForm.labels.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  const res = await createIssue(pat, ctx.value.owner, ctx.value.repo, {
    title: createForm.title.trim(),
    body: createForm.body || undefined,
    labels: labels.length ? labels : undefined
  })
  saving.value = false
  if (res.code === 200 || res.code === 201) {
    ElMessage.success('Issue已创建')
    const it = res.data
    await logStore.write({ module: 'issue', action: '新建Issue', detail: `#${it?.number} ${createForm.title}`, level: 'success' })
    createVisible.value = false
    if (it && matchesFilter(it)) applyIssue(it)
    else loadIssues()
  } else {
    ElMessage.error(`创建失败：${res.msg}`)
  }
}

function openEdit(row: GitHubIssue) {
  editTarget.value = row
  editForm.title = row.title
  editForm.body = row.body || ''
  editForm.labels = row.labels.map(l => l.name).join(',')
  editVisible.value = true
}

async function submitEdit() {
  if (!ctx.value || !editTarget.value) return
  if (!editForm.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }
  saving.value = true
  const pat = await withPat()
  const labels = editForm.labels.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  const res = await updateIssue(pat, ctx.value.owner, ctx.value.repo, editTarget.value.number, {
    title: editForm.title.trim(),
    body: editForm.body,
    labels
  })
  saving.value = false
  if (res.code === 200 && res.data) {
    ElMessage.success('Issue已更新')
    await logStore.write({ module: 'issue', action: '编辑Issue', detail: `#${res.data.number} ${res.data.title}` })
    editVisible.value = false
    applyIssue(res.data)
  } else {
    ElMessage.error(`编辑失败：${res.msg}`)
  }
}

watch(() => [repoStore.currentRepoFullName, repoStore.currentRepo?.id, accountStore.activeId], loadIssues)
onMounted(loadIssues)
</script>

<style scoped>
.issue-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.issue-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.tag-item {
  margin-right: 4px;
}
.tag-no-bg {
  background: transparent !important;
}
.body-pre {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px;
  max-height: 200px;
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
.comment-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.commit-item {
  cursor: pointer;
}
.commit-item:hover {
  background: rgba(0, 148, 88, 0.06);
}
.commit-tap {
  cursor: pointer;
}
.commit-meta-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.commit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.commit-header-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.commit-header-ops {
  display: flex;
  flex: none;
}
.m-popup-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.m-popup-title-row :deep(.m-popup-title) {
  margin: 0;
  flex: 1;
  text-align: left;
}
.commit-sha {
  font-size: 13px;
  word-break: break-all;
}
.mono {
  font-family: Consolas, monospace;
}
.comment-body {
  white-space: pre-wrap;
  font-size: 13px;
  margin: 6px 0 0;
}
</style>

<style>
.commit-dialog .el-dialog__body {
  max-height: calc(100vh - 150px);
  overflow: auto;
}
.commit-dialog.is-fullscreen .el-dialog__body {
  max-height: none;
  height: calc(100vh - 110px);
}
</style>
