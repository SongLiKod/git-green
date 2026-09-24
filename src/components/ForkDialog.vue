<template>
  <!-- 桌面形态（Element Plus） -->
  <el-dialog v-if="!isMobile" v-model="visible" :title="`Fork ${repo?.full_name || ''}`" width="500px">
    <el-form label-width="96px">
      <el-form-item label="目标账号" required>
        <el-select v-model="form.accountId" style="width: 100%" placeholder="选择接收 Fork 的账号">
          <el-option
            v-for="a in accountStore.accounts"
            :key="a.id"
            :label="a.remark ? `${a.remark}（${a.username}）` : a.username"
            :value="a.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="仓库名">
        <el-input v-model="form.name" :placeholder="repo?.name || 'my-repo'" />
      </el-form-item>
      <el-form-item v-if="orgs.length" label="Fork 到组织">
        <el-select v-model="form.organization" clearable placeholder="留空 = Fork 到个人账号" style="width: 100%">
          <el-option v-for="o in orgs" :key="o" :label="o" :value="o" />
        </el-select>
      </el-form-item>
      <el-form-item label="仅默认分支">
        <el-switch v-model="form.defaultBranchOnly" />
      </el-form-item>
    </el-form>
    <el-alert type="info" :closable="false" show-icon title="Fork 为 GitHub 异步操作，创建后会自动轮询就绪并选中新仓库">
      <template #default>
        私有源仓库 Fork 受目标账号套餐与 PAT 权限限制；源仓库管理员禁止 Fork 时会返回 403/404。
      </template>
    </el-alert>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">确认 Fork</el-button>
    </template>
  </el-dialog>

  <!-- 移动端形态（Vant） -->
  <van-popup v-else v-model:show="visible" position="bottom" round>
    <div class="m-popup">
      <div class="m-popup-title">Fork {{ repo?.name || '' }}</div>
      <van-cell-group inset>
        <van-field label="目标账号" readonly is-link :value="targetAccountLabel" @click="pickAccount = true" />
        <van-field v-model="form.name" label="仓库名" :placeholder="repo?.name || 'my-repo'" />
        <van-field
          v-if="orgs.length"
          label="Fork 到组织"
          readonly
          is-link
          :value="form.organization || '留空 = 个人账号'"
          @click="pickOrg = true"
        />
        <van-cell title="仅默认分支">
          <template #value><van-switch v-model="form.defaultBranchOnly" size="20" /></template>
        </van-cell>
      </van-cell-group>
      <div class="fork-tip">Fork 为 GitHub 异步操作，创建后自动等待就绪并选中新仓库</div>
      <van-button block type="primary" style="margin-top: 12px" :loading="submitting" @click="submit">确认 Fork</van-button>
    </div>

    <van-popup v-model:show="pickAccount" position="bottom" round>
      <van-picker :columns="accountColumns" @confirm="onAccountConfirm" @cancel="pickAccount = false" />
    </van-popup>
    <van-popup v-model:show="pickOrg" position="bottom" round>
      <van-picker :columns="orgColumns" @confirm="onOrgConfirm" @cancel="pickOrg = false" />
    </van-popup>
  </van-popup>
</template>

<script setup lang="ts">
defineOptions({ name: 'ForkDialog' })
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { getMyOrgs } from '@/api/githubFork'
import type { GitHubRepo } from '@/api/githubRepo'
import { useIsMobile } from '@/utils/platform'

const props = defineProps<{
  modelValue: boolean
  repo: GitHubRepo | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'created', fullName: string): void
}>()

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const isMobile = useIsMobile()

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const form = reactive({ accountId: '', name: '', organization: '', defaultBranchOnly: false })
const orgs = ref<string[]>([])
const submitting = ref(false)
const pickAccount = ref(false)
const pickOrg = ref(false)

const targetAccountLabel = computed(() => {
  const a = accountStore.accounts.find(x => x.id === form.accountId)
  return a ? a.username : '选择账号'
})
const accountColumns = computed(() =>
  accountStore.accounts.map(a => ({ text: a.remark ? `${a.remark}（${a.username}）` : a.username, value: a.id }))
)
const orgColumns = computed(() => [{ text: '个人账号（不选组织）', value: '' }, ...orgs.value.map(o => ({ text: o, value: o }))])

function onAccountConfirm({ selectedValues }: { selectedValues: string[] }) {
  form.accountId = selectedValues[0] || ''
  pickAccount.value = false
}
function onOrgConfirm({ selectedValues }: { selectedValues: string[] }) {
  form.organization = selectedValues[0] || ''
  pickOrg.value = false
}

watch(visible, async v => {
  if (!v) return
  form.name = ''
  form.organization = ''
  form.defaultBranchOnly = false
  // 默认选中当前账号
  form.accountId = repoStore.currentAccountId || accountStore.activeId || accountStore.accounts[0]?.id || ''
  // 懒加载组织列表（失败静默：非组织用户无影响）
  orgs.value = []
  const pat = await accountStore.getPat(form.accountId)
  if (!pat) return
  const res = await getMyOrgs(pat)
  if (res.code === 200) orgs.value = res.data || []
})

async function submit() {
  if (!props.repo) return
  if (!form.accountId) {
    ElMessage.warning('请选择目标账号')
    return
  }
  submitting.value = true
  try {
    const fullName = await repoStore.forkRepo({
      sourceOwner: props.repo.owner.login,
      sourceRepo: props.repo.name,
      accountId: form.accountId,
      name: form.name.trim(),
      organization: form.organization,
      defaultBranchOnly: form.defaultBranchOnly
    })
    if (fullName) {
      visible.value = false
      emit('created', fullName)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.fork-tip {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 18px;
  margin: 10px 16px 0;
}
</style>
