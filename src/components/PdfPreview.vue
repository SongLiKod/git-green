<template>
  <div class="pdf-preview">
    <div class="pdf-toolbar">
      <div class="pdf-group">
        <button class="pdf-btn" :disabled="page <= 1" @click="goPage(page - 1)">‹ 上一页</button>
        <input
          class="pdf-page-input"
          type="number"
          min="1"
          :max="pageCount || 1"
          :value="page"
          @change="onJumpInput"
        />
        <span class="pdf-meta">/ {{ pageCount || '–' }} 页</span>
        <button class="pdf-btn" :disabled="!pageCount || page >= pageCount" @click="goPage(page + 1)">下一页 ›</button>
      </div>
      <div class="pdf-group">
        <button class="pdf-btn" :disabled="scale <= 0.3" @click="zoom(-0.25)">－</button>
        <span class="pdf-meta">{{ Math.round(scale * 100) }}%</span>
        <button class="pdf-btn" :disabled="scale >= 5" @click="zoom(0.25)">＋</button>
        <button class="pdf-btn" @click="fitWidth">适合宽度</button>
      </div>
      <span class="pdf-status">{{ statusText }}</span>
    </div>

    <div ref="scrollerEl" class="pdf-scroller" @scroll.passive="onScroll">
      <div v-if="error" class="pdf-tip">
        <p>{{ error }}</p>
        <button class="pdf-btn" @click="reload">重试</button>
      </div>
      <div v-else-if="pageCount" class="pdf-pages">
        <div
          v-for="n in pageCount"
          :key="n"
          :ref="el => setPageEl(n, el)"
          :data-page="n"
          class="pdf-page"
          :style="pageStyle(n)"
        >
          <canvas :ref="el => setCanvasEl(n, el)"></canvas>
        </div>
      </div>
      <div v-else class="pdf-tip">正在解析 PDF…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'

defineOptions({ name: 'PdfPreview' })

const props = defineProps<{
  /** PDF 地址：blob:（本地字节）或 https:（远程直连） */
  src: string
  /** 远程地址附带的请求头（私有仓库 Token） */
  headers?: Record<string, string>
}>()
const emit = defineEmits<{ (e: 'error', msg: string): void }>()

/** 内存保护：同时保留的已渲染页上限，超出后淘汰离当前页最远、且已滚出预渲染区的页 */
const MAX_RENDERED = 10
/** 上下各预渲染 800px，滚动时基本无白屏 */
const RENDER_MARGIN = '800px 0px'
/** 页间距（计算当前页码用） */
const PAGE_GAP = 10

/* ---------------- 状态 ---------------- */
const scrollerEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const rendering = ref(false)
const error = ref('')
const pageCount = ref(0)
const page = ref(1)
const scale = ref(1)
/** 第 1 页原始尺寸（用于占位与「适合宽度」） */
const baseSize = ref({ w: 0, h: 0 })
/** 各页原始尺寸（渲染后回填，纠正混合横竖页的占位） */
const pageSizes = reactive(new Map<number, { w: number; h: number }>())

const statusText = computed(() => {
  if (error.value) return '加载失败'
  if (loading.value) return '解析中…'
  if (rendering.value) return '渲染中…'
  return '就绪'
})

/* ---------------- Worker 与静态资源 ---------------- */
/** 全局复用一个 worker，避免每次打开预览都重新初始化 */
let workerPort: Worker | null = null
function ensureWorker() {
  if (workerPort) return
  workerPort = new PdfWorker()
  pdfjsLib.GlobalWorkerOptions.workerPort = workerPort
}

/** cmaps / 标准字体的绝对地址：三种端（Web、gitgreen://、appassets）都能正确解析 */
function assetUrl(sub: string): string {
  return new URL(`pdfjs/${sub}/`, document.baseURI).href
}

/* ---------------- 加载 ---------------- */
let loadEpoch = 0
let renderEpoch = 0
let loadingTask: PDFDocumentLoadingTask | null = null
let doc: PDFDocumentProxy | null = null

