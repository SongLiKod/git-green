<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <van-empty v-if="!ctx" description="请在顶栏选择仓库" />
      <template v-else>
        <div class="m-toolbar">
          <van-button type="primary" size="small" @click="openCreate">新建Release</van-button>
          <van-button size="small" :loading="loading" @click="loadReleases">刷新</van-button>
        </div>
        <van-empty v-if="releases.length === 0" description="暂无 Release" />
        <div v-for="r in releases" :key="r.id" class="m-card">
          <div class="m-card-head">
            <div class="m-card-title">
              <div class="t">{{ r.tag_name }}</div>
              <div class="m-sub">{{ r.name && r.name !== r.tag_name ? r.name : '' }} {{ r.published_at ? new Date(r.published_at).toLocaleDateString() : '未发布' }}</div>
            </div>
            <van-tag v-if="r.draft">草稿</van-tag>
            <van-tag v-else-if="r.prerelease" type="warning">测试版</van-tag>
            <van-tag v-else type="success">正式版</van-tag>
          </div>
          <div class="m-actions">
            <van-button size="mini" type="primary" plain @click="openDetail(r)">详情/下载（{{ r.assets.length }}）</van-button>
            <van-button size="mini" plain @click="openEdit(r)">编辑</van-button>
            <van-button size="mini" type="danger" plain @click="onDelete(r)">删除</van-button>
          </div>
        </div>

        <template v-if="tasks.length">
          <div class="m-section-title">下载任务</div>
          <div v-for="t in tasks" :key="t.id" class="m-card">
            <div class="m-card-head">
              <div class="m-card-title">
                <div class="t">{{ t.filename }}</div>
                <van-progress :percentage="t.percent" :status="t.status === 'error' ? 'exception' : t.percent >= 100 ? 'success' : ''" style="margin-top: 6px" />
              </div>
              <van-tag :type="t.status === 'done' ? 'success' : t.status === 'error' ? 'danger' : 'primary'">{{ taskStatusText(t) }}</van-tag>
            </div>
          </div>
        </template>

        <van-popup v-model:show="detailVisible" position="bottom" round :style="{ height: '86%' }">
          <div class="m-popup" v-if="detail">
            <div class="m-popup-title">{{ detail.tag_name }}</div>
            <pre class="m-code" style="max-height: 22vh">{{ detail.body || '（无描述）' }}</pre>
            <div class="m-section-title" style="margin-left: 0">附件（{{ detail.assets.length }}）</div>
            <van-cell v-for="a in detail.assets" :key="a.id" :title="a.name" :label="formatSize(a.size)">
              <template #value>
                <van-button size="mini" type="primary" plain @click="downloadAsset(a)">下载</van-button>
              </template>
            </van-cell>
            <div class="m-actions">
              <van-button size="small" plain type="primary" @click="downloadSource(detail.zipball_url, detail.tag_name + '-source.zip')">源码ZIP</van-button>
              <van-button size="small" plain type="primary" @click="downloadSource(detail.tarball_url, detail.tag_name + '-source.tar.gz')">源码TAR.GZ</van-button>
            </div>
            <div v-for="t in tasks.slice(0, 3)" :key="'d' + t.id" style="margin-bottom: 8px">
              <div class="m-sub">{{ t.filename }}</div>
              <van-progress :percentage="t.percent" />
            </div>
            <van-button block style="margin-top: 10px" @click="detailVisible = false">关闭</van-button>
          </div>
        </van-popup>

        <van-popup v-model:show="formVisible" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">{{ editingId ? '编辑 Release' : '新建 Release' }}</div>
            <van-cell-group inset>
              <van-field v-model="form.tag_name" label="Tag标签" placeholder="v1.0.0" :disabled="!!editingId" required />
              <van-field v-model="form.target_commitish" label="目标分支" :placeholder="repo?.default_branch || 'main'" />
              <van-field v-model="form.name" label="标题" />
              <van-field v-model="form.body" label="描述" type="textarea" rows="4" />
              <van-cell title="测试版"><template #value><van-switch v-model="form.prerelease" size="20" /></template></van-cell>
              <van-cell title="草稿版"><template #value><van-switch v-model="form.draft" size="20" /></template></van-cell>
            </van-cell-group>
            <van-button block type="primary" style="margin-top: 14px" :loading="saving" @click="submitForm">{{ editingId ? '保存' : '创建' }}</van-button>
          </div>
        </van-popup>
      </template>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
    <template v-if="ctx">
      <el-card shadow="never" class="mb14">
        <template #header>
          <div class="card-header">
            <span>Release 版本列表（{{ releases.length }}）</span>
            <div>
              <el-button type="primary" @click="openCreate">新建Release</el-button>
              <el-button @click="loadReleases">刷新</el-button>
            </div>
          </div>
        </template>
        <el-table :data="releases" border stripe v-loading="loading">
          <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
          <el-table-column label="版本" min-width="180">
            <template #default="{ row }">
              <span class="mono">{{ row.tag_name }}</span>
              <span v-if="row.name && row.name !== row.tag_name" class="rel-name">（{{ row.name }}）</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.draft" size="small" type="info">草稿版</el-tag>
              <el-tag v-else-if="row.prerelease" size="small" type="warning">测试版</el-tag>
              <el-tag v-else size="small" type="success">正式版</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="附件数" width="90">
            <template #default="{ row }">{{ row.assets.length }}</template>
          </el-table-column>
          <el-table-column label="发布时间" width="170">
            <template #default="{ row }">{{ row.published_at ? new Date(row.published_at).toLocaleString() : '未发布' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="260">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">详情/下载</el-button>
              <el-button link @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="onDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>下载任务（软件内闭环下载，进度可视化）</template>
        <el-table :data="tasks" border size="small" max-height="240">
          <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
          <el-table-column prop="filename" label="文件" min-width="200" />
          <el-table-column label="进度" min-width="200">
            <template #default="{ row }">
              <el-progress :percentage="row.percent" :status="row.status === 'error' ? 'exception' : row.percent >= 100 ? 'success' : ''" />
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">{{ taskStatusText(row) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="tasks.length === 0" description="暂无下载任务" :image-size="60" />
      </el-card>
    </template>
    <el-empty v-else description="请先选择仓库" />

    <el-dialog v-model="formVisible" :title="editingId ? '编辑 Release' : '新建 Release'" width="560px">
      <el-form label-width="110px">
        <el-form-item label="Tag标签" required>
          <el-input v-model="form.tag_name" placeholder="v1.0.0" :disabled="!!editingId" />
        </el-form-item>
        <el-form-item label="目标分支/SHA">
          <el-input v-model="form.target_commitish" :placeholder="repo?.default_branch || 'main'" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.body" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="测试版">
          <el-switch v-model="form.prerelease" />
        </el-form-item>
        <el-form-item label="草稿版">
          <el-switch v-model="form.draft" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">{{ editingId ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" :title="`版本详情 - ${detail?.tag_name || ''}`" width="680px" top="6vh">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="Tag">{{ detail.tag_name }}</el-descriptions-item>
          <el-descriptions-item label="类型">
            {{ detail.draft ? '草稿版' : detail.prerelease ? '测试版' : '正式版' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ new Date(detail.created_at).toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="发布时间">{{ detail.published_at ? new Date(detail.published_at).toLocaleString() : '未发布' }}</el-descriptions-item>
        </el-descriptions>
        <div class="detail-body">
          <div class="sub-title">版本描述</div>
          <pre class="desc-pre">{{ detail.body || '（无描述）' }}</pre>
        </div>
        <div class="sub-title">打包资源（{{ detail.assets.length }}个附件）</div>
        <el-table :data="detail.assets" border size="small" max-height="220">
          <el-table-column prop="name" label="文件名" min-width="200" />
          <el-table-column label="大小" width="100">
            <template #default="{ row }">{{ formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column prop="download_count" label="下载次数" width="90" />
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button link type="primary" @click="downloadAsset(row)">下载</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="source-btns">
          <span class="sub-title">源码包：</span>
          <el-button size="small" @click="downloadSource(detail.zipball_url, `${detail.tag_name}-source-code.zip`)">下载 Source code (zip)</el-button>
          <el-button size="small" @click="downloadSource(detail.tarball_url, `${detail.tag_name}-source-code.tar.gz`)">下载 Source code (tar.gz)</el-button>
        </div>
      </template>
    </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ReleaseManage' })
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useLogStore } from '@/stores/useLogStore'
import * as releaseApi from '@/api/githubRelease'
import type { Release, ReleaseAsset } from '@/api/githubRelease'
import { auth } from '@/api/request'
import { blobDownload, tryNativeDownload, useIsMobile } from '@/utils/platform'
import { saveDownload, listDownloads } from '@/utils/db'

interface DownloadTask {
  id: string
  filename: string
  percent: number
  status: 'downloading' | 'done' | 'error'
}

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()
const isMobile = useIsMobile()

const ctx = computed(() => repoStore.currentOwnerName())
const repo = computed(() => repoStore.currentRepo)
const releases = ref<Release[]>([])
const loading = ref(false)
const saving = ref(false)

const formVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  tag_name: '',
  name: '',
  body: '',
  prerelease: false,
  draft: false,
  target_commitish: ''
})

