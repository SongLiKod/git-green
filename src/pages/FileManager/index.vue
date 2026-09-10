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
          :actions="[{ name: '预览' }, { name: '编辑' }, { name: '删除', color: '#ee0a24' }]"
          cancel-text="取消"
          close-on-click-action
          @select="onFileSheetSelect"
        />

        <van-popup v-model:show="previewVisible" position="bottom" round :style="{ height: fsVisible ? '100%' : '86%' }">
          <div class="m-popup">
            <div class="m-popup-title-row">
              <span class="m-popup-title">{{ previewPath }}</span>
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
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <template v-if="row.type === 'file'">
                <el-button link type="primary" @click="preview(row)">预览</el-button>
                <el-button link type="primary" @click="editFile(row)">编辑</el-button>
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
            <el-button link type="primary" @click="fsVisible = !fsVisible">{{ fsVisible ? '退出全屏' : '全屏' }}</el-button>
            <el-button link @click="previewVisible = false">关闭</el-button>
          </span>
        </div>
      </template>
      <el-input v-if="editing" v-model="editContent" type="textarea" :rows="22" class="code-editor" spellcheck="false" />
      <div v-else-if="previewKind === 'image'" class="img-view">
        <img :src="previewImage" alt="preview" />
      </div>
      <pre v-else class="code-view">{{ previewContent }}</pre>
      <el-input v-if="editing" v-model="commitMessage" placeholder="提交信息（commit message）" style="margin-top: 10px" />
      <template #footer>
        <template v-if="editing">
          <el-button @click="cancelEdit">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submitSave">提交到GitHub远程仓库</el-button>
        </template>
        <template v-else>
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
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useLogStore } from '@/stores/useLogStore'
import { getFileTree, getFileContent, getFileRaw, getFileBlob, saveFile, deleteFile } from '@/api/githubFile'
import type { FileEntry } from '@/api/githubFile'
import { getBranches } from '@/api/githubBranch'
import { useIsMobile } from '@/utils/platform'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()
const isMobile = useIsMobile()

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
const previewContent = ref('')
const previewSha = ref('')
const previewKind = ref<'text' | 'image'>('text')
const previewImage = ref('')
const fsVisible = ref(false)
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
      const blobRes = await getFileBlob(pat, raw.data.downloadUrl)
      if (blobRes.code === 200 && blobRes.data) {
        previewObjectUrl = URL.createObjectURL(blobRes.data)
        previewImage.value = previewObjectUrl
      } else {
        ElMessage.error(`图片读取失败：${blobRes.msg}`)
        return
      }
    }
    previewPath.value = row.path
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
:deep(.code-editor textarea) {
  font-family: Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}
</style>

<style>
.el-dialog.is-fullscreen .code-view,
.el-dialog.is-fullscreen .img-view,
.el-dialog.is-fullscreen .code-editor textarea {
  height: calc(100vh - 150px);
}
</style>
