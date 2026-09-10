/**
 * 本地数据层：IndexedDB（操作日志 / 下载记录）+ 备份还原 + 数据重置
 * 全部数据仅存本机，不上传任何第三方服务器。
 */
import * as crypto from './crypto'
import { decryptPAT } from './crypto'

const DB_NAME = 'gitgreen'
const STORE_LOGS = 'logs'
const STORE_DOWNLOADS = 'downloads'

export interface OpLog {
  id: string
  time: number
  module: string
  action: string
  detail: string
  level: 'info' | 'success' | 'warning' | 'error'
}

export interface DownloadRecord {
  id: string
  filename: string
  percent: number
  status: 'downloading' | 'done' | 'error'
  time?: number
}

export interface BackupPayload {
  app: string
  version: number
  exportedAt: number
  includeCredentials: boolean
  salt?: string
  mkWrapped?: string
  accounts?: any[]
  repoMeta?: Record<string, unknown>
  settings?: Record<string, unknown>
  downloads?: DownloadRecord[]
  logs?: OpLog[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_LOGS)) db.createObjectStore(STORE_LOGS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_DOWNLOADS)) db.createObjectStore(STORE_DOWNLOADS, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(store: string, value: unknown): Promise<void> {
  return openDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

function idbGetAll<T>(store: string): Promise<T[]> {
  return openDb().then(
    db =>
      new Promise<T[]>((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll()
        req.onsuccess = () => resolve((req.result || []) as T[])
        req.onerror = () => reject(req.error)
      })
  )
}

function idbClear(store: string): Promise<void> {
  return openDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

/* ---------------- 操作日志 ---------------- */

export async function writeLog(entry: Omit<OpLog, 'id' | 'time' | 'level'> & { level?: OpLog['level'] }): Promise<void> {
  const log: OpLog = {
    module: entry.module,
    action: entry.action,
    detail: entry.detail,
    level: entry.level || 'info',
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now()
  }
  try {
    await idbPut(STORE_LOGS, log)
  } catch {
    /* IndexedDB不可用时忽略 */
  }
}

export async function queryLogs(): Promise<OpLog[]> {
  try {
    const all = await idbGetAll<OpLog>(STORE_LOGS)
    return all.sort((a, b) => b.time - a.time)
  } catch {
    return []
  }
}

/** 按保留天数清理过期日志 */
export async function purgeLogs(retentionDays: number): Promise<number> {
  try {
    const all = await idbGetAll<OpLog>(STORE_LOGS)
    const deadline = Date.now() - retentionDays * 24 * 3600 * 1000
    const expired = all.filter(l => l.time < deadline)
    if (expired.length === 0) return 0
    const db = await openDb()
    const tx = db.transaction(STORE_LOGS, 'readwrite')
    expired.forEach(l => tx.objectStore(STORE_LOGS).delete(l.id))
    await new Promise<void>(resolve => (tx.oncomplete = () => resolve()))
    return expired.length
  } catch {
    return 0
  }
}

export async function clearLogs(): Promise<void> {
  await idbClear(STORE_LOGS)
}

/* ---------------- 下载记录 ---------------- */

export async function saveDownload(task: DownloadRecord): Promise<void> {
  try {
    await idbPut(STORE_DOWNLOADS, { ...task, time: task.time || Date.now() })
  } catch {
    /* ignore */
  }
}

export async function listDownloads(): Promise<DownloadRecord[]> {
  try {
    const all = await idbGetAll<DownloadRecord>(STORE_DOWNLOADS)
    return all.sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 50)
  } catch {
    return []
  }
}

export async function clearDownloads(): Promise<void> {
  await idbClear(STORE_DOWNLOADS)
}

/** 删除单条下载记录 */
export async function removeDownload(id: string): Promise<void> {
  try {
    await openDb().then(
      db =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_DOWNLOADS, 'readwrite')
          tx.objectStore(STORE_DOWNLOADS).delete(id)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
    )
  } catch {
    /* ignore */
  }
}

/* ---------------- 备份 / 还原 ---------------- */

export async function createBackup(includeCredentials: boolean, pin?: string): Promise<BackupPayload> {
  const payload: BackupPayload = {
    app: 'GitGreen',
    version: 1,
    exportedAt: Date.now(),
    includeCredentials
  }
  const accounts = JSON.parse(localStorage.getItem('gitgreen_accounts') || '[]')
  if (includeCredentials) {
    const key = await crypto.exportKeyMaterial(pin)
    payload.salt = key.salt
    payload.mkWrapped = key.mkWrapped
    payload.accounts = accounts
  } else {
    payload.accounts = accounts.map((a: any) => {
      const { encryptedPat, ...rest } = a
      return rest
    })
  }
  payload.repoMeta = JSON.parse(localStorage.getItem('gitgreen_repo_meta') || '{}')
  payload.settings = JSON.parse(localStorage.getItem('gitgreen_settings') || '{}')
  payload.downloads = await listDownloads()
  payload.logs = await queryLogs()
  return payload
}

export interface RestoreResult {
  accounts: number
  meta: number
  settings: number
  downloads: number
  logs: number
  successAccounts: string[]
  failedAccounts: string[]
}

export async function restoreBackup(
  payload: BackupPayload,
  opts: { includeCredentials: boolean; overwriteLogs: boolean }
): Promise<RestoreResult> {
  if (payload.app !== 'GitGreen') throw new Error('不是有效的 GitGreen 备份文件')
  const result: RestoreResult = { accounts: 0, meta: 0, settings: 0, downloads: 0, logs: 0, successAccounts: [], failedAccounts: [] }

  if (opts.includeCredentials && payload.salt && payload.mkWrapped) {
    await crypto.importKeyMaterial(payload.salt, payload.mkWrapped)
  }

  const list = JSON.parse(localStorage.getItem('gitgreen_accounts') || '[]')
  for (const acc of payload.accounts || []) {
    if (!acc?.id || !acc?.username) continue
    const exists = list.findIndex((a: any) => a.id === acc.id)
    if (exists >= 0 && !acc.encryptedPat) continue
    if (exists >= 0) list[exists] = { ...list[exists], ...acc }
    else list.push(acc)
    result.accounts++
    if (acc.encryptedPat) {
      try {
        await decryptPAT(acc.encryptedPat)
        result.successAccounts.push(acc.username)
      } catch {
        result.failedAccounts.push(acc.username)
      }
    }
  }
  localStorage.setItem('gitgreen_accounts', JSON.stringify(list))

  const meta = { ...(JSON.parse(localStorage.getItem('gitgreen_repo_meta') || '{}')), ...(payload.repoMeta || {}) }
  localStorage.setItem('gitgreen_repo_meta', JSON.stringify(meta))
  result.meta = Object.keys(payload.repoMeta || {}).length

  if (payload.settings && Object.keys(payload.settings).length > 0) {
    localStorage.setItem('gitgreen_settings', JSON.stringify(payload.settings))
    result.settings = 1
  }

  for (const d of payload.downloads || []) {
    await saveDownload(d)
    result.downloads++
  }

  if (opts.overwriteLogs) await clearLogs()
  for (const l of payload.logs || []) {
    await idbPut(STORE_LOGS, l)
    result.logs++
  }
  return result
}

/* ---------------- 危险操作 ---------------- */

/** 重置资源数据：清除仓库缓存、收藏分组、下载记录与日志，保留账号与设置 */
export async function clearAllExceptAccounts(): Promise<void> {
  localStorage.removeItem('gitgreen_repo_meta')
  await clearDownloads()
  await clearLogs()
}

/** 清空全部本地数据 */
export async function wipeAllData(): Promise<void> {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith('gitgreen_') || k === 'themeMode')) keys.push(k)
  }
  keys.forEach(k => localStorage.removeItem(k))
  crypto.purgeAllKeyMaterial()
  try {
    indexedDB.deleteDatabase(DB_NAME)
  } catch {
    /* ignore */
  }
}
