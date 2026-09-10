<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <div class="m-toolbar">
        <van-button type="primary" size="small" plain @click="openApply">申请PAT</van-button>
        <van-button type="primary" size="small" @click="openAdd">添加账号</van-button>
        <van-button size="small" :loading="accountStore.checking" @click="accountStore.checkAll()">检测全部</van-button>
        <van-button size="small" plain @click="sshInfoVisible = true">SSH说明</van-button>
        <van-button size="small" @click="accountStore.exportConfig()">导出配置</van-button>
        <van-button size="small" @click="fileInput?.click()">导入配置</van-button>
      </div>
      <van-empty v-if="accountStore.accounts.length === 0" description="暂无账号，点击上方添加" />
      <div v-for="a in accountStore.accounts" :key="a.id" class="m-card">
        <div class="m-card-head">
          <van-image round width="36" height="36" :src="a.avatarUrl" />
          <div class="m-card-title">
            <div class="t">{{ a.remark || a.username }}</div>
            <div class="m-sub">{{ a.username }} · {{ a.group || '未分组' }} · SSH: {{ a.sshHost || 'github.com' }}</div>
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
            <van-cell title="还没有令牌？点此申请" is-link @click="openApply" />
            <van-field v-model="form.remark" label="备注" placeholder="例如：公司账号" />
            <van-field v-model="form.sshHost" label="SSH主机" placeholder="github.com" />
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
            <van-field v-model="editForm.sshHost" label="SSH主机" placeholder="github.com" />
            <van-field v-model="editTagsText" label="标签" placeholder="多个用逗号分隔" />
            <van-field v-model="editForm.group" label="分组" />
          </van-cell-group>
          <van-button block type="primary" style="margin-top: 14px" @click="submitEdit">保存</van-button>
        </div>
      </van-popup>

      <van-popup v-model:show="applyVisible" position="bottom" round>
        <div class="m-popup">
          <div class="m-popup-title">申请 GitHub PAT</div>
          <van-cell-group inset>
            <van-field v-model="applyForm.note" label="令牌备注" placeholder="GitGreen" />
            <van-field label="令牌类型">
              <template #input>
                <van-radio-group v-model="applyForm.type" direction="horizontal">
                  <van-radio name="classic">经典</van-radio>
                  <van-radio name="fine">细粒度</van-radio>
                </van-radio-group>
              </template>
            </van-field>
            <van-field v-if="applyForm.type === 'classic'" label="权限范围">
              <template #input>
                <van-checkbox-group v-model="applyForm.scopes" direction="vertical">
                  <van-checkbox name="repo">仓库（含私有读写）</van-checkbox>
                  <van-checkbox name="workflow">工作流（更新 Actions）</van-checkbox>
                  <van-checkbox name="read:user">读取用户信息</van-checkbox>
                  <van-checkbox name="gist">Gist</van-checkbox>
                </van-checkbox-group>
              </template>
            </van-field>
          </van-cell-group>
          <div class="m-sub" style="margin: 10px 16px">GitHub 不提供程序内一键生成令牌的公开接口，按下述方式到官方页面申请，再把令牌粘贴进「添加账号」。</div>
          <van-button block plain style="margin-bottom: 10px" @click="copyApplyUrl">复制申请链接</van-button>
          <van-button block type="primary" @click="openApplyUrl">打开 GitHub 创建页</van-button>
        </div>
      </van-popup>

      <div class="m-section-title">SSH 密钥（{{ accountStore.activeAccount ? accountStore.activeAccount.remark || accountStore.activeAccount.username : '当前账号' }}）</div>
      <div class="m-toolbar">
        <van-button size="small" :loading="sshLoading" @click="loadSshKeys">刷新</van-button>
        <van-button size="small" type="primary" plain @click="openSshAdd">新增 SSH Key</van-button>
      </div>
      <van-empty v-if="sshKeys.length === 0" description="暂无 SSH Key" />
      <div v-for="k in sshKeys" :key="k.id" class="m-card">
        <div class="m-card-head">
          <div class="m-card-title">
            <div class="t">{{ k.title }}</div>
            <div class="m-sub">{{ k.verified ? '已验证' : '未验证' }} · {{ new Date(k.created_at).toLocaleString() }}</div>
          </div>
          <van-button size="mini" type="danger" plain @click="removeSshKey(k)">删除</van-button>
        </div>
        <div class="m-code">{{ k.key }}</div>
      </div>

      <van-popup v-model:show="sshVisible" position="bottom" round>
        <div class="m-popup">
          <div class="m-popup-title">添加 SSH 公钥</div>
          <van-cell-group inset>
            <van-field v-model="sshForm.title" label="标题" placeholder="例如：公司笔记本" />
            <van-field v-model="sshForm.key" label="公钥" type="textarea" rows="5" placeholder="ssh-ed25519 AAAA..." autosize />
          </van-cell-group>
          <div class="m-sub" style="margin: 10px 16px">填写公钥内容（~/.ssh/id_ed25519.pub），私有部分请勿填写</div>
          <van-button block type="primary" :loading="sshSaving" @click="submitSshKey">添加</van-button>
        </div>
      </van-popup>

      <van-popup v-model:show="sshInfoVisible" position="bottom" round>
        <div class="m-popup">
          <div class="m-popup-title">自定义 SSH 主机使用说明</div>
          <div class="m-sub" style="margin: 0 6px 10px">
            克隆地址 git@&lt;SSH主机&gt;:owner/repo.git 使用账号配置的主机；非 github.com 时，需在本地 ~/.ssh/config 配置映射，例如：
          </div>
          <pre class="m-code">{{ sshConfigSample }}</pre>
          <div class="m-sub" style="margin: 10px 6px">
            将主机指向 github.com 并指定你的私钥文件后即可正常使用；Windows 路径为 C:\Users\你的用户名\.ssh\config。
          </div>
          <van-button block type="primary" @click="sshInfoVisible = false">知道了</van-button>
        </div>
      </van-popup>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
    <div class="page-toolbar">
      <el-button type="primary" plain @click="openApply">申请PAT</el-button>
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
      <el-table-column label="SSH主机" min-width="130">
        <template #header>
          <span class="ssh-host-header">SSH主机
            <el-icon class="ssh-info-icon" title="如何使用自定义SSH主机" @click.stop="sshInfoVisible = true"><InfoFilled /></el-icon>
          </span>
        </template>
        <template #default="{ row }">
          <span v-if="row.sshHost && row.sshHost.trim() !== 'github.com'" class="mono">{{ row.sshHost }}</span>
        </template>
      </el-table-column>
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

    <div class="ssh-section">
      <div class="ssh-head">
        <div class="ssh-title">SSH 密钥（{{ accountStore.activeAccount ? accountStore.activeAccount.remark || accountStore.activeAccount.username : '当前账号' }}）</div>
        <el-button type="primary" plain @click="openSshAdd">新增 SSH Key</el-button>
      </div>
      <el-table :data="sshKeys" border stripe v-loading="sshLoading">
        <el-table-column prop="title" label="标题" min-width="160" />
        <el-table-column label="公钥" min-width="300">
          <template #default="{ row }"><span class="ssh-key mono">{{ row.key }}</span></template>
        </el-table-column>
        <el-table-column label="验证" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.verified ? 'success' : 'warning'">{{ row.verified ? '已验证' : '未验证' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="添加时间" width="180">
          <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeSshKey(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="addVisible" title="添加 GitHub 账号（PAT）" width="480px">
      <el-form label-width="90px">
        <el-form-item label="PAT令牌" required>
          <el-input v-model="form.pat" type="password" show-password placeholder="ghp_xxx / github_pat_xxx" />
          <div class="form-tip">密钥仅本机 AES-256-CBC 加密存储，永不上传任何服务器 · <el-link type="primary" @click="openApply">去申请 PAT</el-link></div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" placeholder="例如：公司账号" />
        </el-form-item>
        <el-form-item label="SSH主机">
          <el-input v-model="form.sshHost" placeholder="github.com" />
          <div class="form-tip">SSH克隆地址使用：git@&lt;主机&gt;:owner/repo.git，默认 github.com</div>
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

    <el-dialog v-model="editVisible" title="编辑账号" width="480px">>
      <el-form label-width="90px">
        <el-form-item label="账号">
          <span>{{ editTarget?.username }}</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" />
        </el-form-item>
        <el-form-item label="SSH主机">
          <el-input v-model="editForm.sshHost" placeholder="github.com" />
          <div class="form-tip">SSH克隆地址使用：git@&lt;主机&gt;:owner/repo.git</div>
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

    <el-dialog v-model="applyVisible" title="申请 GitHub PAT" width="520px">
      <el-form label-width="100px">
        <el-form-item label="令牌类型">
          <el-radio-group v-model="applyForm.type">
            <el-radio value="classic">经典令牌（简单，全仓库权限）</el-radio>
            <el-radio value="fine">细粒度令牌（可限定仓库与权限）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="applyForm.type === 'classic'" label="权限范围">
          <el-checkbox-group v-model="applyForm.scopes">
            <el-checkbox value="repo">仓库（含私有读写）</el-checkbox>
            <el-checkbox value="workflow">工作流（更新 Actions）</el-checkbox>
            <el-checkbox value="read:user">读取用户信息</el-checkbox>
            <el-checkbox value="gist">Gist</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="令牌备注">
          <el-input v-model="applyForm.note" placeholder="GitGreen" />
        </el-form-item>
      </el-form>
      <div class="form-tip" style="margin-left: 100px">
        GitHub 不开放程序内一键生成令牌的公开接口，请打开官方创建页按所选权限申请，之后将生成的令牌粘贴到「添加账号」的 PAT 输入框即可。
      </div>
      <template #footer>
        <el-button @click="applyVisible = false">取消</el-button>
        <el-button @click="copyApplyUrl">复制申请链接</el-button>
        <el-button type="primary" @click="openApplyUrl">打开 GitHub 创建页</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="sshVisible" title="添加 SSH 公钥" width="520px">
      <el-form label-width="90px">
        <el-form-item label="标题">
          <el-input v-model="sshForm.title" placeholder="例如：公司笔记本" />
        </el-form-item>
        <el-form-item label="公钥" required>
          <el-input v-model="sshForm.key" type="textarea" :rows="5" placeholder="ssh-ed25519 AAAA... / ssh-rsa AAAA..." />
          <div class="form-tip">添加的是你的 SSH 公钥（~/.ssh/id_ed25519.pub 内容），密钥私有部分请勿填写</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sshVisible = false">取消</el-button>
        <el-button type="primary" :loading="sshSaving" @click="submitSshKey">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="sshInfoVisible" title="自定义 SSH 主机使用说明" width="600px">
      <div class="ssh-info-body">
        <p>克隆地址中的 <code>git@&lt;SSH主机&gt;:owner/repo.git</code> 使用的是你为本账号配置的 SSH 主机。若主机不是 <code>github.com</code>，需要在你本地电脑的 SSH 配置文件（<code>~/.ssh/config</code>）中写一条映射，例如：</p>
        <pre class="ssh-config">{{ sshConfigSample }}</pre>
        <p>将 <code>{{ accountStore.activeAccount?.sshHost?.trim() || 'your.host' }}</code> 指向 <code>github.com</code>，并指定你自己的私钥文件（<code>~/.ssh/your_private_key</code>）。配置完成后，<code>git@SongLiKod.com:...</code> 这类地址即可正常 clone / push。Windows 路径为 <code>C:\Users\你的用户名\.ssh\config</code>。</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="sshInfoVisible = false">知道了</el-button>
      </template>
    </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'AccountManage' })
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useIsMobile } from '@/utils/platform'
import type { GitHubAccount } from '@/api/githubAccount'
import { listSshKeys, createSshKey, deleteSshKey } from '@/api/githubSsh'
import type { SshKey } from '@/api/githubSsh'

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
const form = reactive({ pat: '', remark: '', tags: [] as string[], group: '', sshHost: '' })

