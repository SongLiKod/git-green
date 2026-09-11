<template>
  <div>
    <div v-for="(f, idx) in files" :key="f.filename" class="diff-file">
      <div class="diff-file-head" @click="toggle(f.filename)">
        <span class="diff-index mono">{{ idx + 1 }}</span>
        <el-tag v-if="!isMobile" size="small" :type="statusTagType(f.status)">{{ statusText(f.status) }}</el-tag>
        <van-tag v-else :type="vantStatusTagType(f.status)">{{ statusText(f.status) }}</van-tag>
        <span class="diff-name-wrap">
          <span
            class="diff-filename mono diff-filename--link"
            title="点击预览源文件（点击其余空白折叠/展开 diff）"
            @click.stop="onFilenameClick(f)"
          >{{ f.filename }}</span>
        </span>
        <span class="diff-counts"><b class="add">+{{ f.additions }}</b> <b class="del">-{{ f.deletions }}</b></span>
      </div>
      <template v-if="isOpen(f.filename)">
        <div v-if="f.patch" class="diff-view">
          <div v-for="l in parsePatch(f.patch)" :key="l.i" :class="['diff-line', `diff-line--${l.cls}`]">{{ l.text }}</div>
        </div>
        <div v-else class="diff-empty">（二进制 / 大文件，无内联 diff）</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useIsMobile } from '@/utils/platform'

export interface DiffFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

const props = defineProps<{
  files: DiffFile[]
}>()

const emit = defineEmits<{ (e: 'preview', f: DiffFile): void }>()

const isMobile = useIsMobile()

const openDiffFiles = ref<Record<string, boolean>>({})

function statusText(s: string) {
  return ({ added: '新增', removed: '删除', modified: '修改', renamed: '重命名', copied: '复制' } as Record<string, string>)[s] || s
}

function statusTagType(s: string) {
  return s === 'added' ? 'success' : s === 'removed' ? 'danger' : s === 'modified' ? 'warning' : 'info'
}

function vantStatusTagType(s: string) {
  const t = statusTagType(s)
  return t === 'info' ? 'default' : t
}

function isOpen(filename: string): boolean {
  return !!openDiffFiles.value[filename]
}

function toggle(filename: string) {
  const next = { ...openDiffFiles.value }
  next[filename] = !next[filename]
  openDiffFiles.value = next
}

function onHeadClick(f: DiffFile) {
  toggle(f.filename)
}

/** 点击文件名：弹出源文件预览 */
function onFilenameClick(f: DiffFile) {
  emit('preview', f)
}

function parsePatch(patch: string): { text: string; cls: string; i: number }[] {
  const lines: { text: string; cls: string; i: number }[] = []
  let i = 0
  for (const raw of patch.split('\n')) {
    let cls = 'meta'
    const t = raw
    if (raw.startsWith('+') && !raw.startsWith('+++')) cls = 'add'
    else if (raw.startsWith('-') && !raw.startsWith('---')) cls = 'del'
    else if (raw.startsWith('@@')) cls = 'hunk'
    else if (raw.startsWith(' ') || raw === '') cls = 'ctx'
    lines.push({ text: t, cls, i: i++ })
  }
  return lines
}
</script>

<style scoped>
.diff-file {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 10px;
  overflow: hidden;
}
.diff-file-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-page);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  user-select: none;
}
.diff-name-wrap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.diff-filename {
  display: inline-block;
  max-width: 100%;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
.diff-filename--link {
  cursor: pointer;
  color: var(--color-primary);
}
.diff-filename--link:hover {
  text-decoration: underline;
}
.diff-index {
  flex: none;
  min-width: 22px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  background: rgba(0, 148, 88, 0.08);
  border-radius: 4px;
  text-align: center;
  padding: 2px 5px;
}
.diff-counts {
  flex: none;
  font-family: Consolas, monospace;
  font-size: 12px;
}
.diff-counts b.add {
  color: var(--success, #2e7d32);
}
.diff-counts b.del {
  color: var(--danger, #c62828);
  margin-left: 6px;
}
.diff-view {
  background: var(--bg-card);
  max-height: 240px;
  overflow: auto;
  font-family: Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  padding: 6px 0;
}
.diff-view .diff-line {
  padding: 0 10px;
  min-height: 18px;
}
.diff-line--add {
  background: rgba(46, 125, 50, 0.15);
  color: #2e7d32;
}
.diff-line--del {
  background: rgba(198, 40, 40, 0.12);
  color: #c62828;
}
.diff-line--hunk {
  background: rgba(2, 136, 209, 0.12);
  color: #0277bd;
}
.diff-line--meta {
  color: var(--text-secondary);
}
.diff-line--ctx {
  color: var(--text-main);
}
.diff-empty {
  padding: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}
.mono {
  font-family: Consolas, monospace;
}
</style>