const holderEls = new Map<number, HTMLElement>()
const canvasEls = new Map<number, HTMLCanvasElement>()
const rendered = new Map<number, PDFPageProxy>()
const visible = new Set<number>()

async function load() {
  const my = ++loadEpoch
  teardown()
  error.value = ''
  loading.value = true
  pageCount.value = 0
  page.value = 1
  baseSize.value = { w: 0, h: 0 }
  pageSizes.clear()
  try {
    ensureWorker()
    const task = pdfjsLib.getDocument({
      url: props.src,
      httpHeaders: props.headers && Object.keys(props.headers).length ? props.headers : undefined,
      cMapUrl: assetUrl('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: assetUrl('standard_fonts'),
      // 关闭 PDF 内嵌 JS 执行（CVE-2024-4367 类风险），不影响渲染
      isEvalSupported: false
    })
    loadingTask = task
    const pdf = await task.promise
    if (my !== loadEpoch) {
      task.destroy().catch(() => {})
      return
    }
    doc = pdf
    pageCount.value = pdf.numPages
    const first = await pdf.getPage(1)
    const vp = first.getViewport({ scale: 1 })
    baseSize.value = { w: vp.width, h: vp.height }
    loading.value = false
    await nextTick()
    setupObserver()
    fitWidth()
    refreshVisible()
  } catch (e) {
    if (my !== loadEpoch) return
    loading.value = false
    const msg = e instanceof Error ? e.message : String(e)
    error.value = msg
    emit('error', msg)
  }
}

function reload() {
  load()
}

function teardown() {
  observer?.disconnect()
  observer = null
  visible.clear()
  rendered.clear()
  holderEls.clear()
  canvasEls.clear()
  const task = loadingTask
  loadingTask = null
  doc = null
  if (task) {
    // loadingTask.destroy() 会连同文档与 worker 消息通道一起释放
    task.destroy().catch(() => {})
  }
}

/* ---------------- 懒渲染 ---------------- */
let observer: IntersectionObserver | null = null
let chain: Promise<void> = Promise.resolve()
let pending = 0

function setupObserver() {
  const root = scrollerEl.value
  if (!root || typeof IntersectionObserver === 'undefined') {
    // 无 IntersectionObserver 的老内核：直接渲染前几页，保证有内容可看
    for (let n = 1; n <= Math.min(pageCount.value, 5); n++) visible.add(n)
    return
  }
  observer?.disconnect()
  observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        const n = Number((entry.target as HTMLElement).dataset.page || 0)
        if (!n) continue
        if (entry.isIntersecting) {
          visible.add(n)
          scheduleRender(n)
        } else {
          visible.delete(n)
        }
      }
    },
    { root, rootMargin: RENDER_MARGIN }
  )
  for (const [, el] of holderEls) observer.observe(el)
}

function scheduleRender(n: number) {
  pending++
  rendering.value = true
  chain = chain
    .then(() => renderPage(n))
    .catch(() => {
      /* 单页失败不阻断后续渲染 */
    })
    .finally(() => {
      pending--
      rendering.value = pending > 0
    })
}

function refreshVisible() {
  for (const n of visible) scheduleRender(n)
}

async function renderPage(n: number) {
  const pdf = doc
  if (!pdf || rendered.has(n) || !visible.has(n)) return
  const myRender = renderEpoch
  const canvas = canvasEls.get(n)
  if (!canvas) return
  try {
    const pdfPage = await pdf.getPage(n)
    if (myRender !== renderEpoch || doc !== pdf) return
    const dpr = window.devicePixelRatio || 1
    const viewport = pdfPage.getViewport({ scale: scale.value * dpr })
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) return
    await pdfPage.render({ canvasContext, viewport }).promise
    if (myRender !== renderEpoch) {
      // 渲染期间发生了缩放：丢弃旧比例画面，并排队重画
      blankCanvas(n)
      if (visible.has(n)) scheduleRender(n)
      return
    }
    // 回填原始尺寸（÷当前缩放），供占位与后续缩放复用
    pageSizes.set(n, {
      w: viewport.width / dpr / scale.value,
      h: viewport.height / dpr / scale.value
    })
    rendered.set(n, pdfPage)
    evict()
  } catch {
    /* 单页渲染失败（如页面已销毁）忽略 */
  }
}

