<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <van-empty v-if="!ctx" description="请在顶栏选择仓库" />
      <template v-else>
        <van-tabs :active="tab === 'workflows' ? 0 : tab === 'runs' ? 1 : 2" @change="onMTab">
          <van-tab title="工作流" />
          <van-tab title="运行记录" />
          <van-tab title="环境变量" />
        </van-tabs>

        <template v-if="tab === 'workflows'">
          <div class="m-toolbar">
            <van-button size="small" :loading="loading" @click="loadWorkflows">刷新</van-button>
          </div>
          <van-empty v-if="workflows.length === 0" description="暂无工作流" />
          <div v-for="w in workflows" :key="w.id" class="m-card" @click="openWSheet(w)">
            <div class="m-card-head">
              <div class="m-card-title">
                <div class="t">{{ w.name }}</div>
                <div class="m-sub">{{ w.path }}</div>
              </div>
              <van-tag :type="w.state === 'active' ? 'success' : 'default'">{{ w.state === 'active' ? '启用' : w.state }}</van-tag>
            </div>
          </div>
        </template>

<template v-else-if="tab === 'runs'">
          <div class="m-toolbar">
            <van-cell title="筛选" :value="runFilterName" style="flex: 1; padding: 0" @click="openRunFilter" />
            <van-button size="small" :loading="runsLoading" @click="loadRuns">刷新</van-button>
            <van-switch v-model="autoRefresh" size="18" title="自动刷新" />
          </div>
          <van-empty v-if="runs.length === 0" description="暂无运行记录" />
          <div v-for="r in runs" :key="r.id" class="m-card">
            <div class="m-card-head">
              <div class="m-card-title">
                <div class="t">#{{ r.run_number }} {{ r.display_title || r.name }}</div>
                <div class="m-sub">{{ r.branch }} · {{ r.event }} · {{ new Date(r.created_at).toLocaleString() }}</div>
              </div>
              <van-tag :type="r.status !== 'completed' ? 'warning' : r.conclusion === 'success' ? 'success' : r.conclusion === 'cancelled' ? 'default' : 'danger'">
                {{ runText(r) }}
              </van-tag>
            </div>
            <div class="m-actions">
              <van-button size="mini" type="primary" plain @click="openLogs(r)">日志</van-button>
              <van-button size="mini" type="primary" plain @click="openRunResult(r)">产物/结果</van-button>
              <van-button v-if="r.status !== 'completed'" size="mini" type="warning" plain @click="cancel(r)">取消</van-button>
              <van-button v-if="r.status === 'completed'" size="mini" plain @click="rerun(r)">重新运行</van-button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="m-toolbar">
            <van-button size="small" :loading="varsLoading" @click="loadVars">刷新</van-button>
            <van-button size="small" type="primary" plain @click="openVarAdd">新增变量</van-button>
            <van-button size="small" type="primary" plain @click="openSecretAdd">新增密钥</van-button>
          </div>
          <div class="m-section-title">环境变量（Actions Variables）</div>
          <van-empty v-if="vars.length === 0" description="暂无环境变量" />
          <div v-for="v in vars" :key="v.name" class="m-card">
            <div class="m-card-head">
              <div class="m-card-title">
                <div class="t mono">{{ v.name }}</div>
                <div class="m-sub">{{ v.value }}</div>
              </div>
              <van-button size="mini" plain @click="openVarEdit(v)">编辑</van-button>
              <van-button size="mini" type="danger" plain @click="removeVariable(v.name)">删除</van-button>
            </div>
          </div>
          <div class="m-section-title">密钥（Secrets，值不可回读）</div>
          <van-empty v-if="secrets.length === 0" description="暂无密钥" />
          <div v-for="s in secrets" :key="s.name" class="m-card">
            <div class="m-card-head">
              <div class="m-card-title">
                <div class="t mono">{{ s.name }}</div>
                <div class="m-sub">更新于 {{ new Date(s.updated_at).toLocaleString() }}</div>
              </div>
              <van-button size="mini" plain @click="openSecretUpdate(s)">更新</van-button>
              <van-button size="mini" type="danger" plain @click="removeSecret(s.name)">删除</van-button>
            </div>
          </div>
        </template>

        <van-popup v-model:show="vDialog" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">{{ vMode === 'var' ? (vEdit ? '编辑变量' : '新增变量') : (vEdit ? '更新密钥' : '新增密钥') }}</div>
            <van-cell-group inset>
              <van-field v-model="vForm.name" label="名称" :readonly="vEdit" placeholder="如 MY_VAR" />
              <van-field v-model="vForm.value" :label="vMode === 'var' ? '值' : '密钥值'" placeholder="如 abc_123" />
            </van-cell-group>
            <van-button block type="primary" style="margin-top: 14px" :loading="saving" @click="submitVForm">保存</van-button>
          </div>
        </van-popup>

        <van-action-sheet
          v-model:show="wSheetVisible"
          :actions="[{ name: '手动触发' }, { name: '查看运行记录' }, { name: '编辑YML' }]"
          cancel-text="取消"
          close-on-click-action
          @select="onWSelect"
        />

        <van-popup v-model:show="triggerVisible" position="bottom" round>
          <div class="m-popup">
            <div class="m-popup-title">手动触发流水线</div>
            <van-cell-group inset>
              <van-cell title="工作流" :value="triggerTarget?.name" />
              <van-field :model-value="triggerRef" label="分支" placeholder="选择分支" readonly is-link @click="openBranchPicker" />
              <van-field
                v-for="inp in triggerInputs"
                :key="inp.id"
                :model-value="triggerVals[inp.id]"
                :label="inputLabel(inp)"
                :placeholder="inp.description || inp.id"
                @update:model-value="triggerVals[inp.id] = $event"
              />
            </van-cell-group>
            <van-button block type="primary" style="margin-top: 14px" :loading="saving" @click="submitTrigger">触发运行</van-button>
          </div>
        </van-popup>

        <van-popup v-model:show="editorVisible" position="bottom" round :style="{ height: '86%' }">
          <div class="m-popup">
            <div class="m-popup-title">{{ editorPath }}</div>
            <van-field v-model="editorContent" type="textarea" rows="16" class="m-yml" :spellcheck="false" />
            <van-field v-model="commitMessage" placeholder="提交信息" style="margin-top: 8px" border />
            <div class="m-actions">
              <van-button block type="primary" :loading="saving" @click="saveWorkflowYml">保存并提交</van-button>
            </div>
          </div>
        </van-popup>

        <van-popup v-model:show="logsVisible" position="bottom" round :style="{ height: '86%' }">
          <div class="m-popup">
            <div class="m-popup-title">运行日志 #{{ logsRun?.run_number || '' }}</div>
            <pre class="m-logs">{{ logsText || '等待日志输出...' }}</pre>
            <div class="m-actions"><van-button block @click="closeLogs">关闭</van-button></div>
          </div>
        </van-popup>

        <van-popup v-model:show="resultVisible" position="bottom" round :style="{ height: '86%' }">
          <div class="m-popup">
            <div class="m-popup-title">产物 / 检查结果 #{{ resultRun?.run_number || '' }}</div>
            <div v-if="resultLoading" style="text-align: center; padding: 30px"><van-loading /></div>
            <template v-else>
              <div class="m-section-title">Artifacts（{{ runArtifacts.length }}）</div>
              <van-empty v-if="runArtifacts.length === 0" description="本次运行无产物" />
              <div v-for="art in runArtifacts" :key="art.id" class="m-card">
                <div class="m-card-head">
                  <div class="m-card-title">
                    <div class="t">{{ art.name }}</div>
                    <div class="m-sub">{{ fmtSize(art.size_in_bytes) }} · {{ art.expired ? '已过期' : '有效' }}</div>
                  </div>
                  <van-button size="mini" type="primary" plain :loading="downloading === art.name" :disabled="art.expired" @click="downloadArtifact(art)">下载</van-button>
                </div>
              </div>
              <div class="m-section-title">Annotations（{{ annotations.length }}）</div>
              <van-empty v-if="annotations.length === 0" description="本次运行无检查注释" />
              <div v-for="(a, i) in annotations" :key="i" class="m-card">
                <div class="m-card-head">
                  <van-tag :type="a.item.annotation_level === 'failure' ? 'danger' : a.item.annotation_level === 'warning' ? 'warning' : 'default'">{{ levelText(a.item.annotation_level) }}</van-tag>
                  <div class="m-card-title">
                    <div class="t">{{ a.check }}</div>
                    <div class="m-sub">{{ a.item.path }}:{{ a.item.start_line }}</div>
                  </div>
                </div>
                <div class="ann-msg">{{ a.item.message }}</div>
              </div>
            </template>
            <div class="m-actions"><van-button block @click="closeRunResult">关闭</van-button></div>
          </div>
        </van-popup>

        <van-popup v-model:show="mPickerVisible" position="bottom" round>
          <van-picker :columns="mPickerColumns" @confirm="onMPickerConfirm" @cancel="mPickerVisible = false" />
        </van-popup>
      </template>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
    <template v-if="ctx">
      <el-tabs v-model="tab" class="action-tabs" @tab-change="onTabChange">
        <el-tab-pane label="Workflow工作流" name="workflows">
          <el-table :data="workflows" border stripe v-loading="loading">
            <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
            <el-table-column prop="name" label="工作流名称" min-width="160" />
            <el-table-column prop="path" label="文件路径" min-width="220">
              <template #default="{ row }"><span class="mono">{{ row.path }}</span></template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.state === 'active' ? 'success' : 'info'">
                  {{ row.state === 'active' ? '启用' : row.state }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="280">
              <template #default="{ row }">
                <el-button link type="primary" @click="openTrigger(row)">触发</el-button>
                <el-button link @click="viewRuns(row)">运行记录</el-button>
                <el-button link type="primary" @click="openEditor(row)">编辑YML</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="执行记录" name="runs">
          <div class="runs-toolbar">
            <el-select v-model="runFilterWorkflow" clearable placeholder="全部工作流" style="width: 220px" @change="loadRuns">
              <el-option v-for="w in workflows" :key="w.id" :label="w.name" :value="w.id" />
            </el-select>
            <el-button @click="loadRuns">刷新</el-button>
            <el-checkbox v-model="autoRefresh">自动刷新（运行中实时状态）</el-checkbox>
          </div>
          <el-table :data="runs" border stripe v-loading="runsLoading">
            <el-table-column v-if="settings.config.showRowIndex" type="index" label="#" width="55" />
            <el-table-column label="运行" min-width="200">
              <template #default="{ row }">
                <span class="mono">#{{ row.run_number }}</span> {{ row.display_title || row.name }}
              </template>
            </el-table-column>
            <el-table-column prop="branch" label="分支" width="140" />
            <el-table-column prop="event" label="触发方式" width="130" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="runTagType(row)">{{ runText(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="开始时间" width="170">
              <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="280">
              <template #default="{ row }">
                <el-button link type="primary" @click="openLogs(row)">日志</el-button>
                <el-button link type="primary" @click="openRunResult(row)">产物/结果</el-button>
                <el-button v-if="row.status !== 'completed'" link type="warning" @click="cancel(row)">取消</el-button>
                <el-button v-if="row.status === 'completed'" link @click="rerun(row)">重新运行</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="环境变量" name="vars">
          <div class="vars-toolbar">
            <el-button v-loading="varsLoading" @click="loadVars">刷新</el-button>
            <el-button type="primary" @click="openVarAdd">新增变量</el-button>
            <el-button type="primary" plain @click="openSecretAdd">新增密钥</el-button>
          </div>
          <div class="m-section-title">环境变量（Actions Variables）</div>
          <el-table :data="vars" border stripe v-loading="varsLoading">
            <el-table-column prop="name" label="名称" min-width="200"><template #default="{ row }"><span class="mono">{{ row.name }}</span></template></el-table-column>
            <el-table-column prop="value" label="值" min-width="200"><template #default="{ row }"><span class="mono">{{ row.value }}</span></template></el-table-column>
            <el-table-column prop="updated_at" label="更新时间" width="180">
              <template #default="{ row }">{{ new Date(row.updated_at).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button link type="primary" @click="openVarEdit(row)">编辑</el-button>
                <el-button link type="danger" @click="removeVariable(row.name)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="m-section-title">密钥（Secrets，值不可回读，保存前本地加密）</div>
          <el-table :data="secrets" border stripe v-loading="varsLoading">
            <el-table-column prop="name" label="名称" min-width="200"><template #default="{ row }"><span class="mono">{{ row.name }}</span></template></el-table-column>
            <el-table-column prop="updated_at" label="更新时间" width="180">
              <template #default="{ row }">{{ new Date(row.updated_at).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button link type="primary" @click="openSecretUpdate(row)">更新</el-button>
                <el-button link type="danger" @click="removeSecret(row.name)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </template>
    <el-empty v-else description="请先选择仓库" />

    <el-dialog v-model="vDialog" :title="vMode === 'var' ? (vEdit ? '编辑变量' : '新增变量') : (vEdit ? '更新密钥' : '新增密钥')" width="480px">
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="vForm.name" :disabled="vEdit" placeholder="如 MY_VAR" />
        </el-form-item>
        <el-form-item :label="vMode === 'var' ? '值' : '密钥值'" required>
          <el-input v-model="vForm.value" :type="vMode === 'var' ? 'text' : 'password'" :show-password="vMode === 'secret'" placeholder="如 abc_123" />
          <div v-if="vMode === 'secret'" class="form-tip">密钥将使用仓库公钥加密后写入，GitHub 无法回读明文</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="vDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitVForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="triggerVisible" title="手动触发流水线" width="440px">
      <el-form label-width="80px">
        <el-form-item label="工作流">
          <span>{{ triggerTarget?.name }}</span>
        </el-form-item>
        <el-form-item label="分支">
          <el-select v-model="triggerRef" filterable style="width: 100%">
            <el-option v-for="b in branchNames" :key="b" :label="b" :value="b" />
          </el-select>
        </el-form-item>
        <el-form-item v-for="inp in triggerInputs" :key="inp.id" :label="inputLabel(inp)">
          <el-input v-model="triggerVals[inp.id]" :placeholder="inp.description || inp.id" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="triggerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitTrigger">触发运行</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editorVisible" :title="`在线编辑 ${editorPath}`" width="760px" top="4vh">
      <el-input v-model="editorContent" type="textarea" :rows="22" class="yml-editor" spellcheck="false" />
      <el-input v-model="commitMessage" placeholder="提交信息（commit message）" style="margin-top: 10px" />
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveWorkflowYml">保存并提交到远程仓库</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="logsVisible" :title="`运行日志 #${logsRun?.run_number || ''}（实时流式）`" width="820px" top="4vh">
      <pre ref="logsRef" class="logs-box">{{ logsText || '等待日志输出...' }}</pre>
      <template #footer>
        <el-tag v-if="logsRunning" type="warning">运行中，每3秒自动刷新...</el-tag>
        <el-button @click="closeLogs">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resultVisible" :title="`产物 / 检查结果（运行 #${resultRun?.run_number || ''}）`" width="860px" top="6vh" v-loading="resultLoading">
      <div v-if="!resultLoading">
        <div class="m-section-title">Artifacts（构建产物）</div>
        <el-table :data="runArtifacts" border stripe size="small">
          <el-table-column prop="name" label="名称" min-width="220" />
          <el-table-column label="大小" width="110">
            <template #default="{ row }">{{ fmtSize(row.size_in_bytes) }}</template>
          </el-table-column>
          <el-table-column label="过期" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="row.expired ? 'info' : 'success'">{{ row.expired ? '已过期' : '有效' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="生成时间" width="180">
            <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="操作" width="110">
            <template #default="{ row }">
              <el-button link type="primary" :loading="downloading === row.name" :disabled="row.expired" @click="downloadArtifact(row)">下载</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="m-section-title">Annotations（检查注释）</div>
        <el-table :data="annotations" border stripe size="small">
          <el-table-column label="级别" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.item.annotation_level === 'failure' ? 'danger' : row.item.annotation_level === 'warning' ? 'warning' : 'info'">{{ levelText(row.item.annotation_level) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="check" label="检查项" min-width="140" />
          <el-table-column label="位置" width="160">
            <template #default="{ row }">{{ row.item.path }}:{{ row.item.start_line }}</template>
          </el-table-column>
          <el-table-column prop="item.message" label="内容" min-width="240"><template #default="{ row }"><div class="ann-msg">{{ row.item.message }}</div></template></el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="closeRunResult">关闭</el-button>
      </template>
    </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ActionManage' })
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useLogStore } from '@/stores/useLogStore'
import {
  listWorkflows,
  listRuns,
  triggerWorkflow,
  cancelRun,
  rerunRun,
  getRunLogs,
  listRunJobs,
  getWorkflowFileContent,
  saveWorkflowFile,
  parseWorkflowInputs,
  listRepoVariables,
  createRepoVariable,
  updateRepoVariable,
  deleteRepoVariable,
  listRepoSecrets,
  getSecretPublicKey,
  createOrUpdateSecret,
  deleteSecret,
  listRunArtifacts,
  downloadArtifactBlob,
  listRunCheckRuns,
  listCheckRunAnnotations
} from '@/api/githubAction'
import type { Workflow, WorkflowRun, RepoVariable, RepoSecret, RunArtifact, CheckRunAnnotation } from '@/api/githubAction'
import type { ApiResult } from '@/api/request'
import { getBranches } from '@/api/githubBranch'
import { base64ToUtf8 } from '@/utils/crypto'
import { blobDownload } from '@/utils/platform'
import { useIsMobile } from '@/utils/platform'

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const settings = useSettingsStore()
const logStore = useLogStore()
const isMobile = useIsMobile()

/* ---------- 移动端辅助 ---------- */
const wSheetVisible = ref(false)
const wSheetTarget = ref<Workflow | null>(null)
const mPickerVisible = ref(false)
const mPickerColumns = ref<{ text: string; value: string | number }[]>([])
let mPickerAction: 'branch' | 'runfilter' = 'branch'

const runFilterName = computed(() => {
  if (!runFilterWorkflow.value) return '全部工作流'
  return workflows.value.find(w => w.id === runFilterWorkflow.value)?.name || '已筛选'
})

const vars = ref<RepoVariable[]>([])
const secrets = ref<RepoSecret[]>([])
const varsLoading = ref(false)
const vDialog = ref(false)
const vEdit = ref(false)
const vMode = ref<'var' | 'secret'>('var')
const vForm = reactive({ name: '', value: '' })

async function loadVars() {
  if (!ctx.value || varsLoading.value) return
  varsLoading.value = true
  try {
    const pat = await withPat()
    const [vr, sr] = await Promise.all([
      listRepoVariables(pat, ctx.value.owner, ctx.value.repo),
      listRepoSecrets(pat, ctx.value.owner, ctx.value.repo)
    ])
    if (vr.code === 200) vars.value = vr.data?.variables || []
    else if (vr.code === 401 || vr.code === 403) ElMessage.error(`变量加载失败：${vr.msg}`)
    if (sr.code === 200) secrets.value = sr.data?.secrets || []
    else if (sr.code === 401 || sr.code === 403) ElMessage.error(`密钥加载失败：${sr.msg}`)
  } finally {
    varsLoading.value = false
  }
}

function openVarAdd() {
  vMode.value = 'var'
  vEdit.value = false
  vForm.name = ''
  vForm.value = ''
  vDialog.value = true
}

function openVarEdit(row: RepoVariable) {
  vMode.value = 'var'
  vEdit.value = true
  vForm.name = row.name
  vForm.value = row.value
  vDialog.value = true
}

function openSecretAdd() {
  vMode.value = 'secret'
  vEdit.value = false
  vForm.name = ''
  vForm.value = ''
  vDialog.value = true
}

function openSecretUpdate(row: RepoSecret) {
  vMode.value = 'secret'
  vEdit.value = true
  vForm.name = row.name
  vForm.value = ''
  vDialog.value = true
}

async function submitVForm() {
  if (!ctx.value) return
  const name = vForm.name.trim()
  if (!name) return ElMessage.warning('请输入名称')
  if (!vForm.value.trim()) return ElMessage.warning('请输入值')
  saving.value = true
  const pat = await withPat()
  let res: ApiResult
  if (vMode.value === 'var') {
    res = vEdit.value
      ? await updateRepoVariable(pat, ctx.value.owner, ctx.value.repo, name, vForm.value.trim())
      : await createRepoVariable(pat, ctx.value.owner, ctx.value.repo, name, vForm.value.trim())
  } else {
    const pk = await getSecretPublicKey(pat, ctx.value.owner, ctx.value.repo)
    if (pk.code !== 200 || !pk.data) {
      saving.value = false
      return ElMessage.error(`获取加密公钥失败：${pk.msg}`)
    }
    res = await createOrUpdateSecret(pat, ctx.value.owner, ctx.value.repo, name, vForm.value.trim(), pk.data)
  }
  saving.value = false
  if (res.code === 200 || res.code === 201 || res.code === 204) {
    ElMessage.success(vMode.value === 'var' ? '变量已保存' : '密钥已保存')
    logStore.write({ module: 'action', action: vMode.value === 'var' ? '保存环境变量' : '保存密钥', detail: `${name} @ ${ctx.value.owner}/${ctx.value.repo}` })
    vDialog.value = false
    loadVars()
  } else {
    ElMessage.error(`保存失败：${res.msg}`)
  }
}

async function removeVariable(name: string) {
  if (!ctx.value) return
  try {
    await ElMessageBox.confirm(`确认删除环境变量「${name}」？`, '确认删除', { type: 'warning' })
  } catch {
    return
  }
  const pat = await withPat()
  const res = await deleteRepoVariable(pat, ctx.value.owner, ctx.value.repo, name)
  if (res.code === 204 || res.code === 200) {
    ElMessage.success('已删除')
    loadVars()
  } else ElMessage.error(`删除失败：${res.msg}`)
}

async function removeSecret(name: string) {
  if (!ctx.value) return
  try {
    await ElMessageBox.confirm(`确认删除密钥「${name}」？`, '确认删除', { type: 'warning' })
  } catch {
    return
  }
  const pat = await withPat()
  const res = await deleteSecret(pat, ctx.value.owner, ctx.value.repo, name)
  if (res.code === 204 || res.code === 200) {
    ElMessage.success('已删除')
    loadVars()
  } else ElMessage.error(`删除失败：${res.msg}`)
}

function onTabChange(name: string) {
  if (name === 'vars') loadVars()
  else if (name === 'runs') loadRuns()
}

function onMTab(index: number) {
  tab.value = index === 0 ? 'workflows' : index === 1 ? 'runs' : 'vars'
  if (tab.value === 'runs') loadRuns()
  else if (tab.value === 'vars') loadVars()
}

function openWSheet(w: Workflow) {
  wSheetTarget.value = w
  wSheetVisible.value = true
}

function onWSelect(action: { name: string }) {
  const w = wSheetTarget.value
  if (!w) return
  if (action.name === '手动触发') openTrigger(w)
  else if (action.name === '查看运行记录') viewRuns(w)
  else openEditor(w)
}

function openBranchPicker() {
  mPickerAction = 'branch'
  mPickerColumns.value = branchNames.value.map(b => ({ text: b, value: b }))
  mPickerVisible.value = true
}

function openRunFilter() {
  mPickerAction = 'runfilter'
  mPickerColumns.value = [{ text: '全部工作流', value: 0 }, ...workflows.value.map(w => ({ text: w.name, value: w.id }))]
  mPickerVisible.value = true
}

function onMPickerConfirm(payload: { selectedValues: (string | number)[] }) {
  const v = payload.selectedValues[0]
  if (mPickerAction === 'branch') triggerRef.value = String(v)
  else {
    runFilterWorkflow.value = Number(v) || undefined
    loadRuns()
  }
  mPickerVisible.value = false
}

const ctx = computed(() => repoStore.currentOwnerName())
const tab = ref('workflows')
const loading = ref(false)
const runsLoading = ref(false)
const saving = ref(false)

const workflows = ref<Workflow[]>([])
const runs = ref<WorkflowRun[]>([])
const runFilterWorkflow = ref<number | undefined>(undefined)
const autoRefresh = ref(false)
const branchNames = ref<string[]>([])

const triggerVisible = ref(false)
const triggerTarget = ref<Workflow | null>(null)
const triggerRef = ref('')
const triggerInputs = ref<ReturnType<typeof parseWorkflowInputs>>([])
const triggerVals = reactive<Record<string, string>>({})

function inputLabel(inp: (typeof triggerInputs.value)[number]) {
  const id = inp.id.toLowerCase()
  return id.includes('version') || id === 'tag' || id.includes('发布') ? '发布tag' : inp.id
}

const editorVisible = ref(false)
const editorPath = ref('')
const editorSha = ref('')
const editorWorkflowId = ref(0)
const editorContent = ref('')
const commitMessage = ref('Update workflow')

const logsVisible = ref(false)
const logsRun = ref<WorkflowRun | null>(null)
const logsText = ref('')
const logsRunning = ref(false)
const logsRef = ref<HTMLElement>()
let logsTimer: number | undefined
let refreshTimer: number | undefined

async function withPat() {
  return await accountStore.getPat(repoStore.currentAccountId)
}

async function loadWorkflows() {
  if (!ctx.value) return
  loading.value = true
  const pat = await withPat()
  const res = await listWorkflows(pat, ctx.value.owner, ctx.value.repo)
  loading.value = false
  if (res.code === 200) workflows.value = res.data?.workflows || []
  else ElMessage.error(`工作流加载失败：${res.msg}`)
  const bres = await getBranches(pat, ctx.value.owner, ctx.value.repo)
  if (bres.code === 200) branchNames.value = (bres.data || []).map(b => b.name)
}

async function loadRuns() {
  if (!ctx.value) return
  runsLoading.value = true
  const pat = await withPat()
  const res = await listRuns(pat, ctx.value.owner, ctx.value.repo, runFilterWorkflow.value)
  runsLoading.value = false
  if (res.code === 200) runs.value = res.data?.workflow_runs || []
  else ElMessage.error(`运行记录加载失败：${res.msg}`)
}

function runTagType(row: WorkflowRun) {
  if (row.status === 'in_progress' || row.status === 'queued') return 'warning'
  if (row.conclusion === 'success') return 'success'
  if (row.conclusion === 'cancelled') return 'info'
  return 'danger'
}

function runText(row: WorkflowRun) {
  if (row.status === 'in_progress') return '运行中'
  if (row.status === 'queued') return '排队中'
  if (row.status === 'completed') {
    return ({ success: '成功', failure: '失败', cancelled: '取消', skipped: '跳过', neutral: '无结果', timed_out: '超时', action_required: '需处理' } as Record<string, string>)[row.conclusion || ''] || row.conclusion
  }
  return row.status
}

function fmtSize(bytes: number) {
  if (!bytes && bytes !== 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function levelText(level: string) {
  return ({ failure: '失败', warning: '警告', notice: '提示' } as Record<string, string>)[level] || level
}

function viewRuns(w: Workflow) {
  runFilterWorkflow.value = w.id
  tab.value = 'runs'
  loadRuns()
}

async function openTrigger(w: Workflow) {
  if (!ctx.value) return
  triggerTarget.value = w
  triggerRef.value = repoStore.currentRepo?.default_branch || branchNames.value[0] || 'main'
  triggerInputs.value = []
  Object.keys(triggerVals).forEach(k => delete triggerVals[k])
  triggerVisible.value = true
  const pat = await withPat()
  const fc = await getWorkflowFileContent(pat, ctx.value.owner, ctx.value.repo, w.path, triggerRef.value)
  if (fc.code === 200 && fc.data?.content) {
    triggerInputs.value = parseWorkflowInputs(base64ToUtf8(fc.data.content))
    for (const inp of triggerInputs.value) triggerVals[inp.id] = inp.default || ''
  }
}

async function submitTrigger() {
  if (!ctx.value || !triggerTarget.value) return
  saving.value = true
  const pat = await withPat()
  const inputs: Record<string, string> = {}
  for (const inp of triggerInputs.value) inputs[inp.id] = (triggerVals[inp.id] ?? '').trim()
  const res = await triggerWorkflow(pat, ctx.value.owner, ctx.value.repo, triggerTarget.value.id, triggerRef.value, inputs)
  saving.value = false
  if (res.code === 200 || res.code === 202) {
    ElMessage.success('流水线已触发（若失败请确认该Workflow是否支持 workflow_dispatch 事件）')
    logStore.write({ module: 'action', action: '触发流水线', detail: `${triggerTarget.value.name} @ ${triggerRef.value}`, level: 'warning' })
    triggerVisible.value = false
    tab.value = 'runs'
    loadRuns()
  } else {
    ElMessage.error(`触发失败：${res.msg}`)
  }
}

const resultVisible = ref(false)
const resultRun = ref<WorkflowRun | null>(null)
const resultLoading = ref(false)
const runArtifacts = ref<RunArtifact[]>([])
const annotations = ref<{ check: string; item: CheckRunAnnotation }[]>([])
const downloading = ref<string>('')

async function openRunResult(row: WorkflowRun) {
  if (!ctx.value) return
  resultRun.value = row
  resultVisible.value = true
  runArtifacts.value = []
  annotations.value = []
  resultLoading.value = true
  const pat = await withPat()
  const [ar, jr] = await Promise.all([
    listRunArtifacts(pat, ctx.value.owner, ctx.value.repo, row.id),
    listRunJobs(pat, ctx.value.owner, ctx.value.repo, row.id)
  ])
  if (ar.code === 200) runArtifacts.value = ar.data?.artifacts || []
  const anns: { check: string; item: CheckRunAnnotation }[] = []
  if (jr.code === 200 && jr.data) {
    for (const job of jr.data.jobs) {
      const m = job.check_run_url?.match(/\/check-runs\/(\d+)\/?$/)
      if (!m) continue
      const aRes = await listCheckRunAnnotations(pat, ctx.value.owner, ctx.value.repo, Number(m[1]))
      if (aRes.code === 200 && aRes.data) {
        for (const a of aRes.data) anns.push({ check: `${job.name}（${job.status}${job.conclusion ? '/' + job.conclusion : ''}）`, item: a })
      }
    }
  }
  annotations.value = anns
  resultLoading.value = false
}

async function downloadArtifact(art: RunArtifact) {
  if (!ctx.value || downloading.value) return
  downloading.value = art.name
  try {
    const pat = await withPat()
    const res = await downloadArtifactBlob(pat, art.archive_download_url)
    if (res.code === 200 && res.data) {
      blobDownload(res.data, `${art.name}.zip`)
      logStore.write({ module: 'action', action: '下载Artifact', detail: `${art.name} @ #${resultRun.value?.run_number || ''}` })
    } else {
      ElMessage.error(`下载失败：${res.msg}`)
    }
  } finally {
    downloading.value = ''
  }
}

function closeRunResult() {
  resultVisible.value = false
  resultRun.value = null
}

async function cancel(row: WorkflowRun) {
  if (!ctx.value) return
  try {
    await ElMessageBox.confirm(`确认取消运行 #${row.run_number}？`, '二次确认', { type: 'warning' })
  } catch {
    return
  }
  const pat = await withPat()
  const res = await cancelRun(pat, ctx.value.owner, ctx.value.repo, row.id)
  if (res.code === 202) {
    ElMessage.success('已提交取消请求')
    logStore.write({ module: 'action', action: '取消流水线', detail: `#${row.run_number} ${row.display_title || row.name}`, level: 'warning' })
    loadRuns()
  } else {
    ElMessage.error(`取消失败：${res.msg}`)
  }
}

async function rerun(row: WorkflowRun) {
  if (!ctx.value) return
  const pat = await withPat()
  const res = await rerunRun(pat, ctx.value.owner, ctx.value.repo, row.id)
  if (res.code === 201 || res.code === 200) {
    ElMessage.success('已重新运行')
    logStore.write({ module: 'action', action: '重新运行流水线', detail: `#${row.run_number} ${row.display_title || row.name}`, level: 'warning' })
    loadRuns()
  } else {
    ElMessage.error(`重跑失败：${res.msg}`)
  }
}

/* 实时流式日志：轮询拉取合并 Job 日志 */
async function openLogs(row: WorkflowRun) {
  logsRun.value = row
  logsText.value = ''
  logsVisible.value = true
  logsRunning.value = true
  await pullLogs()
  logsTimer = window.setInterval(pullLogs, 3000)
}

async function pullLogs() {
  if (!ctx.value || !logsRun.value) return
  const pat = await withPat()
  const res = await getRunLogs(pat, ctx.value.owner, ctx.value.repo, logsRun.value.id)
  if (res.code === 200) {
    logsText.value = res.data || ''
    nextTick(() => {
      if (logsRef.value) logsRef.value.scrollTop = logsRef.value.scrollHeight
    })
  }
  const runRes = await listRuns(pat, ctx.value.owner, ctx.value.repo, undefined)
  if (runRes.code === 200) {
    const cur = (runRes.data?.workflow_runs || []).find(r => r.id === logsRun.value?.id)
    if (cur) {
      logsRun.value = cur
      logsRunning.value = cur.status !== 'completed'
      if (cur.status === 'completed' && logsTimer) {
        window.clearInterval(logsTimer)
        logsTimer = undefined
      }
    }
  }
}

function closeLogs() {
  logsVisible.value = false
  if (logsTimer) {
    window.clearInterval(logsTimer)
    logsTimer = undefined
  }
}

/* 在线编辑 Workflow yml */
async function openEditor(w: Workflow) {
  if (!ctx.value) return
  const pat = await withPat()
  const res = await getWorkflowFileContent(pat, ctx.value.owner, ctx.value.repo, w.path, repoStore.currentRepo?.default_branch || 'main')
  if (res.code !== 200 || !res.data) {
    ElMessage.error(`读取失败：${res.msg}`)
    return
  }
  editorWorkflowId.value = w.id
  editorPath.value = w.path
  editorSha.value = res.data.sha
  editorContent.value = res.data.content ? base64ToUtf8(res.data.content) : ''
  commitMessage.value = `Update ${w.path}`
  editorVisible.value = true
}

async function saveWorkflowYml() {
  if (!ctx.value) return
  if (!commitMessage.value.trim()) {
    ElMessage.warning('请输入提交信息')
    return
  }
  saving.value = true
  const pat = await withPat()
  const res = await saveWorkflowFile(
    pat,
    ctx.value.owner,
    ctx.value.repo,
    editorPath.value,
    editorContent.value,
    editorSha.value,
    commitMessage.value.trim(),
    repoStore.currentRepo?.default_branch || 'main'
  )
  saving.value = false
  if (res.code === 200) {
    ElMessage.success('Workflow 已保存并直接提交到远程仓库')
    logStore.write({ module: 'action', action: '保存Workflow文件', detail: `${ctx.value.owner}/${ctx.value.repo} ${editorPath.value}`, level: 'warning' })
    editorVisible.value = false
    loadWorkflows()
  } else {
    ElMessage.error(`保存失败：${res.msg}`)
  }
}

watch(autoRefresh, v => {
  if (v) refreshTimer = window.setInterval(loadRuns, 5000)
  else if (refreshTimer) window.clearInterval(refreshTimer)
})

watch(() => [repoStore.currentRepoFullName, repoStore.currentRepo?.id, accountStore.activeId], () => {
  loadWorkflows()
  loadRuns()
  if (tab.value === 'vars') loadVars()
})

onMounted(() => {
  loadWorkflows()
  loadRuns()
})
onBeforeUnmount(() => {
  closeLogs()
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<style scoped>
.mono {
  font-family: Consolas, monospace;
}
.action-tabs {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 14px;
}
.runs-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.vars-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.ann-msg {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
  white-space: pre-wrap;
  word-break: break-word;
}
.form-tip {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 20px;
}
.logs-box {
  background: #0d1117;
  color: #c9d1d9;
  padding: 12px;
  border-radius: 6px;
  height: 56vh;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
:deep(.yml-editor textarea) {
  font-family: Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}
</style>
