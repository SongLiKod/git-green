/**
 * 系统设置状态管理：配置项统一持久化（LocalStorage），变更即时应用到运行时
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { requestRuntime } from '@/api/request'
import service from '@/api/request'
import type { ThemeMode } from './useThemeStore'

export type SyncIntervalMinutes = 1 | 5 | 10 | 30
export type PageMode = 'single' | 'multi'
/** 日志展示上限的计量方式：按行 / 按字符 */
export type LogViewMode = 'lines' | 'chars'

export interface SystemConfig {
  themeMode: ThemeMode
  pageMode: PageMode
  menuCollapsed: boolean
  autoSyncEnabled: boolean
  syncInterval: SyncIntervalMinutes
  inspectionEnabled: boolean
  inspectionIntervalMinutes: number
  concurrencyLimit: number
  requestTimeout: number
  retryTimes: number
  showRowIndex: boolean
  logRetentionDays: number
  /** 异常/堆栈日志展示上限计量方式 */
  logViewMode: LogViewMode
  /** 异常/堆栈日志展示上限数值（行数或字符数） */
  logViewLimit: number
  backupPath: string
}

const CONFIG_KEY = 'gitgreen_settings'

export const SYNC_INTERVAL_OPTIONS: SyncIntervalMinutes[] = [1, 5, 10, 30]

export const DEFAULT_CONFIG: SystemConfig = {
  themeMode: 'system',
  pageMode: 'single',
  menuCollapsed: false,
  autoSyncEnabled: true,
  syncInterval: 10,
  inspectionEnabled: true,
  inspectionIntervalMinutes: 30,
  concurrencyLimit: 4,
  requestTimeout: 30,
  retryTimes: 2,
  showRowIndex: false,
  logRetentionDays: 90,
  logViewMode: 'lines',
  logViewLimit: 600,
  backupPath: ''
}

export const useSettingsStore = defineStore('settings', () => {
  const config = ref<SystemConfig>({ ...DEFAULT_CONFIG })
  const initialized = ref(false)

  /** 将影响运行时的配置应用到全局模块 */
  function applyRuntime() {
    requestRuntime.timeout = config.value.requestTimeout * 1000
    requestRuntime.retryTimes = config.value.retryTimes
    requestRuntime.concurrency = config.value.concurrencyLimit
    service.defaults.timeout = requestRuntime.timeout
  }

  /** 迁移旧版独立配置键 */
  function migrateLegacy() {
    const legacyTimeout = localStorage.getItem('gitgreen_api_timeout')
    const legacyCheck = localStorage.getItem('gitgreen_check_interval_minutes')
    const legacyCollapsed = localStorage.getItem('gitgreen_menu_collapsed')
    if (legacyTimeout) config.value.requestTimeout = Number(legacyTimeout) || DEFAULT_CONFIG.requestTimeout
    if (legacyCheck !== null) config.value.inspectionIntervalMinutes = Number(legacyCheck) || 0
    if (legacyCollapsed) config.value.menuCollapsed = legacyCollapsed === '1'
    localStorage.removeItem('gitgreen_api_timeout')
    localStorage.removeItem('gitgreen_check_interval_minutes')
    localStorage.removeItem('gitgreen_menu_collapsed')
  }

  function init() {
    if (initialized.value) return
    initialized.value = true
    try {
      config.value = { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') }
    } catch {
      config.value = { ...DEFAULT_CONFIG }
    }
    migrateLegacy()
    applyRuntime()
  }

  function update(patch: Partial<SystemConfig>) {
    config.value = { ...config.value, ...patch }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config.value))
    applyRuntime()
  }

  function reset() {
    config.value = { ...DEFAULT_CONFIG }
    localStorage.removeItem(CONFIG_KEY)
    applyRuntime()
  }

  return { config, initialized, init, update, reset, applyRuntime }
})