const editVisible = ref(false)
const editTarget = ref<GitHubAccount | null>(null)
const editForm = reactive({ remark: '', tags: [] as string[], group: '', sshHost: '' })

const applyVisible = ref(false)
const applyForm = reactive({ type: 'classic', scopes: ['repo', 'workflow', 'read:user'] as string[], note: 'GitGreen' })

function openApply() {
  applyVisible.value = true
}

function applyUrl() {
  if (applyForm.type === 'fine') return 'https://github.com/settings/personal-access-tokens/new'
  const scopes = applyForm.scopes.length ? applyForm.scopes.join(',') : 'repo'
  return `https://github.com/settings/tokens/new?scopes=${scopes}&description=${encodeURIComponent(applyForm.note || 'GitGreen')}`
}

function openApplyUrl() {
  window.open(applyUrl(), '_blank')
}

function copyApplyUrl() {
  const url = applyUrl()
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => ElMessage.success('已复制申请链接'),
      () => ElMessage.warning('复制失败，请手动复制地址')
    )
  } else {
    ElMessage.warning('复制失败，请手动复制地址')
  }
}

const knownTags = computed(() => Array.from(new Set(accountStore.accounts.flatMap(a => a.tags))))
const knownGroups = computed(() => Array.from(new Set(accountStore.accounts.map(a => a.group).filter(Boolean))))

