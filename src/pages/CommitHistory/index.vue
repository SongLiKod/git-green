<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <van-empty v-if="!ctx" description="请在顶栏选择仓库" />
      <template v-else>
        <div class="m-toolbar">
          <span class="m-branch-pill" @click="openBranchPicker">{{ branch || '选择分支' }} <van-icon name="arrow-down" /></span>
          <van-button size="small" :loading="loading" @click="reload">刷新</van-button>
        </div>
        <van-empty v-if="!loading && commits.length === 0" description="暂无提交" />
        <div v-for="c in commits" :key="c.sha" class="m-card" @click="openCommit(c)">
          <div class="m-card-head">
            <div class="m-card-title">
              <div class="t">{{ firstLine(c.commit.message) }}</div>
              <div class="m-sub">{{ shortSha(c.sha) }} · {{ c.author?.login || c.commit.author.name || '未知' }} · {{ new Date(c.commit.author.date).toLocaleString() }}</div>
            </div>
          </div>
        </div>
        <van-button v-if="hasMore" block size="small" style="margin-top: 10px" :loading="loadingMore" @click="loadMore">加载更多</van-button>

        <van-popup v-model:show="branchPickerVisible" position="bottom" round>
          <van-picker :columns="branchColumns" @confirm="onBranchConfirm" @cancel="branchPickerVisible = false" />
        </van-popup>

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
      </template>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
      <template v-if="ctx">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>提交历史（{{ branch || '选择分支' }}）</span>
              <div>
                <el-select v-model="branch" filterable placeholder="选择分支" style="width: 200px" @change="reload">
                  <el-option v-for="b in branches" :key="b.name" :label="b.name" :value="b.name" />
                </el-select>
                <el-button :loading="loading" @click="reload">刷新</el-button>
              </div>
            </div>
          </template>
          <el-table :data="commits" border stripe v-loading="loading">
            <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
            <el-table-column label="提交信息" min-width="340">
              <template #default="{ row }">
                <div class="commit-title" @click="openCommit(row)">{{ firstLine(row.commit.message) }}</div>
                <div class="commit-sub">
                  <span class="mono commit-sha" @click="openCommit(row)">{{ row.sha.slice(0, 7) }}</span>
                  <span> · {{ row.author?.login || row.commit.author.name || '未知' }} · {{ new Date(row.commit.author.date).toLocaleString() }}</span>
                  <el-button link type="primary" @click="openCommit(row)">查看详情</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="hasMore" class="load-more">
            <el-button :loading="loadingMore" @click="loadMore">加载更多</el-button>
          </div>
        </el-card>

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
      </template>
      <el-empty v-else description="请先选择仓库" />
    </template>

    <SourceFilePreview v-model="filePreviewVisible" :filename="previewFilename" :load="previewLoader" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'CommitHistory' })
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { getBranches } from '@/api/githubBranch'
import type { GitHubBranch } from '@/api/githubBranch'
import { listCommits } from '@/api/githubCommit'
import { getCommit } from '@/api/githubIssue'
import type { GithubCommitInfo } from '@/api/githubIssue'
import { useIsMobile } from '@/utils/platform'
import FileDiffList, { type DiffFile } from '@/components/FileDiffList.vue'
import SourceFilePreview, { loadSourcePreview } from '@/components/SourceFilePreview.vue'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const isMobile = useIsMobile()

const ctx = computed(() => repoStore.currentOwnerName())

const branches = ref<GitHubBranch[]>([])
const branch = ref('')
const commits = ref<GithubCommitInfo[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const perPage = 30
const hasMore = ref(false)

const branchColumns = computed(() => branches.value.map(b => ({ text: b.name, value: b.name })))
const branchPickerVisible = ref(false)

const commitVisible = ref(false)
const commitDetail = ref<GithubCommitInfo | null>(null)

const filePreviewVisible = ref(false)
const previewFilename = ref('')
const previewRef = ref('')

function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

function firstLine(msg: string): string {
  return (msg || '').split('\n')[0]
}

async function withPat() {
  return await accountStore.getPat(repoStore.currentAccountId)
}

async function loadBranches() {
  if (!ctx.value) return
  const pat = await withPat()
  const res = await getBranches(pat, ctx.value.owner, ctx.value.repo)
  if (res.code === 200) {
    branches.value = res.data || []
    if (!branch.value) branch.value = repoStore.currentRepo?.default_branch || branches.value[0]?.name || ''
  }
}

async function loadCommits(reset = true) {
  if (!ctx.value || !branch.value) return
  loading.value = true
  const pat = await withPat()
  const targetPage = reset ? 1 : page.value + 1
  const res = await listCommits(pat, ctx.value.owner, ctx.value.repo, branch.value, targetPage, perPage)
  loading.value = false
  if (res.code === 200) {
    const data = res.data || []
    if (reset) {
      commits.value = data
      page.value = 1
    } else {
      commits.value = [...commits.value, ...data]
      page.value = targetPage
    }
    hasMore.value = data.length >= perPage
  } else {
    ElMessage.error(`提交历史加载失败：${res.msg}`)
  }
}

async function reload() {
  commits.value = []
  branchPickerVisible.value = false
  await loadCommits(true)
}

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  await loadCommits(false)
  loadingMore.value = false
}

function openBranchPicker() {
  if (branches.value.length === 0) loadBranches()
  branchPickerVisible.value = true
}

function onBranchConfirm(payload: { selectedValues: string[] }) {
  branch.value = payload.selectedValues[0]
  branchPickerVisible.value = false
  reload()
}

async function openCommit(c: GithubCommitInfo) {
  if (!ctx.value) return
  commitVisible.value = true
  commitDetail.value = null
  const pat = await withPat()
  const res = await getCommit(pat, ctx.value.owner, ctx.value.repo, c.sha)
  commitDetail.value = res.code === 200 ? res.data || null : null
  if (res.code !== 200) ElMessage.error(`提交详情加载失败：${res.msg}`)
}

/** 仅新增/修改的文件可点击预览源文件（该提交存在源文件） */
function fileClickable(f: DiffFile): boolean {
  return f.status === 'added' || f.status === 'modified'
}

function previewCommitFile(f: DiffFile) {
  if (!fileClickable(f) || !commitDetail.value) return
  previewFilename.value = f.filename
  previewRef.value = commitDetail.value.sha
  filePreviewVisible.value = true
}

async function previewLoader(name: string) {
  const c = ctx.value
  if (!c || !previewRef.value) throw new Error('预览上下文已失效')
  const pat = await withPat()
  return loadSourcePreview(pat, c.owner, c.repo, name, previewRef.value)
}

watch(() => [repoStore.currentRepoFullName, repoStore.currentRepo?.id, accountStore.activeId], () => {
  branch.value = ''
  loadBranches()
  loadCommits(true)
})
onMounted(() => {
  loadBranches()
  loadCommits(true)
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.commit-title {
  font-weight: 600;
  cursor: pointer;
  color: var(--text-main);
}
.commit-title:hover {
  color: var(--color-primary);
}
.commit-sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.commit-sha {
  cursor: pointer;
  color: var(--color-primary);
}
.load-more {
  margin-top: 12px;
  text-align: center;
}
.m-branch-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 13px;
  color: var(--color-primary);
  background: var(--bg-page);
  cursor: pointer;
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
.mono {
  font-family: Consolas, monospace;
}
</style>