const detailVisible = ref(false)
const detail = ref<Release | null>(null)

const tasks = ref<DownloadTask[]>([])

async function withPat() {
  return await accountStore.getPat(repoStore.currentAccountId)
}

async function loadReleases() {
  if (!ctx.value) return
  loading.value = true
  const pat = await withPat()
  const res = await releaseApi.listReleases(pat, ctx.value.owner, ctx.value.repo)
  loading.value = false
  if (res.code === 200) releases.value = res.data || []
  else ElMessage.error(`Release加载失败：${res.msg}`)
}

function openCreate() {
  editingId.value = null
  form.tag_name = ''
  form.name = ''
  form.body = ''
  form.prerelease = false
  form.draft = false
  form.target_commitish = ''
  formVisible.value = true
}

function openEdit(row: Release) {
  editingId.value = row.id
  form.tag_name = row.tag_name
  form.name = row.name || ''
  form.body = row.body || ''
  form.prerelease = row.prerelease
  form.draft = row.draft
  form.target_commitish = ''
  formVisible.value = true
}

async function submitForm() {
  if (!ctx.value) return
  if (!editingId.value && !form.tag_name.trim()) {
    ElMessage.warning('请输入Tag标签')
    return
  }
  saving.value = true
  const pat = await withPat()
  const payload = {
    tag_name: form.tag_name.trim(),
    name: form.name.trim() || undefined,
    body: form.body || undefined,
    prerelease: form.prerelease,
    draft: form.draft,
    target_commitish: form.target_commitish.trim() || repo.value?.default_branch || undefined
  }
  const res = editingId.value
    ? await releaseApi.updateRelease(pat, ctx.value.owner, ctx.value.repo, editingId.value, {
        name: payload.name,
        body: payload.body,
        prerelease: payload.prerelease,
        draft: payload.draft
      })
    : await releaseApi.createRelease(pat, ctx.value.owner, ctx.value.repo, payload)
  saving.value = false
  if (res.code === 200 || res.code === 201) {
    ElMessage.success(editingId.value ? 'Release已更新' : 'Release已创建')
    logStore.write({
      module: 'release',
      action: editingId.value ? '编辑Release' : '新建Release',
      detail: `${ctx.value.owner}/${ctx.value.repo} ${form.tag_name}`,
      level: 'success'
    })
    formVisible.value = false
    loadReleases()
  } else {
    ElMessage.error(`操作失败：${res.msg}`)
  }
}

