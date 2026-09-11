<template>
  <div class="md-render" v-html="html"></div>
</template>

<script setup lang="ts">
defineOptions({ name: 'MdRender' })
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = withDefaults(
  defineProps<{
    /** Markdown 原文 */
    source?: string | null
    /** 内容为空时展示的提示文字 */
    emptyText?: string
  }>(),
  { source: '', emptyText: '' }
)

const html = computed(() => {
  const s = props.source || ''
  const rendered = renderMarkdown(s)
  return rendered ? rendered : props.emptyText
})
</script>

<style>
.md-render {
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}
.md-render > *:first-child {
  margin-top: 0;
}
.md-render > *:last-child {
  margin-bottom: 0;
}
.md-render h1,
.md-render h2,
.md-render h3,
.md-render h4,
.md-render h5,
.md-render h6 {
  margin: 14px 0 8px;
  font-weight: 600;
  line-height: 1.4;
}
.md-render h1 {
  font-size: 1.5em;
}
.md-render h2 {
  font-size: 1.3em;
}
.md-render h3 {
  font-size: 1.15em;
}
.md-render h4,
.md-render h5,
.md-render h6 {
  font-size: 1em;
}
.md-render p {
  margin: 0 0 10px;
}
.md-render ul,
.md-render ol {
  margin: 0 0 10px;
  padding-left: 22px;
}
.md-render li {
  margin: 2px 0;
}
.md-render li.task-list-item {
  list-style: none;
  margin-left: -20px;
}
.md-render a {
  color: var(--color-primary, #409eff);
  text-decoration: none;
}
.md-render a:hover {
  text-decoration: underline;
}
.md-render blockquote {
  margin: 0 0 10px;
  padding: 2px 12px;
  border-left: 4px solid var(--border-color, #ddd);
  color: var(--text-secondary, #666);
}
.md-render code {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  background: rgba(125, 125, 125, 0.14);
  padding: 2px 5px;
  border-radius: 4px;
}
.md-render pre {
  background: var(--bg-card, #f6f8fa);
  border: 1px solid var(--border-color, #e1e4e8);
  border-radius: 6px;
  padding: 10px;
  overflow: auto;
  margin: 0 0 10px;
}
.md-render pre code {
  background: transparent;
  padding: 0;
}
.md-render img {
  max-width: 100%;
  border-radius: 4px;
}
.md-render table {
  border-collapse: collapse;
  margin: 0 0 10px;
  max-width: 100%;
  display: block;
  overflow-x: auto;
}
.md-render th,
.md-render td {
  border: 1px solid var(--border-color, #e1e4e8);
  padding: 6px 10px;
}
.md-render th {
  background: var(--bg-page, #f6f8fa);
  font-weight: 600;
}
.md-render hr {
  border: none;
  border-top: 1px solid var(--border-color, #e1e4e8);
  margin: 14px 0;
}
.md-render input[type='checkbox'] {
  margin-right: 6px;
  vertical-align: middle;
}
</style>