<template>
  <!-- 桌面形态（Element Plus） -->
  <el-dialog v-if="!isMobile" v-model="visible" title="打开GitHub链接" width="560px">
    <el-input v-model="urlText" placeholder="粘贴 GitHub 链接，如 https://github.com/owner/repo/issues/1" clearable @keyup.enter="open" />
    <div class="ol-tip">
      <template v-if="link">
        <el-tag size="small" :type="routeTarget ? 'success' : 'warning'">{{ LINK_KIND_LABELS[link.kind] }}</el-tag>
        <span class="ol-target">{{ linkSummary(link) }}</span>
      </template>
      <span v-else-if="urlText.trim()" class="ol-err">无法识别，仅支持 github.com 的仓库/Issue/PR/提交/文件/Release/Action 链接</span>
      <span v-else>支持类型：仓库、Issue、Pull Request、提交、文件/目录、Release、Action 运行记录；账号外的公开仓库会自动接入，可在「仓库列表」中查看（标记为外部）并移除</span>
    </div>
    <template #footer>
      <el-button @click="paste">粘贴</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="opening" :disabled="!link || !routeTarget" @click="open">打开</el-button>
    </template>
  </el-dialog>

  <!-- 移动端形态（Vant） -->
  <van-popup v-else v-model:show="visible" position="bottom" round>
    <div class="m-popup">
      <div class="m-popup-title">打开GitHub链接</div>
      <van-field v-model="urlText" placeholder="粘贴 GitHub 链接" clearable />
      <div class="ol-tip">
        <template v-if="link">
          <van-tag :type="routeTarget ? 'success' : 'warning'">{{ LINK_KIND_LABELS[link.kind] }}</van-tag>
          <span class="ol-target">{{ linkSummary(link) }}</span>
        </template>
        <span v-else-if="urlText.trim()" class="ol-err">无法识别，仅支持 github.com 的仓库/Issue/PR/提交/文件/Release/Action 链接</span>
        <span v-else>支持类型：仓库、Issue、Pull Request、提交、文件/目录、Release、Action 运行记录</span>
      </div>
      <div class="m-actions">
        <van-button size="small" @click="paste">粘贴</van-button>
        <van-button size="small" type="primary" :loading="opening" :disabled="!link || !routeTarget" @click="open">打开</van-button>
        <van-button size="small" @click="visible = false">取消</van-button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
defineOptions({ name: 'OpenLinkDialog' })
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useRepoStore } from '@/stores/useRepoStore'
import { useLogStore } from '@/stores/useLogStore'
import { useIsMobile } from '@/utils/platform'
import { parseGitHubUrl, linkRoute, linkSummary, LINK_KIND_LABELS } from '@/utils/githubUrl'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const router = useRouter()
const repoStore = useRepoStore()
const logStore = useLogStore()
const isMobile = useIsMobile()

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const urlText = ref('')
const opening = ref(false)
const link = computed(() => parseGitHubUrl(urlText.value))
const routeTarget = computed(() => (link.value ? linkRoute(link.value) : null))

watch(visible, v => {
  if (!v) urlText.value = ''
})

function paste() {
  if (!navigator.clipboard?.readText) {
    ElMessage.warning('当前环境不支持读取剪贴板，请手动粘贴')
    return
  }
  navigator.clipboard
    .readText()
    .then(t => {
      if (t) urlText.value = t.trim()
    })
    .catch(() => ElMessage.warning('读取剪贴板失败，请手动粘贴'))
}

async function open() {
  const l = link.value
  const target = routeTarget.value
  if (!l || !target) {
    ElMessage.warning('无法识别该链接')
    return
  }
  opening.value = true
  try {
    if (l.kind !== 'user' && l.fullName !== repoStore.currentRepoFullName) {
      const ownerId = repoStore.findAccountIdByRepo(l.fullName)
      if (ownerId) repoStore.selectRepo(l.fullName)
      else {
        const ok = await repoStore.openExternalRepo(l.owner, l.repo)
        if (!ok) return
      }
    }
    visible.value = false
    await router.push(target)
    await logStore.write({ module: 'repo', action: '打开链接', detail: urlText.value.trim() })
  } finally {
    opening.value = false
  }
}
</script>

<style scoped>
.ol-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  min-height: 24px;
  font-size: 12px;
  color: var(--text-secondary);
}
.ol-target {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ol-err {
  color: var(--el-color-danger, #f56c6c);
}
</style>
