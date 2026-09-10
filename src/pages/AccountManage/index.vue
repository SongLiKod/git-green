<template>
  <div class="page">
    <div class="page-toolbar">
      <el-button type="primary" @click="openAdd">添加账号</el-button>
      <el-button :loading="accountStore.checking" @click="accountStore.checkAll()">检测全部状态</el-button>
      <el-button @click="accountStore.exportConfig()">导出账号配置</el-button>
      <el-button @click="fileInput?.click()">导入账号配置</el-button>
      <input ref="fileInput" type="file" accept=".json" style="display: none" @change="onImportFile" />
    </div>

    <el-table :data="accountStore.accounts" border stripe>
      <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
      <el-table-column label="GitHub账号" min-width="140">
        <template #default="{ row }">
          <div class="user-cell">
            <el-avatar :size="26" :src="row.avatarUrl" />
            <span>{{ row.username }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="120" />
      <el-table-column label="标签" min-width="160">
        <template #default="{ row }">
          <el-tag v-for="t in row.tags" :key="t" size="small" class="tag-item">{{ t }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="group" label="分组" min-width="90" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'normal' ? 'success' : row.status === 'expired' ? 'warning' : 'danger'" size="small">
            {{ row.status === 'normal' ? '正常' : row.status === 'expired' ? '过期' : '失效' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="添加时间" width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :disabled="row.id === accountStore.activeId"
            @click="accountStore.switchAccount(row.id)"
          >
            切换使用
          </el-button>
          <el-button link @click="accountStore.refreshStatus(row)">检测</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span class="empty-text">暂无账号，点击「添加账号」绑定你的第一个 GitHub PAT</span>
      </template>
    </el-table>

    <el-dialog v-model="addVisible" title="添加 GitHub 账号（PAT）" width="480px">
      <el-form label-width="90px">
        <el-form-item label="PAT令牌" required>
          <el-input v-model="form.pat" type="password" show-password placeholder="ghp_xxx / github_pat_xxx" />
          <div class="form-tip">密钥仅本机 AES-256-CBC 加密存储，永不上传任何服务器</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" placeholder="例如：公司账号" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="form.tags" multiple filterable allow-create default-first-option placeholder="输入后回车创建标签" style="width: 100%">
            <el-option v-for="t in knownTags" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="分组">
          <el-select v-model="form.group" filterable allow-create default-first-option placeholder="输入后回车创建分组" style="width: 100%">
            <el-option v-for="g in knownGroups" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="adding" @click="submitAdd">校验并添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑账号" width="480px">
      <el-form label-width="90px">
        <el-form-item label="账号">
          <span>{{ editTarget?.username }}</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="editForm.tags" multiple filterable allow-create default-first-option style="width: 100%">
            <el-option v-for="t in knownTags" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="分组">
          <el-select v-model="editForm.group" filterable allow-create default-first-option style="width: 100%">
            <el-option v-for="g in knownGroups" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AccountManage' })
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { GitHubAccount } from '@/api/githubAccount'

const accountStore = useAccountStore()
const settings = useSettingsStore()

const fileInput = ref<HTMLInputElement>()
const addVisible = ref(false)
const adding = ref(false)
const form = reactive({ pat: '', remark: '', tags: [] as string[], group: '' })

const editVisible = ref(false)
const editTarget = ref<GitHubAccount | null>(null)
const editForm = reactive({ remark: '', tags: [] as string[], group: '' })

const knownTags = computed(() => Array.from(new Set(accountStore.accounts.flatMap(a => a.tags))))
const knownGroups = computed(() => Array.from(new Set(accountStore.accounts.map(a => a.group).filter(Boolean))))

function openAdd() {
  form.pat = ''
  form.remark = ''
  form.tags = []
  form.group = ''
  addVisible.value = true
}

async function submitAdd() {
  if (!form.pat.trim()) {
    ElMessage.warning('请输入PAT令牌')
    return
  }
  adding.value = true
  const ok = await accountStore.addAccount(form.pat.trim(), form.remark.trim(), form.tags, form.group)
  adding.value = false
  if (ok) addVisible.value = false
}

function openEdit(row: GitHubAccount) {
  editTarget.value = row
  editForm.remark = row.remark
  editForm.tags = [...row.tags]
  editForm.group = row.group
  editVisible.value = true
}

function submitEdit() {
  if (!editTarget.value) return
  accountStore.editAccount(editTarget.value.id, {
    remark: editForm.remark.trim(),
    tags: editForm.tags,
    group: editForm.group
  })
  editVisible.value = false
}

async function onDelete(row: GitHubAccount) {
  try {
    await ElMessageBox.confirm(
      `确定删除账号「${row.username}」吗？该账号的本地加密凭证将被清除，此操作不可恢复。`,
      '高危操作确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  accountStore.deleteAccount(row.id)
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    await accountStore.importConfig(String(reader.result || ''))
  }
  reader.readAsText(file)
  input.value = ''
}
</script>

<style scoped>
.page-toolbar {
  margin-bottom: 14px;
  display: flex;
  gap: 8px;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tag-item {
  margin-right: 4px;
}
.form-tip {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 20px;
}
.empty-text {
  color: var(--text-secondary);
}
</style>
