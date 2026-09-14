/**
 * 三端平台识别：Web网页端 / Windows客户端(Electron) / Android客户端(WebView)
 */
import { computed, ref } from 'vue'

export type PlatformType = 'web' | 'windows' | 'android'

export interface GitRunResult {
  code: number
  stdout: string
  stderr: string
}

export interface ElectronAPI {
  platform?: string
  /** 仅 Windows 客户端独有：通过 NodeJS 子进程调用本地 Git */
  gitExec: (args: string[], cwd?: string) => Promise<GitRunResult>
  fs?: {
    saveFile: (opts: { defaultPath?: string; content: string }) => Promise<string | null>
    openFile: () => Promise<{ name: string; content: string } | null>
    pickDirectory: () => Promise<string | null>
  }
  system?: {
    getInfo: () => Promise<{ platform: string; versions: Record<string, string> }>
  }
}

export interface AndroidBridge {
  /** 原生软件内流式下载：App 内下载并回传进度，完成后保存到系统下载目录 */
  download: (taskJson: string) => void
  /** 取消指定下载任务（可选，旧版本壳可能未实现） */
  cancel?: (id: string) => void
  /** 保存前端已生成的字节（二维码/文本等）到系统下载目录（可选，旧版本壳可能未实现） */
  saveBase64?: (taskJson: string) => void
}

export interface NativeDownloadHandlers {
  onProgress?: (loaded: number, total: number) => void
  onDone?: (path: string) => void
  onError?: (message: string) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    AndroidBridge?: AndroidBridge
    /** 原生下载进度/完成/失败回调（由 installNativeCallbacks 注入） */
    __gitgreenDownloadProgress?: (id: string, loaded: number, total: number) => void
    __gitgreenDownloadDone?: (id: string, path: string) => void
    __gitgreenDownloadError?: (id: string, message: string) => void
  }
}

export function getPlatform(): PlatformType {
  if (window.electronAPI) return 'windows'
  if (window.AndroidBridge || /android/i.test(navigator.userAgent)) return 'android'
  return 'web'
}

/** 是否 Windows 客户端（唯一具备本地 Git 能力的端） */
export function isWindowsClient(): boolean {
  return getPlatform() === 'windows'
}

/** 是否 Android 客户端 */
export function isAndroidClient(): boolean {
  return getPlatform() === 'android'
}

/** 响应式窄屏检测（≤768px 即移动形态） */
const mediaQuery = window.matchMedia('(max-width: 768px)')
const narrowScreen = ref(mediaQuery.matches)
mediaQuery.addEventListener('change', e => (narrowScreen.value = e.matches))

/** 移动端形态：Android 客户端或窄屏（页面据此渲染 Vant 移动版 UI） */
export function useIsMobile() {
  return computed(() => getPlatform() === 'android' || narrowScreen.value)
}

/* ---------------- 软件内下载（Android 原生流式，App 内显示真实进度） ---------------- */

const nativeHandlers = new Map<string, NativeDownloadHandlers>()

/** 注入一次性全局回调，把原生进度事件分发到对应任务 */
function installNativeCallbacks() {
  if (window.__gitgreenDownloadProgress) return
  window.__gitgreenDownloadProgress = (id, loaded, total) => {
    nativeHandlers.get(id)?.onProgress?.(Number(loaded), Number(total))
  }
  window.__gitgreenDownloadDone = (id, path) => {
    const handlers = nativeHandlers.get(id)
    nativeHandlers.delete(id)
    handlers?.onDone?.(String(path))
  }
  window.__gitgreenDownloadError = (id, message) => {
    const handlers = nativeHandlers.get(id)
    nativeHandlers.delete(id)
    handlers?.onError?.(String(message))
  }
}

/**
 * 软件内下载（Android）：交给原生在 App 内流式下载并回传进度，完成后保存到系统下载目录。
 * 返回 true 表示已由原生下载接管；Web/Windows 端返回 false，由前端 blob 下载闭环。
 */
export function startNativeDownload(
  id: string,
  url: string,
  headers: Record<string, string>,
  filename: string,
  handlers: NativeDownloadHandlers = {}
): boolean {
  if (!window.AndroidBridge) return false
  installNativeCallbacks()
  nativeHandlers.set(id, handlers)
  window.AndroidBridge.download(JSON.stringify({ id, url, headers, filename }))
  return true
}

/** 取消软件内下载任务（仅 Android 原生下载生效） */
export function cancelNativeDownload(id: string) {
  nativeHandlers.delete(id)
  window.AndroidBridge?.cancel?.(id)
}

/** Blob 转 Base64（不含 data URL 前缀） */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 软件内保存前端已生成的字节（二维码/文本日志等）到系统下载目录。
 * 返回 true 表示已由原生接管；Web/Windows 端返回 false，由前端 blob 下载闭环。
 */
export function saveNativeBlob(
  id: string,
  filename: string,
  blob: Blob,
  handlers: NativeDownloadHandlers = {}
): boolean {
  if (!window.AndroidBridge?.saveBase64) return false
  installNativeCallbacks()
  nativeHandlers.set(id, handlers)
  blobToBase64(blob)
    .then(base64 => window.AndroidBridge?.saveBase64?.(JSON.stringify({ id, filename, base64 })))
    .catch(err => {
      nativeHandlers.delete(id)
      handlers.onError?.(String(err?.message || err))
    })
  return true
}

/** 浏览器内 blob 落盘下载（不跳转任何浏览器外链页面） */
export function blobDownload(blob: Blob, filename: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

/** 文本内容本地文件导出（账号配置备份等） */
export function textDownload(content: string, filename: string) {
  blobDownload(new Blob([content], { type: 'application/json' }), filename)
}
