<template>
  <div class="page">
    <template v-if="repo">
      <el-row :gutter="14">
        <el-col :span="12">
          <el-card shadow="never" class="mb14">
            <template #header>基本信息</template>
            <el-form label-width="80px">
              <el-form-item label="仓库名称">
                <el-input v-model="basic.name" />
              </el-form-item>
              <el-form-item label="描述">
                <el-input v-model="basic.description" type="textarea" :rows="2" />
              </el-form-item>
              <el-form-item label="主页链接">
                <el-input v-model="basic.homepage" placeholder="https://..." />
              </el-form-item>
            </el-form>
            <el-button type="primary" :loading="saving" @click="saveBasic">保存基本信息</el-button>
          </el-card>

          <el-card shadow="never">
            <template #header>权限与功能</template>
            <el-form label-width="110px">
              <el-form-item label="公开/私有">
                <el-switch
                  v-model="features.private"
                  active-text="私有"
                  inactive-text="公开"
                  @change="saveVisibility"
                />
              </el-form-item>
              <el-form-item label="仓库归档">
                <el-switch v-model="features.archived" active-text="已归档" @change="saveFeatures" />
              </el-form-item>
              <el-form-item label="Issues">
                <el-switch v-model="features.has_issues" @change="saveFeatures" />
              </el-form-item>
              <el-form-item label="Wiki">
                <el-switch v-model="features.has_wiki" @change="saveFeatures" />
              </el-form-item>
              <el-form-item label="Discussions">
                <el-switch v-model="features.has_discussions" @change="saveFeatures" />
              </el-form-item>
              <el-form-item label="默认分支">
                <el-select v-model="features.default_branch" style="width: 200px">
                  <el-option v-for="b in branches" :key="b.name" :label="b.name" :value="b.name" />
                </el-select>
                <el-button style="margin-left: 10px" @click="saveDefaultBranch">应用</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <el-col :span="12">
          <el-card shadow="never" class="mb14">
            <template #header>分支保护规则配置</template>
            <el-form label-width="110px">
              <el-form-item label="目标分支">
                <el-select v-model="protectBranch" style="width: 200px" @change="loadProtection">
                  <el-option v-for="b in branches" :key="b.name" :label="b.name" :value="b.name" />
                </el-select>
              </el-form-item>
              <el-form-item label="管理员强制">
                <el-switch v-model="protection.enforceAdmins" />
              </el-form-item>
              <el-form-item label="状态检查">
                <el-switch v-model="protection.statusChecks" />
              </el-form-item>
              <el-form-item label="必需检查项">
                <el-select v-model="protection.contexts" multiple filterable allow-create default-first-option placeholder="输入检查名后回车" style="width: 100%" :disabled="!protection.statusChecks">
                  <el-option v-for="c in protection.contexts" :key="c" :label="c" :value="c" />
                </el-select>
              </el-form-item>
              <el-form-item label="PR审核">
                <el-switch v-model="protection.prReviews" />
              </el-form-item>
              <el-form-item label="必需批准数">
                <el-input-number v-model="protection.reviewCount" :min="1" :max="6" :disabled="!protection.prReviews" />
              </el-form-item>
            </el-form>
            <el-button type="primary" :loading="saving" @click="saveProtection">保存保护规则</el-button>
            <el-button type="danger" plain @click="removeProtection">移除保护规则</el-button>
          </el-card>

          <el-card shadow="never">
            <template #header>协作者管理</template>
            <div class="collab-add">
              <el-input v-model="newCollab.login" placeholder="GitHub用户名" style="width: 180px" />
              <el-select v-model="newCollab.permission" style="width: 130px">
                <el-option label="拉取 pull" value="pull" />
                <el-option label="推送 push" value="push" />
                <el-option label="管理员 admin" value="admin" />
                <el-option label="维护 maintain" value="maintain" />
                <el-option label="分诊 triage" value="triage" />
              </el-select>
              <el-button type="primary" :loading="saving" @click="addCollaborator">添加</el-button>
            </div>
            <el-table :data="collaborators" border size="small" max-height="300">
              <el-table-column prop="login" label="用户" min-width="120" />
              <el-table-column label="权限" min-width="120">
                <template #default="{ row }">{{ permissionText(row) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="90">
                <template #default="{ row }">
                  <el-button link type="danger" @click="removeCollaborator(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </template>
    <el-empty v-else description="请先选择仓库（可在仓库列表页选中，或在上方切换）" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'RepoSetting' })
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useLogStore } from '@/stores/useLogStore'
import * as repoApi from '@/api/githubRepo'
import type { Collaborator } from '@/api/githubRepo'
import { getBranches, getBranchProtection, saveBranchProtection, deleteBranchProtection } from '@/api/githubBranch'
import type { GitHubBranch } from '@/api/githubBranch'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const logStore = useLogStore()

