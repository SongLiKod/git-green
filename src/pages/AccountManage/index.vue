<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <div class="m-toolbar">
        <van-button type="primary" size="small" @click="openAdd">添加账号</van-button>
        <van-button size="small" :loading="accountStore.checking" @click="accountStore.checkAll()">检测全部</van-button>
        <van-button size="small" @click="accountStore.exportConfig()">导出配置</van-button>
        <van-button size="small" @click="fileInput?.click()">导入配置</van-button>
      </div>
      <van-empty v-if="accountStore.accounts.length === 0" description="暂无账号，点击上方添加" />
      <div v-for="a in accountStore.accounts" :key="a.id" class="m-card">
        <div class="m-card-head">
          <van-image round width="36" height="36" :src="a.avatarUrl" />
          <div class="m-card-title">
            <div class="t">{{ a.remark || a.username }}</div>
            <div class="m-sub">{{ a.username }} · {{ a.group || '未分组' }}</div>
          </div>
          <van-tag v-if="a.id === accountStore.activeId" type="primary">当前</van-tag>
          <van-tag :type="a.status === 'normal' ? 'success' : a.status === 'expired' ? 'warning' : 'danger'">
            {{ a.status === 'normal' ? '正常' : a.status === 'expired' ? '过期' : '失效' }}
          </van-tag>
        </div>
        <div v-if="a.tags.length" class="m-tags">
          <van-tag v-for="t in a.tags" :key="t" plain type="primary">{{ t }}</van-tag>
        </div>
        <div class="m-actions">
          <van-button size="small" type="success" plain :disabled="a.id === accountStore.activeId" @click="switchUse(a.id)">切换使用</van-button>
          <van-button size="small" plain @click="accountStore.refreshStatus(a)">检测</van-button>
          <van-button size="small" plain @click="openEdit(a)">编辑</van-button>
          <van-button size="small" type="danger" plain @click="onDelete(a)">删除</van-button>
        </div>
      </div>

      <van-popup v-model:show="addVisible" position="bottom" round>
        <div class="m-popup">
          <div class="m-popup-title">添加 GitHub 账号</div>
          <van-cell-group inset>
            <van-field v-model="form.pat" label="PAT令牌" placeholder="ghp_xxx" type="password" />
            <van-field v-model="form.remark" label="备注" placeholder="例如：公司账号" />
            <van-field v-model="tagsText" label="标签" placeholder="多个用逗号分隔" />
            <van-field v-model="form.group" label="分组" placeholder="可选" />
          </van-cell-group>
          <div class="m-sub" style="margin: 10px 16px">密钥仅本机 AES-256-CBC 加密存储，永不上传</div>
          <van-button block type="primary" :loading="adding" @click="submitAdd">校验并添加</van-button>
        </div>
      </van-popup>

      <van-popup v-model:show="editVisible" position="bottom" round>
        <div class="m-popup">
          <div class="m-popup-title">编辑 {{ editTarget?.username }}</div>
          <van-cell-group inset>
            <van-field v-model="editForm.remark" label="备注" />
            <van-field v-model="editTagsText" label="标签" placeholder="多个用逗号分隔" />
            <van-field v-model="editForm.group" label="分组" />
          </van-cell-group>
          <van-button block type="primary" style="margin-top: 14px" @click="submitEdit">保存</van-button>
        </div>
      </van-popup>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
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
            @click="switchUse(row.id)"
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
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AccountManage' })
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useIsMobile } from '@/utils/platform'
import type { GitHubAccount } from '@/api/githubAccount'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const isMobile = useIsMobile()

const tagsText = ref('')
const editTagsText = ref('')

function switchUse(id: string) {
  accountStore.switchAccount(id)
  repoStore.setCurrentAccount(id)
}

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
  tagsText.value = ''
  addVisible.value = true
}

async function submitAdd() {
  if (!form.pat.trim()) {
    ElMessage.warning('请输入PAT令牌')
    return
  }
  const tags = form.tags.length ? form.tags : tagsText.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  adding.value = true
  const ok = await accountStore.addAccount(form.pat.trim(), form.remark.trim(), tags, form.group)
  adding.value = false
  if (ok) addVisible.value = false
}

function openEdit(row: GitHubAccount) {
  editTarget.value = row
  editForm.remark = row.remark
  editForm.tags = [...row.tags]
  editForm.group = row.group
  editTagsText.value = row.tags.join(',')
  editVisible.value = true
}

function submitEdit() {
  if (!editTarget.value) return
  const tags = editTagsText.value
    ? editTagsText.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    : editForm.tags
  accountStore.editAccount(editTarget.value.id, {
    remark: editForm.remark.trim(),
    tags,
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