const sshKeys = ref<SshKey[]>([])
const sshLoading = ref(false)
const sshVisible = ref(false)
const sshSaving = ref(false)
const sshForm = reactive({ title: '', key: '' })
const sshInfoVisible = ref(false)

const sshConfigSample = computed(() => {
  const acc = accountStore.activeAccount
  const host = acc?.sshHost?.trim() || 'github.com'
  const user = acc?.username || '你的用户名'
  return `Host ${host}\n    HostName github.com\n    User ${user}\n    AddKeysToAgent yes\n    IgnoreUnknown UseKeychain\n    IdentityFile ~/.ssh/your_private_key`
})

async function loadSshKeys() {
  const pat = await accountStore.getPat()
  if (!pat) return
  sshLoading.value = true
  const res = await listSshKeys(pat)
  sshLoading.value = false
  if (res.code === 200) sshKeys.value = res.data || []
  else if (res.code === 401 || res.code === 403) ElMessage.error(`SSH Keys加载失败：${res.msg}`)
}

function openSshAdd() {
  sshForm.title = ''
  sshForm.key = ''
  sshVisible.value = true
}

async function submitSshKey() {
  if (!sshForm.title.trim()) return ElMessage.warning('请输入标题')
  if (!sshForm.key.trim()) return ElMessage.warning('请输入SSH公钥')
  sshSaving.value = true
  const pat = await accountStore.getPat()
  const res = await createSshKey(pat, sshForm.title.trim(), sshForm.key.trim())
  sshSaving.value = false
  if (res.code === 200 || res.code === 201) {
    ElMessage.success('SSH Key已添加')
    sshVisible.value = false
    loadSshKeys()
  } else {
    ElMessage.error(`添加失败：${res.msg}`)
  }
}

