<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <van-empty v-if="!ctx" description="请在顶栏选择仓库" />
      <template v-else>
        <div class="m-toolbar">
          <van-button size="small" :disabled="!currentPath" @click="loadDir(parentPath)">上一级</van-button>
          <van-cell title="分支" :value="branch" style="flex: 1; padding: 0" @click="openBranchPicker" />
          <van-button size="small" type="primary" @click="openNewFile">新建文件</van-button>
        </div>
        <div class="m-sub" style="margin: 6px 14px 0">{{ currentPath || '根目录' }}</div>
        <van-empty v-if="entries.length === 0" description="空目录" />
        <van-cell
          v-for="e in entries"
          :key="e.path"
          :title="(e.type === 'dir' ? '📁 ' : '📄 ') + e.name"
          :label="e.type === 'dir' ? '目录' : formatSize(e.size)"
          :is-link="e.type === 'dir'"
          @click="onMEntry(e)"
        />

        <van-action-sheet
          v-model:show="fileSheetVisible"
          :actions="[{ name: '预览' }, { name: '编辑' }, { name: '下载' }, { name: '复制路径' }, { name: '删除', color: '#ee0a24' }]"
          cancel-text="取消"
          close-on-click-action
          @select="onFileSheetSelect"
        />

        <van-popup v-model:show="previewVisible" position="bottom" round :style="{ height: fsVisible ? '100%' : '86%' }">
          <div class="m-popup">
            <div class="m-popup-title-row">
              <span class="m-popup-title">{{ previewPath }}</span>
              <van-button
                v-if="showMdToggle"
                size="mini"
                :type="mdView === 'render' ? 'primary' : 'default'"
                plain
                @click="mdView = mdView === 'render' ? 'source' : 'render'"
              >{{ mdView === 'render' ? '源码' : '渲染' }}</van-button>
              <van-button v-if="!editing && previewKind !== 'image'" size="mini" plain @click="copyPreviewContent">复制</van-button>
              <van-button
                v-if="!editing"
                size="mini"
                type="primary"
                plain
                :loading="isDownloading(previewPath)"
                @click="downloadFile(previewPath, 0, previewRef)"
              >下载</van-button>
              <van-button size="mini" plain @click="fsVisible = !fsVisible">{{ fsVisible ? '退出全屏' : '全屏' }}</van-button>
            </div>
            <template v-if="editing">
              <van-field v-model="editContent" type="textarea" rows="14" class="m-yml" />
              <van-field v-model="commitMessage" placeholder="提交信息（commit message）" style="margin-top: 8px" border />
              <div class="m-actions">
                <van-button block type="primary" :loading="saving" @click="submitSave">提交到GitHub远程仓库</van-button>
              </div>
            </template>
            <template v-else-if="previewKind === 'image'">
              <div class="img-view-m"><img :src="previewImage" alt="preview" /></div>
            </template>
            <template v-else-if="showMdRender">
              <div class="md-view-m"><MdRender :source="previewContent" empty-text="（文件为空）" /></div>
            </template>
            <template v-else>
              <pre class="m-code">{{ previewContent }}</pre>
            </template>
          </div>
        </van-popup>

        <van-popup v-model:show="branchPickerVisible" position="bottom" round>
          <van-picker :columns="branchColumns" @confirm="onBranchConfirm" @cancel="branchPickerVisible = false" />
        </van-popup>
      </template>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
    <template v-if="ctx">
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>在线文件管理</span>
            <div class="header-ops">
              <el-select v-model="branch" style="width: 170px" @change="loadDir(currentPath)">
                <el-option v-for="b in branchNames" :key="b" :label="b" :value="b" />
              </el-select>
              <el-button @click="loadDir(currentPath)">刷新</el-button>
              <el-button type="primary" @click="openNewFile">新建文件</el-button>
            </div>
          </div>
        </template>

        <el-breadcrumb separator="/" class="crumb">
          <el-breadcrumb-item>
            <span class="link-text" @click="loadDir('')">根目录</span>
          </el-breadcrumb-item>
          <el-breadcrumb-item v-for="(seg, i) in pathSegs" :key="i">
            <span class="link-text" @click="loadDir(pathSegs.slice(0, i + 1).join('/'))">{{ seg }}</span>
          </el-breadcrumb-item>
        </el-breadcrumb>

        <el-table :data="entries" border stripe v-loading="loading" @row-dblclick="openEntry">
          <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
          <el-table-column label="名称" min-width="260">
            <template #default="{ row }">
              <span :class="row.type === 'dir' ? 'dir-name' : 'file-name'" @click="openEntry(row)">
                {{ row.type === 'dir' ? '📁' : '📄' }} {{ row.name }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }">{{ row.type === 'dir' ? '目录' : '文件' }}</template>
          </el-table-column>
          <el-table-column label="大小" width="110">
            <template #default="{ row }">{{ row.type === 'dir' ? '-' : formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="360">
            <template #default="{ row }">
              <template v-if="row.type === 'file'">
                <el-button link type="primary" @click="preview(row)">预览</el-button>
                <el-button link type="primary" @click="editFile(row)">编辑</el-button>
                <el-button
                  link
                  type="primary"
                  :loading="isDownloading(row.path)"
                  @click="downloadFile(row.path, row.size)"
                >下载</el-button>
                <el-button link type="primary" @click="copyGithubPath(row)">复制路径</el-button>
                <el-button link type="danger" @click="removeFile(row)">删除</el-button>
              </template>
              <el-button v-else link type="primary" @click="loadDir(row.path)">进入</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
    <el-empty v-else description="请先选择仓库" />

    <el-dialog
      v-model="previewVisible"
      :fullscreen="fsVisible"
      width="820px"
      top="4vh"
      :show-close="false"
    >
      <template #header>
        <div class="preview-header">
          <span class="preview-title">{{ previewPath }}{{ editing ? '（编辑中）' : previewKind === 'image' ? '（图片预览）' : '（在线预览）' }}</span>
          <span class="preview-ops">
            <span v-if="showMdToggle" class="md-mode">
              <el-button
                link
                :type="mdView === 'render' ? 'primary' : 'default'"
                :class="{ active: mdView === 'render' }"
                @click="mdView = 'render'"
              >渲染</el-button>
              <el-button
                link
                :type="mdView === 'source' ? 'primary' : 'default'"
                :class="{ active: mdView === 'source' }"
                @click="mdView = 'source'"
              >源码</el-button>
            </span>
            <el-button v-if="!editing && previewKind !== 'image'" link type="primary" @click="copyPreviewContent">复制内容</el-button>
            <el-button link type="primary" @click="fsVisible = !fsVisible">{{ fsVisible ? '退出全屏' : '全屏' }}</el-button>
            <el-button link @click="previewVisible = false">关闭</el-button>
          </span>
        </div>
      </template>
      <el-input v-if="editing" v-model="editContent" type="textarea" :rows="22" class="code-editor" spellcheck="false" />
      <div v-else-if="previewKind === 'image'" class="img-view">
        <img :src="previewImage" alt="preview" />
      </div>
      <div v-else-if="showMdRender" class="md-view">
        <MdRender :source="previewContent" empty-text="（文件为空）" />
      </div>
      <pre v-else class="code-view">{{ previewContent }}</pre>
      <el-input v-if="editing" v-model="commitMessage" placeholder="提交信息（commit message）" style="margin-top: 10px" />
      <template #footer>
        <template v-if="editing">
          <el-button @click="cancelEdit">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submitSave">提交到GitHub远程仓库</el-button>
        </template>
        <template v-else>
          <el-button
            type="primary"
            plain
            :loading="isDownloading(previewPath)"
            @click="downloadFile(previewPath, 0, previewRef)"
          >下载文件</el-button>
          <el-button v-if="previewKind !== 'image'" type="primary" @click="startEdit">编辑此文件</el-button>
          <el-button @click="previewVisible = false">关闭</el-button>
        </template>
      </template>
    </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'FileManager' })
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useLogStore } from '@/stores/useLogStore'
import { getFileTree, getFileContent, getFileRaw, getFileRawBytes, contentsRawUrl, saveFile, deleteFile } from '@/api/githubFile'
import type { FileEntry } from '@/api/githubFile'
import { auth } from '@/api/request'
import { getBranches } from '@/api/githubBranch'
import { saveDownload } from '@/utils/db'
import { blobDownload, isAndroidClient, requestAndroidNotificationPermission, startNativeDownload, useIsMobile } from '@/utils/platform'
import MdRender from '@/components/MdRender.vue'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()
const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()

