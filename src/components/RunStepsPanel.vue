<template>
  <div class="rp">
    <div v-if="loading && !jobs.length" class="rp-empty">正在加载 Job 与步骤…</div>
    <div v-else-if="!jobs.length" class="rp-empty">暂无 Job 数据（可能尚未排入队列，请稍后自动刷新）</div>
    <template v-else>
      <div class="rp-summary">
        <div class="rp-summary-top">
          <span class="rp-pct">{{ pct }}%</span>
          <span class="rp-count">已完成 {{ stats.done }}/{{ stats.total }} 步</span>
          <span v-if="current" class="rp-current">当前：{{ current.job }} › {{ current.step }}</span>
          <span v-else-if="stats.failed" class="rp-current is-fail">失败 {{ stats.failed }} 步</span>
          <span v-else-if="stats.total && stats.done === stats.total" class="rp-current is-ok">全部步骤已执行完</span>
        </div>
        <div class="rp-bar"><div class="rp-bar-in" :class="{ 'is-fail': stats.failed }" :style="{ width: pct + '%' }" /></div>
      </div>

      <div v-for="job in jobs" :key="job.id" class="rp-job" :class="{ 'is-active': job.status === 'in_progress' }">
        <div class="rp-job-head">
          <span class="rp-dot" :class="dot(job.status, job.conclusion)" />
          <span class="rp-job-name" :title="job.name">{{ job.name }}</span>
          <span class="rp-tag" :class="dot(job.status, job.conclusion)">{{ statusText(job.status, job.conclusion) }}</span>
          <span class="rp-meta">{{ jobDone(job) }}/{{ (job.steps || []).length }} 步 · {{ dur(job.started_at, job.completed_at) }}</span>
        </div>
        <div class="rp-steps">
          <div v-for="s in job.steps || []" :key="s.number" class="rp-step" :class="{ 'is-cur': s.status === 'in_progress' }">
            <span class="rp-dot" :class="dot(s.status, s.conclusion)" />
            <span class="rp-idx">{{ s.number }}</span>
            <span class="rp-name" :title="s.name">{{ s.name }}</span>
            <span class="rp-dur">{{ dur(s.started_at, s.completed_at) }}</span>
          </div>
          <div v-if="!(job.steps || []).length" class="rp-step is-muted">等待排入队列…</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/** GitHub Actions 风格的 Job / 步骤进度面板（桌面与移动端共用，状态点纯 CSS 绘制） */
import { computed } from 'vue'
import type { RunJob } from '@/api/githubAction'

const props = defineProps<{ jobs: RunJob[]; loading?: boolean }>()

const STATUS_TEXT: Record<string, string> = {
  queued: '排队中',
  in_progress: '运行中',
  completed: '已完成',
  waiting: '等待中',
  requested: '请求中',
  pending: '等待中'
}
const CONCL_TEXT: Record<string, string> = {
  success: '成功',
  failure: '失败',
  cancelled: '已取消',
  skipped: '已跳过',
  neutral: '无结果',
  timed_out: '超时',
  action_required: '需处理'
}

/** 状态 → 圆点样式类（ok 成功 / bad 失败 / running 转圈 / pending 灰点 / skip 灰勾 / warn 橙色） */
function dot(status?: string | null, conclusion?: string | null): string {
  if (status === 'in_progress') return 'running'
  if (status !== 'completed') return 'pending'
  switch (conclusion) {
    case 'success':
      return 'ok'
    case 'skipped':
    case 'neutral':
      return 'skip'
    case 'cancelled':
      return 'cancel'
    case 'action_required':
      return 'warn'
    default:
      return 'bad'
  }
}

function statusText(status?: string | null, conclusion?: string | null): string {
  const s = STATUS_TEXT[status || ''] || status || ''
  const c = conclusion ? CONCL_TEXT[conclusion] || conclusion : ''
  return c ? `${s} · ${c}` : s
}