async function onDelete(row: Release) {
  if (!ctx.value) return
  try {
    await ElMessageBox.confirm(
      `高危操作：确认删除 Release「${row.tag_name}」及其全部打包附件？不可恢复。`,
      '删除Release',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const pat = await withPat()
  const res = await releaseApi.deleteRelease(pat, ctx.value.owner, ctx.value.repo, row.id)
  if (res.code === 204 || res.code === 200) {
    ElMessage.success('Release已删除')
    await logStore.write({ module: 'release', action: '删除Release', detail: `${row.tag_name}`, level: 'warning' })
    loadReleases()
  } else {
    ElMessage.error(`删除失败：${res.msg}`)
  }
}

async function openDetail(row: Release) {
  if (!ctx.value) return
  const pat = await withPat()
  const res = await releaseApi.getReleaseDetail(pat, ctx.value.owner, ctx.value.repo, row.id)
  detail.value = res.code === 200 && res.data ? res.data : row
  detailVisible.value = true
}

/* ---------- 软件内下载闭环（含进度可视化 + Android原生断点续传） ---------- */

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function taskStatusText(t: DownloadTask) {
  if (t.status === 'done') return '已完成'
  if (t.status === 'error') return '失败'
  return '下载中'
}

async function startDownload(url: string, filename: string, totalHint: number) {
  const pat = await withPat()
  if (!pat) return
  const headers: Record<string, string> = { ...auth(pat), Accept: 'application/octet-stream' }
  // Android：交给原生下载管理器，支持后台断点续传
  if (tryNativeDownload(url, headers, filename)) {
    const task = reactive<DownloadTask>({ id: `${Date.now()}`, filename, percent: 0, status: 'downloading' })
    tasks.value.unshift(task)
    task.percent = 100
    task.status = 'done'
    ElMessage.success('已加入原生下载队列（支持后台断点续传）')
    saveTask(task)
    logStore.write({ module: 'release', action: '下载资源', detail: `${filename}（原生断点续传）`, level: 'success' })
    return
  }
  // Web/Windows：blob 流式下载，进度可视化
  const task = reactive<DownloadTask>({ id: `${Date.now()}`, filename, percent: 0, status: 'downloading' })
  tasks.value.unshift(task)
  saveTask(task)
  const res = await releaseApi.downloadWithProgress(pat, url, (loaded, total) => {
    task.percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : Math.min(99, Math.round((loaded / (totalHint || 1)) * 100))
  })
  if (res.code === 200 && res.data) {
    blobDownload(res.data, filename)
    task.percent = 100
    task.status = 'done'
    ElMessage.success(`${filename} 下载完成（全程软件内闭环）`)
    logStore.write({ module: 'release', action: '下载资源', detail: `${filename} 下载完成`, level: 'success' })
  } else {
    task.status = 'error'
    ElMessage.error(`下载失败：${res.msg}`)
    logStore.write({ module: 'release', action: '下载资源', detail: `${filename} 下载失败：${res.msg}`, level: 'error' })
  }
  saveTask(task)
}

async function downloadAsset(asset: ReleaseAsset) {
  await startDownload(asset.url, asset.name, asset.size)
}

async function downloadSource(url: string, filename: string) {
  await startDownload(url, filename, 0)
}

/* ---------- 下载任务持久化（IndexedDB via utils/db） ---------- */
function saveTask(task: DownloadTask) {
  saveDownload({ id: task.id, filename: task.filename, percent: task.percent, status: task.status })
}

async function loadTasks() {
  tasks.value = (await listDownloads()).map(t =>
    t.status === 'downloading' ? { ...t, status: 'error' as const } : { ...t }
  )
}

watch(() => [repoStore.currentRepoFullName, repoStore.currentRepo?.id, accountStore.activeId], loadReleases)
onMounted(() => {
  loadReleases()
  loadTasks()
})
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
.mono {
  font-family: Consolas, monospace;
  font-weight: 600;
}
.rel-name {
  color: var(--text-secondary);
  font-size: 12px;
}
.sub-title {
  font-weight: 600;
  margin: 12px 0 8px;
}
.desc-pre {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 10px;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
}
.source-btns {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
