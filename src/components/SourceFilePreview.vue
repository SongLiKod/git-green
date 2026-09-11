<template>
  <!-- 桌面形态（Element Plus） -->
  <el-dialog
    v-if="!isMobile"
    v-model="dialogVisible"
    width="760px"
    top="4vh"
    class="source-preview-dialog"
    :fullscreen="fullscreen"
    :show-close="false"
  >
    <template #header>
      <div class="sp-header">
        <span class="sp-title">源文件预览 {{ filename }}</span>
        <span class="sp-ops">
          <el-button link type="primary" @click="fullscreen = !fullscreen">{{ fullscreen ? '退出全屏' : '全屏' }}</el-button>
          <el-button link @click="close">关闭</el-button>
        </span>
      </div>
    </template>
    <div v-if="loading" class="sp-loading"><el-icon class="is-loading"><Loading /></el-icon> 正在加载源文件...</div>
    <div v-else-if="kind === 'image' && image" class="sp-img"><img :src="image" alt="preview" /></div>
    <pre v-else class="sp-code">{{ content || '（无法预览或文件为空）' }}</pre>
    <template #footer>
      <el-button @click="close">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 移动端形态（Vant） -->
  <van-popup v-else v-model:show="dialogVisible" position="bottom" round :style="{ height: fullscreen ? '100%' : '86%' }">
    <div class="sp-m-popup">
      <div class="sp-m-title-row">
        <span class="sp-m-title">源文件预览 {{ filename }}</span>
        <van-button size="mini" plain @click="fullscreen = !fullscreen">{{ fullscreen ? '退出全屏' : '全屏' }}</van-button>
      </div>
      <div v-if="loading" class="sp-loading-m"><van-loading /></div>
      <div v-else-if="kind === 'image' && image" class="sp-img-m"><img :src="image" alt="preview" /></div>
      <pre v-else class="sp-code-m">{{ content || '（无法预览或文件为空）' }}</pre>
      <van-button block style="margin-top: 10px" @click="close">关闭</van-button>
    </div>
  </van-popup>
</template>

<script lang="ts">
import { getFileContent, getFileRaw, getFileBlob } from '@/api/githubFile'

export interface PreviewResult {
  kind: 'text' | 'image'
  content?: string
  image?: string
}

export const IMAGE_MIMES: Record<string, string> = {
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

export function imageMime(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return IMAGE_MIMES[ext] || null
}

/** 按指定 ref（分支名或SHA）读取源文件内容（文本/图片） */
export async function loadSourcePreview(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<PreviewResult> {
  const mime = imageMime(path)
  if (!mime) {
    const res = await getFileContent(token, owner, repo, path, ref)
    if (res.code !== 200 || !res.data) throw new Error(res.msg || '读取失败')
    return { kind: 'text', content: res.data.content }
  }
  const raw = await getFileRaw(token, owner, repo, path, ref)
  if (raw.code !== 200 || !raw.data) throw new Error(raw.msg || '读取失败')
  if (raw.data.base64) return { kind: 'image', image: `data:${mime};base64,${raw.data.base64}` }
  const blobRes = await getFileBlob(token, raw.data.downloadUrl)
  if (blobRes.code === 200 && blobRes.data) return { kind: 'image', image: URL.createObjectURL(blobRes.data) }
  throw new Error('图片读取失败')
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useIsMobile } from '@/utils/platform'

const props = defineProps<{
  modelValue: boolean
  filename: string
  load: (filename: string) => Promise<PreviewResult>
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const isMobile = useIsMobile()
const dialogVisible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const loading = ref(false)
const kind = ref<'text' | 'image'>('text')
const content = ref('')
const image = ref('')
const fullscreen = ref(false)

watch(
  () => [props.modelValue, props.filename] as const,
  async ([visible, filename]) => {
    if (!visible) return
    loading.value = true
    kind.value = 'text'
    content.value = ''
    image.value = ''
    try {
      const r = await props.load(filename)
      kind.value = r.kind
      content.value = r.content || ''
      image.value = r.image || ''
    } catch (e: any) {
      ElMessage.error(String(e?.message || e))
    } finally {
      loading.value = false
    }
  }
)

function close() {
  dialogVisible.value = false
}
</script>

<style scoped>
.sp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sp-title {
  font-size: 14px;
  font-weight: 600;
}
.sp-ops {
  display: flex;
  flex: none;
}
.sp-loading {
  text-align: center;
  padding: 30px;
}
.sp-img {
  text-align: center;
}
.sp-img img {
  max-width: 100%;
  max-height: 75vh;
}
.sp-code {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  height: 60vh;
  overflow: auto;
  font-family: Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.sp-m-popup {
  padding: 16px;
}
.sp-m-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.sp-m-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp-loading-m {
  text-align: center;
  padding: 30px;
}
.sp-img-m {
  text-align: center;
}
.sp-img-m img {
  max-width: 100%;
}
.sp-code-m {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  height: 60vh;
  overflow: auto;
  font-family: Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>