/* ---------- 移动端辅助 ---------- */
const fileSheetVisible = ref(false)
const fileSheetEntry = ref<FileEntry | null>(null)
const branchPickerVisible = ref(false)
const branchColumns = computed(() => branchNames.value.map(b => ({ text: b, value: b })))
const parentPath = computed(() => currentPath.value.split('/').slice(0, -1).join('/'))

function onMEntry(e: FileEntry) {
  if (e.type === 'dir') loadDir(e.path)
  else {
    fileSheetEntry.value = e
    fileSheetVisible.value = true
  }
}

async function onFileSheetSelect(action: { name: string }) {
  const e = fileSheetEntry.value
  if (!e) return
  if (action.name === '预览') await preview(e)
  else if (action.name === '编辑') await editFile(e)
  else if (action.name === '下载') await downloadFile(e.path, e.size)
  else if (action.name === '复制路径') copyGithubPath(e)
  else await removeFile(e)
}

function openBranchPicker() {
  branchPickerVisible.value = true
}

function onBranchConfirm(payload: { selectedValues: string[] }) {
  branch.value = payload.selectedValues[0]
  branchPickerVisible.value = false
  loadDir(currentPath.value)
}

const ctx = computed(() => repoStore.currentOwnerName())
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const saving = ref(false)
const currentPath = ref('')
const branch = ref('')
const branchNames = ref<string[]>([])

