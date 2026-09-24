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
          <span v-if="showMdToggle" class="sp-mode">
            <el-button
              link
              :type="mdView === 'render' ? 'primary' : 'default'"
              :class="{ active: mdView === 'render' }"
              @click="mdView = 'render'"
            >渲染</el-button>
            <el-button
              link
              :type="mdView === 'source' ? 'primary' : 'default'"
              :class="{ active: mdView === 'source' }"
              @click="mdView = 'source'"
            >源码</el-button>
          </span>
          <el-button v-if="!loading && kind === 'text'" link type="primary" @click="copyContent">复制内容</el-button>
          <el-button link type="primary" @click="fullscreen = !fullscreen">{{ fullscreen ? '退出全屏' : '全屏' }}</el-button>
          <el-button link @click="close">关闭</el-button>
        </span>
      </div>
    </template>
    <div v-if="loading" class="sp-loading"><el-icon class="is-loading"><Loading /></el-icon> 正在加载源文件...</div>
    <div v-else-if="kind === 'image' && image" class="sp-img"><img :src="image" alt="preview" /></div>
    <div v-else-if="showMdRender" class="sp-md">
      <MdRender :source="content" empty-text="（文件为空）" />
    </div>
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
        <van-button
          v-if="showMdToggle"
          size="mini"
          :type="mdView === 'render' ? 'primary' : 'default'"
          plain
          @click="mdView = mdView === 'render' ? 'source' : 'render'"
        >{{ mdView === 'render' ? '源码' : '渲染' }}</van-button>
        <van-button v-if="!loading && kind === 'text'" size="mini" plain @click="copyContent">复制</van-button>
        <van-button size="mini" plain @click="fullscreen = !fullscreen">{{ fullscreen ? '退出全屏' : '全屏' }}</van-button>
      </div>
      <div v-if="loading" class="sp-loading-m"><van-loading /></div>
      <div v-else-if="kind === 'image' && image" class="sp-img-m"><img :src="image" alt="preview" /></div>
      <div v-else-if="showMdRender" class="sp-md-m">
        <MdRender :source="content" empty-text="（文件为空）" />
      </div>
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

/** 是否 Markdown 文件（支持「源码 / 渲染」双视图） */
export function isMarkdownFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return ext === 'md' || ext === 'markdown' || ext === 'mdown' || ext === 'mkd'
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
import MdRender from './MdRender.vue'

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
/** Markdown 视图：渲染（默认）/ 源码 */
const mdView = ref<'render' | 'source'>('render')

const isMarkdown = computed(() => isMarkdownFile(props.filename))
/** 是否展示「渲染 / 源码」切换（仅 Markdown 文本） */
const showMdToggle = computed(() => isMarkdown.value && !loading.value && kind.value === 'text')
/** 是否以渲染视图展示 */
const showMdRender = computed(() => showMdToggle.value && mdView.value === 'render')

watch(
  () => [props.modelValue, props.filename] as const,
  async ([visible, filename]) => {
    if (!visible) return
    loading.value = true
    kind.value = 'text'
    content.value = ''
    image.value = ''
    mdView.value = 'render'
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

function copyContent() {
  if (!content.value) {
    ElMessage.warning('内容为空，无法复制')
    return
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(content.value).then(
      () => ElMessage.success('已复制文件内容'),
      () => ElMessage.warning('复制失败，请手动复制')
    )
  } else {
    ElMessage.warning('复制失败，请手动复制')
  }
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
.sp-mode {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0 4px;
  margin-right: 6px;
}
.sp-mode .el-button.active {
  font-weight: 700;
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
.sp-md {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 14px 16px;
  height: 60vh;
  overflow: auto;
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
.sp-md-m {
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px 14px;
  height: 60vh;
  overflow: auto;
}
</style>