const repo = computed(() => repoStore.currentRepo)
const saving = ref(false)
const branches = ref<GitHubBranch[]>([])
const collaborators = ref<Collaborator[]>([])

const basic = reactive({ name: '', description: '', homepage: '' })
const features = reactive({
  private: false,
  archived: false,
  has_issues: true,
  has_wiki: true,
  has_discussions: false,
  default_branch: ''
})
const protectBranch = ref('')
const protection = reactive({
  enforceAdmins: false,
  statusChecks: false,
  contexts: [] as string[],
  prReviews: false,
  reviewCount: 1
})
const newCollab = reactive({ login: '', permission: 'push' as 'pull' | 'push' | 'admin' | 'maintain' | 'triage' })

async function withPat(): Promise<string> {
  const pat = await accountStore.getPat(repoStore.currentAccountId)
  return pat
}

function fillForm() {
  const r = repo.value
  if (!r) return
  basic.name = r.name
  basic.description = r.description || ''
  basic.homepage = r.homepage || ''
  features.private = r.private
  features.archived = r.archived
  features.has_issues = r.has_issues
  features.has_wiki = r.has_wiki
  features.has_discussions = r.has_discussions
  features.default_branch = r.default_branch
  protectBranch.value = r.default_branch
}

async function loadAll() {
  const r = repo.value
  if (!r) return
  fillForm()
  const pat = await withPat()
  if (!pat) return
  const b = await getBranches(pat, r.owner.login, r.name)
  if (b.code === 200) branches.value = b.data || []
  const c = await repoApi.getCollaborators(pat, r.owner.login, r.name)
  if (c.code === 200) collaborators.value = c.data || []
  if (protectBranch.value) loadProtection()
}

async function loadProtection() {
  const r = repo.value
  if (!r || !protectBranch.value) return
  const pat = await withPat()
  if (!pat) return
  const res = await getBranchProtection(pat, r.owner.login, r.name, protectBranch.value)
  if (res.code === 200 && res.data) {
    protection.enforceAdmins = !!res.data.enforce_admins
    protection.statusChecks = !!res.data.required_status_checks
    protection.contexts = res.data.required_status_checks?.contexts || []
    protection.prReviews = !!res.data.required_pull_request_reviews
    protection.reviewCount = res.data.required_pull_request_reviews?.required_approving_review_count || 1
    ElMessage.success('已加载该分支的保护规则')
  } else {
    protection.enforceAdmins = false
    protection.statusChecks = false
    protection.contexts = []
    protection.prReviews = false
    protection.reviewCount = 1
  }
}

async function saveBasic() {
  const r = repo.value
  if (!r) return
  saving.value = true
  const pat = await withPat()
  const res = await repoApi.updateRepoBasic(pat, r.owner.login, r.name, {
    name: basic.name.trim(),
    description: basic.description,
    homepage: basic.homepage || null
  })
  saving.value = false
  if (res.code === 200) {
    ElMessage.success('仓库基本信息已更新')
    logStore.write({ module: 'repo', action: '修改仓库信息', detail: `${r.full_name} → ${basic.name}`, level: 'success' })
    await repoStore.refreshCurrent()
  } else {
    ElMessage.error(`更新失败：${res.msg}`)
  }
}

async function saveVisibility(v: boolean | string | number) {
  const r = repo.value
  if (!r) return
  const pat = await withPat()
  const res = await repoApi.updateRepoVisibility(pat, r.owner.login, r.name, !!v)
  if (res.code === 200) {
    ElMessage.success(`已切换为${v ? '私有' : '公开'}仓库`)
    logStore.write({ module: 'repo', action: '切换可见性', detail: `${r.full_name} → ${v ? '私有' : '公开'}`, level: 'warning' })
    await repoStore.refreshCurrent()
  } else {
    ElMessage.error(`切换失败：${res.msg}`)
    features.private = !v
  }
}

async function saveFeatures() {
  const r = repo.value
  if (!r) return
  const pat = await withPat()
  const res = await repoApi.updateRepoFeatures(pat, r.owner.login, r.name, {
    archived: features.archived,
    has_issues: features.has_issues,
    has_wiki: features.has_wiki,
    has_discussions: features.has_discussions
  })
  if (res.code === 200) {
    ElMessage.success('功能配置已更新')
    logStore.write({ module: 'repo', action: '更新功能开关', detail: `${r.full_name}：归档=${features.archived} Issues=${features.has_issues} Wiki=${features.has_wiki} Discussions=${features.has_discussions}` })
    await repoStore.refreshCurrent()
  } else {
    ElMessage.error(`更新失败：${res.msg}`)
  }
}