const previewVisible = ref(false)
const previewPath = ref('')
/** 预览文件所在的 ref（深链预览可能与当前分支不同，下载需按此 ref 取文件） */
const previewRef = ref('')
const previewContent = ref('')
const previewSha = ref('')
const previewKind = ref<'text' | 'image'>('text')
const previewImage = ref('')
const fsVisible = ref(false)
/** Markdown 视图：渲染（默认）/ 源码 */
const mdView = ref<'render' | 'source'>('render')
const isMdFile = computed(() => previewKind.value === 'text' && isMarkdownFile(previewPath.value))
/** 展示「渲染 / 源码」切换（仅 Markdown 文本且非编辑态） */
const showMdToggle = computed(() => isMdFile.value && !editing.value)
/** 以渲染视图展示 */
const showMdRender = computed(() => showMdToggle.value && mdView.value === 'render')
let previewObjectUrl = ''
const editing = ref(false)
const editContent = ref('')
const commitMessage = ref('Update file')
const isNewFile = ref(false)

const IMAGE_MIMES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif'
}

/** 是否 Markdown 文件（支持「源码 / 渲染」双视图） */
function isMarkdownFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return ext === 'md' || ext === 'markdown' || ext === 'mdown' || ext === 'mkd'
}

function imageMime(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return IMAGE_MIMES[ext] || null
}

const pathSegs = computed(() => (currentPath.value ? currentPath.value.split('/') : []))

