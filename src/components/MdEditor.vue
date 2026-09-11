<template>
  <div class="md-editor" :class="{ 'is-fill': fill }">
    <div class="md-editor-toolbar">
      <span class="md-tools">
        <button type="button" class="md-bar-btn" title="标题" @mousedown.prevent="wrapLine('## ')">标题</button>
        <button type="button" class="md-bar-btn" title="粗体" @click="wrap('**', '**', '加粗文字')"><b>B</b></button>
        <button type="button" class="md-bar-btn" title="斜体" @click="wrap('*', '*', '斜体文字')"><i>I</i></button>
        <button type="button" class="md-bar-btn" title="删除线" @click="wrap('~~', '~~', '删除线')"><s>S</s></button>
        <button type="button" class="md-bar-btn" title="行内代码" @click="wrap('`', '`', '代码')">&lt;/&gt;</button>
        <button type="button" class="md-bar-btn" title="代码块" @click="wrapCode">◧</button>
        <button type="button" class="md-bar-btn" title="引用" @click="wrapLine('> ')">❝</button>
        <button type="button" class="md-bar-btn" title="无序列表" @click="wrapLine('- ')">•</button>
        <button type="button" class="md-bar-btn" title="有序列表" @click="wrapLine('1. ')">1.</button>
        <button type="button" class="md-bar-btn" title="任务列表" @click="wrapLine('- [ ] ')">☑</button>
        <button type="button" class="md-bar-btn" title="链接" @click="insertLink">链接</button>
        <button type="button" class="md-bar-btn" title="插入图片（粘贴外部图片 URL）" @click="insertImage">图片</button>
        <button type="button" class="md-bar-btn" title="表格" @click="insertTable">▦</button>
        <button type="button" class="md-bar-btn" title="分割线" @click="appendMark('---\n')">—</button>
      </span>
      <span class="md-tabs">
        <button type="button" class="md-tab" :class="{ active: mode === 'write' }" @click="mode = 'write'">编辑</button>
        <button type="button" class="md-tab" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">预览</button>
      </span>
    </div>
    <textarea
      ref="taRef"
      v-show="mode === 'write'"
      class="md-editor-textarea"
      :placeholder="placeholder"
      :value="modelValue"
      :spellcheck="false"
      @input="onInput"
      @keydown="onKeydown"
    ></textarea>
    <div v-show="mode === 'preview'" class="md-editor-preview">
      <MdRender :source="modelValue" empty-text="暂无内容" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'MdEditor' })
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import MdRender from './MdRender.vue'

const props = withDefaults(
  defineProps<{
    /** Markdown 原文（v-model） */
    modelValue: string
    placeholder?: string
    /** 输入框最小高度 */
    minHeight?: string
    /** 输入框最大高度（超过后出现滚动条） */
    maxHeight?: string
    /** 是否撑满父容器高度（全屏时使用） */
    fill?: boolean
  }>(),
  { placeholder: '支持 Markdown 语法', minHeight: '80px', maxHeight: '360px', fill: false }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
}>()

const mode = ref<'write' | 'preview'>('write')
const taRef = ref<HTMLTextAreaElement | null>(null)

// 供 scoped CSS 的 v-bind() 使用（必须是 <script setup> 顶层绑定）
const editorMinHeight = computed(() => props.minHeight)
const editorMaxHeight = computed(() => props.maxHeight)

function autoGrow() {
  const ta = taRef.value
  if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = `${ta.scrollHeight}px`
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}

onMounted(() => nextTick(autoGrow))
watch(
  () => props.modelValue,
  () => {
    if (mode.value === 'write') nextTick(autoGrow)
  }
)

/** 行内包裹（粗体/斜体/删除线/行内代码） */
function wrap(p: string, s = p, placeholder?: string) {
  const ta = taRef.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = props.modelValue
  const sel = text.slice(start, end)
  const content = sel || placeholder || p
  const next = text.slice(0, start) + p + content + s + text.slice(end)
  emit('update:modelValue', next)
  const ns = start + p.length
  const ne = ns + content.length
  nextTick(() => {
    ta.focus()
    ta.selectionStart = ns
    ta.selectionEnd = ne
    autoGrow()
  })
}