/** 耗时：未开始返回空串，运行中按“此刻”实时计算（轮询刷新即更新） */
function dur(start?: string | null, end?: string | null): string {
  if (!start) return ''
  const s = new Date(start).getTime()
  if (isNaN(s)) return ''
  const e = end ? new Date(end).getTime() : Date.now()
  const total = Math.max(0, Math.floor((e - s) / 1000))
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  if (m < 60) return `${m}m ${total % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function jobDone(job: RunJob): number {
  return (job.steps || []).filter(s => s.status === 'completed').length
}

const stats = computed(() => {
  let total = 0
  let done = 0
  let failed = 0
  for (const j of props.jobs) {
    for (const s of j.steps || []) {
      total++
      if (s.status === 'completed') {
        done++
        if (s.conclusion && !['success', 'skipped', 'neutral', 'cancelled'].includes(s.conclusion)) failed++
      }
    }
  }
  return { total, done, failed }
})

const pct = computed(() => (stats.value.total ? Math.round((stats.value.done / stats.value.total) * 100) : 0))

const current = computed(() => {
  for (const j of props.jobs) {
    const s = (j.steps || []).find(x => x.status === 'in_progress')
    if (s) return { job: j.name, step: s.name }
    if (j.status === 'in_progress' && !(j.steps || []).length) return { job: j.name, step: '准备中' }
  }
  return null
})
</script>

<style scoped>
.rp {
  font-size: 13px;
  color: var(--text-main);
}
.rp-empty {
  padding: 26px 10px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
.rp-summary {
  margin-bottom: 12px;
}
.rp-summary-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 6px;
}
.rp-pct {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-primary);
}
.rp-count {
  color: var(--text-secondary);
  font-size: 12px;
}
.rp-current {
  font-size: 12px;
  color: var(--color-primary);
  background: rgba(0, 148, 88, 0.1);
  padding: 1px 8px;
  border-radius: 10px;
}
.rp-current.is-fail {
  color: #d54941;
  background: rgba(213, 73, 65, 0.12);
}
.rp-current.is-ok {
  color: var(--text-secondary);
  background: var(--bg-page);
}
.rp-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  overflow: hidden;
}
.rp-bar-in {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.4s ease;
}
.rp-bar-in.is-fail {
  background: #d54941;
}
.rp-job {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 10px;
  overflow: hidden;
  background: var(--bg-card);
}
.rp-job.is-active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}
.rp-job-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-page);
  border-bottom: 1px solid var(--border-color);
}
.rp-job-name {
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rp-tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  white-space: nowrap;
}
.rp-tag.ok {
  color: #16a34a;
  border-color: rgba(22, 163, 74, 0.45);
}
.rp-tag.bad,
.rp-tag.warn {
  color: #d54941;
  border-color: rgba(213, 73, 65, 0.45);
}
.rp-tag.running {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.rp-meta {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.rp-steps {
  padding: 4px 0;
}
.rp-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 14px;
  line-height: 1.5;
  border-left: 3px solid transparent;
}
.rp-step + .rp-step {
  border-top: 1px dashed var(--border-color);
}
.rp-step.is-cur {
  background: rgba(0, 148, 88, 0.08);
  border-left-color: var(--color-primary);
  font-weight: 600;
}
.rp-step.is-muted {
  color: var(--text-secondary);
}
.rp-idx {
  width: 16px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 11px;
  flex: none;
}
.rp-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rp-dur {
  font-size: 11px;
  color: var(--text-secondary);
  flex: none;
  font-variant-numeric: tabular-nums;
}
/* 状态圆点：纯 CSS，桌面(Element)与移动(Vant)下外观一致 */
.rp-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex: none;
  box-sizing: border-box;
  display: inline-block;
  position: relative;
}
.rp-dot.pending {
  border: 2px solid var(--border-color);
  background: transparent;
}
.rp-dot.running {
  border: 2px solid var(--border-color);
  border-top-color: var(--color-primary);
  animation: rp-spin 0.9s linear infinite;
}
.rp-dot.ok {
  background: #16a34a;
  border: 2px solid #16a34a;
}
.rp-dot.ok::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 1px;
  width: 4px;
  height: 7px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.rp-dot.bad {
  background: #d54941;
  border: 2px solid #d54941;
}
.rp-dot.bad::after {
  content: '×';
  position: absolute;
  inset: 0;
  color: #fff;
  font-size: 11px;
  line-height: 10px;
  text-align: center;
  font-weight: 700;
}
.rp-dot.warn {
  background: #e6a23c;
  border: 2px solid #e6a23c;
}
.rp-dot.warn::after {
  content: '!';
  position: absolute;
  inset: 0;
  color: #fff;
  font-size: 11px;
  line-height: 10px;
  text-align: center;
  font-weight: 700;
}
.rp-dot.skip,
.rp-dot.cancel {
  background: var(--border-color);
  border: 2px solid var(--border-color);
}
.rp-dot.skip::after,
.rp-dot.cancel::after {
  content: '–';
  position: absolute;
  inset: 0;
  color: var(--bg-page);
  font-size: 11px;
  line-height: 10px;
  text-align: center;
  font-weight: 700;
}
@keyframes rp-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