async function withPat() {
  return await accountStore.getPat(repoStore.currentAccountId)
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function githubFileUrl(path: string): string {
  const c = ctx.value
  if (!c) return ''
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${c.owner}/${c.repo}/blob/${encodeURIComponent(branch.value)}/${encoded}`
}

function copyGithubPath(row: FileEntry) {
  const url = githubFileUrl(row.path)
  if (!url) return
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => ElMessage.success('已复制GitHub路径'),
      () => ElMessage.warning('复制失败，请手动复制')
    )
  } else {
    ElMessage.warning('复制失败，请手动复制')
  }
}

function copyPreviewContent() {
  if (!previewContent.value) {
    ElMessage.warning('内容为空，无法复制')
    return
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(previewContent.value).then(
      () => ElMessage.success('已复制文件内容'),
      () => ElMessage.warning('复制失败，请手动复制')
    )
  } else {
    ElMessage.warning('复制失败，请手动复制')
  }
}

/* ---------- 单文件下载（软件内闭环：Android 原生流式 / Web·Windows blob 落盘） ---------- */

/** 正在下载的文件路径（驱动下载按钮 loading 态） */
const downloadingPaths = ref<string[]>([])

function isDownloading(path: string): boolean {
  return downloadingPaths.value.includes(path)
}

function markDownloading(path: string, active: boolean) {
  downloadingPaths.value = active
    ? downloadingPaths.value.includes(path)
      ? downloadingPaths.value
      : [...downloadingPaths.value, path]
    : downloadingPaths.value.filter(p => p !== path)
}

/**
 * 下载单个远程文件到本地：
 * 1) Android 客户端交给原生流式下载（保存到系统下载目录并弹通知）
 * 2) Web/Windows 走 api.github.com 的 raw 媒体类型拉取字节，浏览器内落盘
 * 全程不跳转 GitHub 页面，下载记录写入「下载」页。
 */
async function downloadFile(path: string, size = 0, refVal = branch.value) {
  const c = ctx.value
  if (!c || !path || isDownloading(path)) return
  // 深链预览可能未带 ref，回退到当前选中分支
  const targetRef = refVal || branch.value
  const filename = path.split('/').pop() || path
  const recordId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const detail = `${c.owner}/${c.repo}:${targetRef} ${path}`
  markDownloading(path, true)
  let handedToNative = false
  try {
    const pat = await withPat()
    if (!pat) return
    // 统一走 api.github.com（带 Token 支持私有仓库/大文件，且预检允许 Authorization，不会被浏览器拦成网络错误）
    const headers = { ...auth(pat), Accept: 'application/vnd.github.raw' }
    saveDownload({ id: recordId, filename, percent: 0, status: 'downloading', size })
    if (isAndroidClient()) requestAndroidNotificationPermission()
    handedToNative = startNativeDownload(
      recordId,
      contentsRawUrl(c.owner, c.repo, path, targetRef),
      headers,
      filename,
      {
        onDone: saved => {
          markDownloading(path, false)
          saveDownload({ id: recordId, filename, percent: 100, status: 'done', size, path: saved.path, uri: saved.uri })
          ElMessage.success(`${filename} 已保存到 ${saved.path}`)
          logStore.write({ module: 'file', action: '下载文件', detail: `${detail} 已保存到 ${saved.path}`, level: 'success' })
        },
        onError: msg => {
          markDownloading(path, false)
          saveDownload({ id: recordId, filename, percent: 0, status: 'error', size, error: msg })
          ElMessage.error(`下载失败：${msg}`)
          logStore.write({ module: 'file', action: '下载文件', detail: `${detail} 下载失败：${msg}`, level: 'error' })
        }
      }
    )
    if (handedToNative) {
      ElMessage.success('已开始软件内下载，完成后可在「下载」页打开')
      return
    }
    const res = await getFileRawBytes(pat, c.owner, c.repo, path, targetRef)
    if (res.code === 200 && res.data) {
      const fileSize = size || res.data.size
      blobDownload(res.data, filename)
      saveDownload({ id: recordId, filename, percent: 100, status: 'done', size: fileSize })
      ElMessage.success(`${filename} 下载完成`)
      logStore.write({ module: 'file', action: '下载文件', detail, level: 'success' })
    } else {
      saveDownload({ id: recordId, filename, percent: 0, status: 'error', size, error: res.msg })
      ElMessage.error(`下载失败：${res.msg}`)
      logStore.write({ module: 'file', action: '下载文件', detail: `${detail} 下载失败：${res.msg}`, level: 'error' })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err || '未知错误')
    saveDownload({ id: recordId, filename, percent: 0, status: 'error', size, error: msg })
    ElMessage.error(`下载失败：${msg}`)
    logStore.write({ module: 'file', action: '下载文件', detail: `${detail} 下载失败：${msg}`, level: 'error' })
  } finally {
    // 原生下载是异步的，loading 由 onDone/onError 收尾
    if (!handedToNative) markDownloading(path, false)
  }
}

async function initRepo() {
  const r = repoStore.currentRepo
  if (!r) {
    entries.value = []
    return
  }
  branch.value = r.default_branch
  const pat = await withPat()
  const bres = await getBranches(pat, r.owner.login, r.name)
  if (bres.code === 200) branchNames.value = (bres.data || []).map(b => b.name)
  loadDir('')
  handlePreviewQuery()
}

let previewConsumed = false
async function handlePreviewQuery() {
  const p = String(route.query.preview || '')
  const dir = String(route.query.dir || '')
  const refVal = String(route.query.ref || '')
  if (!p && !dir) {
    previewConsumed = false
    return
  }
  if (previewConsumed) return
  previewConsumed = true
  router.replace({ query: {} }).catch(() => {})
  await nextTick()
  if (p) {
    previewAtRef(p, refVal)
  } else {
    if (refVal) branch.value = refVal
    loadDir(dir)
  }
}

watch(() => [route.query.preview, route.query.dir], handlePreviewQuery)

/** 按指定 commit/ref 拉取文件内容并打开预览（从 Issue 提交跳转使用） */
async function previewAtRef(path: string, refVal: string) {
  const c = ctx.value
  if (!c) return
  await nextTick()
  const pat = await withPat()
  const mime = imageMime(path)
  if (mime) {
    const raw = await getFileRaw(pat, c.owner, c.repo, path, refVal)
    if (raw.code !== 200 || !raw.data) {
      ElMessage.error(`图片读取失败：${raw.msg}`)
      return
    }
    releaseObjectUrl()
    previewSha.value = raw.data.sha
    if (raw.data.base64) {
      previewImage.value = `data:${mime};base64,${raw.data.base64}`
    } else {
      const blobRes = await getFileRawBytes(pat, c.owner, c.repo, path, refVal || branch.value)
      if (blobRes.code === 200 && blobRes.data) {
        previewObjectUrl = URL.createObjectURL(blobRes.data)
        previewImage.value = previewObjectUrl
      } else {
        previewImage.value = ''
      }
    }
    previewPath.value = path
    previewRef.value = refVal
    previewKind.value = 'image'
    editing.value = false
    isNewFile.value = false
    previewVisible.value = true
    return
  }
  const res = await getFileContent(pat, c.owner, c.repo, path, refVal)
  if (res.code !== 200 || !res.data) {
    ElMessage.error(`读取失败：${res.msg}`)
    return
  }
  previewPath.value = path
  previewRef.value = refVal
  previewContent.value = res.data.content
  previewSha.value = res.data.sha
  previewKind.value = 'text'
  editing.value = false
  isNewFile.value = false
  previewVisible.value = true
}

async function loadDir(path: string) {
  if (!ctx.value) return
  loading.value = true
  const pat = await withPat()
  const res = await getFileTree(pat, ctx.value.owner, ctx.value.repo, path, branch.value)
  loading.value = false
  if (res.code === 200) {
    entries.value = res.data || []
    currentPath.value = path
  } else {
    ElMessage.error(`目录加载失败：${res.msg}`)
  }
}

function openEntry(row: FileEntry) {
  if (row.type === 'dir') loadDir(row.path)
  else preview(row)
}

async function preview(row: FileEntry) {
  if (!ctx.value) return
  const pat = await withPat()
  const mime = imageMime(row.name)
  if (mime) {
    const raw = await getFileRaw(pat, ctx.value.owner, ctx.value.repo, row.path, branch.value)
    if (raw.code !== 200 || !raw.data) {
      ElMessage.error(`图片读取失败：${raw.msg}`)
      return
    }
    releaseObjectUrl()
    previewSha.value = raw.data.sha
    if (raw.data.base64) {
      previewImage.value = `data:${mime};base64,${raw.data.base64}`
    } else {
      const blobRes = await getFileRawBytes(pat, ctx.value.owner, ctx.value.repo, row.path, branch.value)
      if (blobRes.code === 200 && blobRes.data) {
        previewObjectUrl = URL.createObjectURL(blobRes.data)
        previewImage.value = previewObjectUrl
      } else {
        ElMessage.error(`图片读取失败：${blobRes.msg}`)
        return
      }
    }
    previewPath.value = row.path
    previewRef.value = branch.value
    previewKind.value = 'image'
    editing.value = false
    isNewFile.value = false
    previewVisible.value = true
    return
  }
  const res = await getFileContent(pat, ctx.value.owner, ctx.value.repo, row.path, branch.value)
  if (res.code !== 200 || !res.data) {
    ElMessage.error(`读取失败：${res.msg}`)
    return
  }
  previewPath.value = row.path
  previewRef.value = branch.value
  previewContent.value = res.data.content
  previewSha.value = res.data.sha
  previewKind.value = 'text'
  editing.value = false
  isNewFile.value = false
  previewVisible.value = true
}

function releaseObjectUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl)
    previewObjectUrl = ''
  }
}

watch(previewVisible, v => {
  if (v) mdView.value = 'render'
  if (!v) releaseObjectUrl()
})

function startEdit() {
  editContent.value = previewContent.value
  commitMessage.value = `Update ${previewPath.value}`
  editing.value = true
}

async function editFile(row: FileEntry) {
  if (imageMime(row.name)) {
    ElMessage.info('图片等二进制文件不支持在线编辑')
    return
  }
  await preview(row)
  startEdit()
}

function cancelEdit() {
  if (isNewFile.value) previewVisible.value = false
  editing.value = false
}

function openNewFile() {
  if (!ctx.value) return
  isNewFile.value = true
  previewKind.value = 'text'
  previewPath.value = currentPath.value ? `${currentPath.value}/new-file.txt` : 'new-file.txt'
  previewContent.value = ''
  editContent.value = ''
  previewSha.value = ''
  commitMessage.value = 'Add new file'
  editing.value = true
  previewVisible.value = true
}

async function submitSave() {
  if (!ctx.value) return
  let path = previewPath.value
  if (isNewFile.value) {
    try {
      const r = await ElMessageBox.prompt('请输入新文件的完整路径：', '新建文件', {
        inputValue: path,
        inputPattern: /\S+/,
        inputErrorMessage: '路径不能为空'
      })
      path = String(r.value).trim()
    } catch {
      return
    }
  }
  if (!commitMessage.value.trim()) {
    ElMessage.warning('请输入提交信息')
    return
  }
  saving.value = true
  const pat = await withPat()
  const res = await saveFile(
    pat,
    ctx.value.owner,
    ctx.value.repo,
    path,
    editContent.value,
    isNewFile.value ? null : previewSha.value,
    commitMessage.value.trim(),
    branch.value
  )
  saving.value = false
  if (res.code === 200) {
    ElMessage.success('已直接提交到 GitHub 远程仓库')
    logStore.write({
      module: 'file',
      action: isNewFile.value ? '新增文件' : '编辑文件',
      detail: `${ctx.value.owner}/${ctx.value.repo}:${branch.value} ${path}`,
      level: 'warning'
    })
    previewVisible.value = false
    editing.value = false
    loadDir(currentPath.value)
  } else {
    ElMessage.error(`提交失败：${res.msg}`)
  }
}

async function removeFile(row: FileEntry) {
  if (!ctx.value) return
  try {
    await ElMessageBox.confirm(
      `高危操作：确认删除远程文件「${row.path}」并直接提交删除？`,
      '删除文件',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const pat = await withPat()
  const res = await deleteFile(pat, ctx.value.owner, ctx.value.repo, row.path, row.sha, `Delete ${row.path}`, branch.value)
  if (res.code === 200) {
    ElMessage.success('文件已删除并提交')
    logStore.write({ module: 'file', action: '删除文件', detail: `${ctx.value.owner}/${ctx.value.repo}:${branch.value} ${row.path}`, level: 'warning' })
    loadDir(currentPath.value)
  } else {
    ElMessage.error(`删除失败：${res.msg}`)
  }
}

watch(() => [repoStore.currentRepoFullName, repoStore.currentRepo?.id, accountStore.activeId], initRepo)
onMounted(initRepo)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-ops {
  display: flex;
  gap: 8px;
}
.crumb {
  margin-bottom: 12px;
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.preview-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-ops {
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
.link-text {
  color: var(--color-primary);
  cursor: pointer;
}
.dir-name {
  cursor: pointer;
  font-weight: 600;
}
.file-name {
  cursor: pointer;
}
.img-view {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  height: 56vh;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-page);
}
.img-view img {
  max-width: 100%;
  max-height: 100%;
}
.code-view {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  height: 56vh;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
  font-family: Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
.md-view {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 14px 16px;
  height: 56vh;
  overflow: auto;
}
.md-view-m {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px 14px;
  max-height: 62vh;
  overflow: auto;
}
.md-mode {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0 4px;
  margin-right: 6px;
}
.md-mode .el-button.active {
  font-weight: 700;
}
:deep(.code-editor textarea) {
  font-family: Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}
</style>

<style>
.el-dialog.is-fullscreen .code-view,
.el-dialog.is-fullscreen .img-view,
.el-dialog.is-fullscreen .md-view,
.el-dialog.is-fullscreen .code-editor textarea {
  height: calc(100vh - 150px);
}
</style>
