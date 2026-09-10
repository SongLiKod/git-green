/**
 * 操作日志状态：本地留痕、过期清理、检索数据源
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as db from '@/utils/db'
import type { OpLog } from '@/utils/db'
import { useSettingsStore } from './useSettingsStore'

export const useLogStore = defineStore('log', () => {
  const logs = ref<OpLog[]>([])
  const lastPurgeDate = ref('')

  async function write(entry: { module: string; action: string; detail?: string; level?: OpLog['level'] }) {
    await db.writeLog({
      module: entry.module,
      action: entry.action,
      detail: entry.detail || '',
      level: entry.level || 'info'
    })
    await ensurePurge()
  }

  /** 每天按保留天数清理一次过期日志 */
  async function ensurePurge() {
    const today = new Date().toDateString()
    if (lastPurgeDate.value === today) return
    lastPurgeDate.value = today
    const settings = useSettingsStore()
    const removed = await db.purgeLogs(settings.config.logRetentionDays || 90)
    if (removed > 0) {
      await db.writeLog({
        module: 'system',
        action: '清理过期日志',
        detail: `按保留策略清理了 ${removed} 条超过 ${settings.config.logRetentionDays} 天的日志`
      })
    }
  }

  async function refresh() {
    logs.value = await db.queryLogs()
  }

  async function clearAll() {
    await db.clearLogs()
    logs.value = []
  }

  async function exportJson() {
    await refresh()
    return JSON.stringify(logs.value, null, 2)
  }

  return { logs, write, refresh, clearAll, exportJson, ensurePurge }
})