/** 整行前缀（标题/引用/列表），选中多行时逐行增删 */
function wrapLine(prefix: string) {
  const ta = taRef.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = props.modelValue
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  let selEnd = end
  if (selEnd < text.length && text[selEnd] !== '\n') {
    const nl = text.indexOf('\n', selEnd)
    selEnd = nl === -1 ? text.length : nl
  }
  const lines = text.slice(lineStart, selEnd).split('\n')
  const trim = prefix.trim()
  const prefixed = lines
    .map(l => (l.trimStart().startsWith(trim) ? l.replace(trim, '').replace(/^\s+/, '') : prefix + l))
    .join('\n')
  const next = text.slice(0, lineStart) + prefixed + text.slice(selEnd)
  emit('update:modelValue', next)
  const newEnd = lineStart + prefixed.length
  nextTick(() => {
    ta.focus()
    ta.selectionStart = lineStart
    ta.selectionEnd = newEnd
    autoGrow()
  })
}

/** 代码块 */
function wrapCode() {
  const ta = taRef.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = props.modelValue
  const sel = text.slice(start, end)
  const code = sel || '在此输入代码'
  const block = '\n```\n' + code + '\n```\n'
  const next = text.slice(0, start) + block + text.slice(end)
  emit('update:modelValue', next)
  const ns = start + 4
  const ne = ns + code.length
  nextTick(() => {
    ta.focus()
    ta.selectionStart = ns
    ta.selectionEnd = ne
    autoGrow()
  })
}

/** 插入链接 */
function insertLink() {
  const ta = taRef.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = props.modelValue
  const sel = text.slice(start, end)
  const url = window.prompt('链接地址', sel.startsWith('http') ? sel : 'https://')
  if (url === null) return
  const label = window.prompt('链接文字', sel && !sel.startsWith('http') ? sel : '链接') || url
  const ins = `[${label}](${url})`
  const next = text.slice(0, start) + ins + text.slice(end)
  emit('update:modelValue', next)
  const ns = start + 1
  const ne = ns + label.length
  nextTick(() => {
    ta.focus()
    ta.selectionStart = ns
    ta.selectionEnd = ne
    autoGrow()
  })
}

/** 插入图片（markdown 形式的图片 URL，需先有可访问的图片地址） */
function insertImage() {
  const url = window.prompt('图片 URL（粘贴可访问的图片地址）', '')
  if (!url) return
  const desc = window.prompt('图片描述（可留空）') || 'image'
  const ta = taRef.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = props.modelValue
  const ins = `![${desc}](${url})`
  const next = text.slice(0, start) + ins + text.slice(end)
  emit('update:modelValue', next)
  nextTick(() => {
    ta.focus()
    ta.selectionStart = ta.selectionEnd = start + ins.length
    autoGrow()
  })
}

/** 插入表格 */
function insertTable() {
  appendMark('| 列1 | 列2 |\n| --- | --- |\n|  |  |\n')
}

/** 光标处追加一段内容 */
function appendMark(mark: string) {
  const ta = taRef.value
  if (!ta) return
  const pos = ta.selectionStart
  const text = props.modelValue
  const next = text.slice(0, pos) + mark + text.slice(pos)
  emit('update:modelValue', next)
  nextTick(() => {
    ta.focus()
    ta.selectionStart = ta.selectionEnd = pos + mark.length
    autoGrow()
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    appendMark('  ')
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    emit('submit')
  }
}
</script>

<style scoped>
.md-editor {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  overflow: hidden;
}
.md-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}
.md-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.md-bar-btn,
.md-tab {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  padding: 5px 6px;
  border-radius: 4px;
  cursor: pointer;
  min-width: 22px;
}
.md-bar-btn:hover,
.md-tab:hover {
  color: var(--color-primary);
  background: rgba(0, 148, 88, 0.08);
}
.md-tabs {
  display: flex;
  gap: 2px;
}
.md-tab {
  font-size: 12px;
  padding: 5px 10px;
}
.md-tab.active {
  color: var(--color-primary);
  background: rgba(0, 148, 88, 0.1);
  font-weight: 600;
}
.md-editor-textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  resize: vertical;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.6;
  font-family: inherit;
  color: var(--text-main);
  background: transparent;
  min-height: v-bind(editorMinHeight);
  max-height: v-bind(editorMaxHeight);
}
.md-editor-preview {
  padding: 8px 10px;
  max-height: v-bind(editorMaxHeight);
  overflow: auto;
}
.md-editor.is-fill {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  flex: 1 1 auto;
}
.md-editor.is-fill .md-editor-textarea {
  flex: 1 1 auto;
  height: auto;
  min-height: 120px;
  max-height: none;
  resize: none;
}
.md-editor.is-fill .md-editor-preview {
  flex: 1 1 auto;
  max-height: none;
}
</style>