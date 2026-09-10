<template>
  <div class="page">
    <RepoContextBar />
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
      :title="`${previewPath}${editing ? '（编辑中）' : '（在线预览）'}`"
      width="820px"
      top="4vh"
    >
      <el-input v-if="editing" v-model="editContent" type="textarea" :rows="22" class="code-editor" spellcheck="false" />
      <pre v-else class="code-view">{{ previewContent }}</pre>
      <el-input v-if="editing" v-model="commitMessage" placeholder="提交信息（commit message）" style="margin-top: 10px" />
      <template #footer>
        <template v-if="editing">
          <el-button @click="cancelEdit">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submitSave">提交到GitHub远程仓库</el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="startEdit">编辑此文件</el-button>
          <el-button @click="previewVisible = false">关闭</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import RepoContextBar from '@/components/RepoContextBar.vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { getFileTree, getFileContent, saveFile, deleteFile } from '@/api/githubFile'
import type { FileEntry } from '@/api/githubFile'
import { getBranches } from '@/api/githubBranch'

const accountStore = useAccountStore()
const repoStore = useRepoStore()

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
const editing = ref(false)
const editContent = ref('')
const commitMessage = ref('Update file')
const isNewFile = ref(false)

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
  const res = await getFileContent(pat, ctx.value.owner, ctx.value.repo, row.path, branch.value)
  if (res.code !== 200 || !res.data) {
    ElMessage.error(`读取失败：${res.msg}`)
    return
  }
  previewPath.value = row.path
  previewContent.value = res.data.content
  previewSha.value = res.data.sha
  editing.value = false
  isNewFile.value = false
  previewVisible.value = true
}

function startEdit() {
  editContent.value = previewContent.value
  commitMessage.value = `Update ${previewPath.value}`
  editing.value = true
}

async function editFile(row: FileEntry) {
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
    loadDir(currentPath.value)
  } else {
    ElMessage.error(`删除失败：${res.msg}`)
  }
}

watch(() => repoStore.currentRepoFullName, initRepo)
watch(() => accountStore.activeId, initRepo)
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