async function removeSshKey(k: SshKey) {
  try {
    await ElMessageBox.confirm(`确认删除 SSH Key「${k.title}」？`, '确认删除', { type: 'warning' })
  } catch {
    return
  }
  const pat = await accountStore.getPat()
  const res = await deleteSshKey(pat, k.id)
  if (res.code === 204 || res.code === 200) {
    ElMessage.success('已删除')
    loadSshKeys()
  } else ElMessage.error(`删除失败：${res.msg}`)
}

onMounted(loadSshKeys)

function openAdd() {
  form.pat = ''
  form.remark = ''
  form.tags = []
  form.group = ''
  form.sshHost = ''
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
  const ok = await accountStore.addAccount(form.pat.trim(), form.remark.trim(), tags, form.group, form.sshHost)
  adding.value = false
  if (ok) addVisible.value = false
}

function openEdit(row: GitHubAccount) {
  editTarget.value = row
  editForm.remark = row.remark
  editForm.tags = [...row.tags]
  editForm.group = row.group
  editForm.sshHost = row.sshHost && row.sshHost.trim() !== 'github.com' ? row.sshHost : ''
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
    group: editForm.group,
    sshHost: editForm.sshHost.trim() || 'github.com'
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
.ssh-section {
  margin-top: 18px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 14px;
  background: var(--bg-card);
}
.ssh-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.ssh-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}
.ssh-key {
  display: block;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}
.ssh-host-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ssh-info-icon {
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
}
.ssh-info-icon:hover {
  color: var(--color-primary);
}
.ssh-info-body p {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-main);
  margin: 8px 0;
}
.ssh-info-body code {
  font-family: Consolas, monospace;
  background: var(--bg-page);
  padding: 1px 5px;
  border-radius: 4px;
}
.ssh-config {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  font-family: Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-all;
}
.mono {
  font-family: Consolas, monospace;
}
.empty-text {
  color: var(--text-secondary);
}
</style>