/** 淘汰离当前页最远、且已滚出预渲染区的页，限制 canvas 占用 */
function evict() {
  if (rendered.size <= MAX_RENDERED) return
  const candidates = [...rendered.keys()]
    .filter(n => !visible.has(n))
    .sort((a, b) => Math.abs(a - page.value) - Math.abs(b - page.value))
  for (const n of candidates) {
    if (rendered.size <= MAX_RENDERED) break
    rendered.delete(n)
    blankCanvas(n)
  }
}

function blankCanvas(n: number) {
  const canvas = canvasEls.get(n)
  if (canvas) {
    canvas.width = 0
    canvas.height = 0
  }
}

/** 缩放变化：清空已渲染内容并重绘可视页 */
function invalidate() {
  renderEpoch++
  for (const [n] of rendered) blankCanvas(n)
  rendered.clear()
  refreshVisible()
}

/* ---------------- 交互 ---------------- */
function setPageEl(n: number, el: unknown) {
  if (el instanceof HTMLElement) holderEls.set(n, el)
  else holderEls.delete(n)
}

function setCanvasEl(n: number, el: unknown) {
  if (el instanceof HTMLCanvasElement) canvasEls.set(n, el)
  else canvasEls.delete(n)
}

function pageStyle(n: number) {
  const size = pageSizes.get(n)
  const w = (size ? size.w : baseSize.value.w) * scale.value
  const h = (size ? size.h : baseSize.value.h) * scale.value
  return { width: `${w}px`, height: `${h}px` }
}

function setScale(next: number) {
  const value = Math.round(Math.min(5, Math.max(0.3, next)) * 100) / 100
  if (value === scale.value) return
  scale.value = value
  invalidate()
}

function zoom(delta: number) {
  setScale(scale.value + delta)
}

function fitWidth() {
  const el = scrollerEl.value
  if (!el || !baseSize.value.w) return
  setScale((el.clientWidth - 24) / baseSize.value.w)
}

function goPage(target: number) {
  if (!pageCount.value) return
  const n = Math.min(pageCount.value, Math.max(1, Math.round(target)))
  const holder = holderEls.get(n)
  const scroller = scrollerEl.value
  page.value = n
  if (!holder || !scroller) return
  scroller.scrollTo({ top: holder.offsetTop, behavior: 'smooth' })
}

function onJumpInput(e: Event) {
  const value = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(value)) goPage(value)
}

let scrollRaf = 0
function onScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    const scroller = scrollerEl.value
    if (!scroller || !pageCount.value || !baseSize.value.h) return
    const stride = baseSize.value.h * scale.value + PAGE_GAP
    if (stride <= 0) return
    page.value = Math.min(pageCount.value, Math.max(1, Math.floor(scroller.scrollTop / stride) + 1))
  })
}

/* ---------------- 生命周期 ---------------- */
onMounted(load)
watch(() => props.src, load)
onBeforeUnmount(() => {
  loadEpoch++
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  teardown()
})
</script>

<style scoped>
.pdf-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-page);
}
.pdf-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
}
.pdf-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pdf-btn {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-main);
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 1.7;
  cursor: pointer;
}
.pdf-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.pdf-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pdf-page-input {
  width: 54px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-main);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 12px;
  text-align: center;
}
.pdf-meta {
  color: var(--text-secondary);
  white-space: nowrap;
}
.pdf-status {
  margin-left: auto;
  color: var(--text-secondary);
}
.pdf-scroller {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}
.pdf-pages {
  width: max-content;
  margin: 0 auto;
}
.pdf-page {
  margin: 0 auto 10px;
  background: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}
.pdf-page canvas {
  display: block;
}
.pdf-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 200px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  white-space: pre-wrap;
}
</style>