async function saveDefaultBranch() {
  const r = repo.value
  if (!r) return
  const pat = await withPat()
  const res = await repoApi.updateRepoFeatures(pat, r.owner.login, r.name, {
    default_branch: features.default_branch
  })
  if (res.code === 200) {
    ElMessage.success(`默认分支已切换为 ${features.default_branch}`)
    logStore.write({ module: 'repo', action: '修改默认分支', detail: `${r.full_name} → ${features.default_branch}`, level: 'warning' })
    await repoStore.refreshCurrent()
  } else {
    ElMessage.error(`切换失败：${res.msg}`)
  }
}

async function saveProtection() {
  const r = repo.value
  if (!r || !protectBranch.value) {
    ElMessage.warning('请选择目标分支')
    return
  }
  saving.value = true
  const pat = await withPat()
  const res = await saveBranchProtection(pat, r.owner.login, r.name, protectBranch.value, {
    required_status_checks: protection.statusChecks
      ? { strict: true, contexts: protection.contexts }
      : null,
    required_pull_request_reviews: protection.prReviews
      ? { required_approving_review_count: protection.reviewCount }
      : null,
    enforce_admins: protection.enforceAdmins ? {} : null,
    restrictions: null
  })
  saving.value = false
  if (res.code === 200) {
    ElMessage.success(`分支 ${protectBranch.value} 保护规则已保存`)
    logStore.write({ module: 'branch', action: '配置分支保护', detail: `${r.full_name}:${protectBranch.value}`, level: 'warning' })
  }
  else ElMessage.error(`保存失败：${res.msg}`)
}

async function removeProtection() {
  const r = repo.value
  if (!r || !protectBranch.value) return
  try {
    await ElMessageBox.confirm(`确认移除分支「${protectBranch.value}」的保护规则？`, '二次确认', { type: 'warning' })
  } catch {
    return
  }
  const pat = await withPat()
  const res = await deleteBranchProtection(pat, r.owner.login, r.name, protectBranch.value)
  if (res.code === 200) {
    ElMessage.success('保护规则已移除')
    logStore.write({ module: 'branch', action: '移除分支保护', detail: `${r.full_name}:${protectBranch.value}`, level: 'warning' })
  }
  else ElMessage.error(`移除失败：${res.msg}`)
}

function permissionText(c: Collaborator): string {
  if (c.role_name) return c.role_name
  const p = c.permissions || {}
  if (p.admin) return '管理员'
  if (p.maintain) return '维护'
  if (p.push) return '推送'
  if (p.triage) return '分诊'
  return '拉取'
}

async function addCollaborator() {
  const r = repo.value
  if (!r) return
  if (!newCollab.login.trim()) {
    ElMessage.warning('请输入GitHub用户名')
    return
  }
  saving.value = true
  const pat = await withPat()
  const res = await repoApi.addCollaborator(pat, r.owner.login, r.name, newCollab.login.trim(), newCollab.permission)
  saving.value = false
  if (res.code === 200 || res.code === 201) {
    ElMessage.success('协作者已添加（对方需接受邀请后生效）')
    logStore.write({ module: 'repo', action: '添加协作者', detail: `${r.full_name} + ${newCollab.login}（${newCollab.permission}）`, level: 'warning' })
    newCollab.login = ''
    loadAll()
  } else {
    ElMessage.error(`添加失败：${res.msg}`)
  }
}

async function removeCollaborator(c: Collaborator) {
  const r = repo.value
  if (!r) return
  try {
    await ElMessageBox.confirm(`确认移除协作者「${c.login}」？`, '二次确认', { type: 'warning' })
  } catch {
    return
  }
  const pat = await withPat()
  const res = await repoApi.removeCollaborator(pat, r.owner.login, r.name, c.login)
  if (res.code === 204 || res.code === 200) {
    ElMessage.success('协作者已移除')
    logStore.write({ module: 'repo', action: '移除协作者', detail: `${r.full_name} - ${c.login}`, level: 'warning' })
    loadAll()
  } else {
    ElMessage.error(`移除失败：${res.msg}`)
  }
}

watch(() => [repoStore.currentRepoFullName, repoStore.currentRepo?.id, accountStore.activeId], loadAll)
onMounted(loadAll)
</script>

<style scoped>
.mb14 {
  margin-bottom: 14px;
}
.collab-add {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
</style>
