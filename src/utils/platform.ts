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
  /** 打开已下载文件（可选，旧版本壳可能未实现） */
  openFile?: (uri: string) => void
  /** 调起 APK 安装（可选，旧版本壳可能未实现） */
  installApk?: (uri: string) => void
  /** 打开系统「下载」界面（可选，旧版本壳可能未实现） */
  openDownloadDir?: () => void
  /** 分享已下载文件（可选，旧版本壳可能未实现） */
  shareFile?: (uri: string, mime: string) => void
  /** 申请通知权限（可选，旧版本壳可能未实现） */
  requestNotificationPermission?: () => void
}

/** 原生下载落盘结果：展示路径 + 可打开的文件 Uri */
export interface NativeSavedFile {
  /** 面向用户的展示路径，如 Download/GitGreen/xxx.apk */
  path: string
  /** 可打开/分享的 Uri（真实地址，前端仅透传） */
  uri: string
}

export interface NativeDownloadHandlers {
  onProgress?: (loaded: number, total: number) => void
  onDone?: (file: NativeSavedFile) => void
  onError?: (message: string) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    AndroidBridge?: AndroidBridge
    /** 原生下载进度/完成/失败回调（由 installNativeCallbacks 注入） */
    __gitgreenDownloadProgress?: (id: string, loaded: number, total: number) => void
    __gitgreenDownloadDone?: (id: string, path: string, uri?: string) => void
    __gitgreenDownloadError?: (id: string, message: string) => void
    /** 原生操作（打开/安装/分享等）的提示回调 */
    __gitgreenNativeError?: (message: string) => void
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

/** 原生操作提示（打开/安装/分享失败等）的全局处理器，由页面注册 */
let nativeMessageHandler: ((message: string) => void) | null = null

/** 注册原生操作提示处理器（页面卸载时传 null 注销） */
export function setNativeMessageHandler(handler: ((message: string) => void) | null) {
  nativeMessageHandler = handler
  installNativeCallbacks()
}

/** 注入一次性全局回调，把原生进度事件分发到对应任务 */
function installNativeCallbacks() {
  if (window.__gitgreenDownloadProgress) return
  window.__gitgreenDownloadProgress = (id, loaded, total) => {
    nativeHandlers.get(id)?.onProgress?.(Number(loaded), Number(total))
  }
  window.__gitgreenDownloadDone = (id, path, uri) => {
    const handlers = nativeHandlers.get(id)
    nativeHandlers.delete(id)
    handlers?.onDone?.({ path: String(path), uri: String(uri || '') })
  }
  window.__gitgreenDownloadError = (id, message) => {
    const handlers = nativeHandlers.get(id)
    nativeHandlers.delete(id)
    handlers?.onError?.(String(message))
  }
  window.__gitgreenNativeError = message => nativeMessageHandler?.(String(message))
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

/** 打开已下载文件（仅 Android 原生能力，Web/Windows 返回 false） */
export function openNativeFile(uri: string): boolean {
  if (!window.AndroidBridge?.openFile || !uri) return false
  window.AndroidBridge.openFile(uri)
  return true
}

/** 调起 APK 安装（仅 Android 原生能力，Web/Windows 返回 false） */
export function installNativeApk(uri: string): boolean {
  if (!window.AndroidBridge?.installApk || !uri) return false
  window.AndroidBridge.installApk(uri)
  return true
}

/** 打开系统「下载」界面（仅 Android 原生能力，Web/Windows 返回 false） */
export function openNativeDownloadDir(): boolean {
  if (!window.AndroidBridge?.openDownloadDir) return false
  window.AndroidBridge.openDownloadDir()
  return true
}

/** 分享已下载文件（仅 Android 原生能力，Web/Windows 返回 false） */
export function shareNativeFile(uri: string, mime?: string): boolean {
  if (!window.AndroidBridge?.shareFile || !uri) return false
  window.AndroidBridge.shareFile(uri, mime || '')
  return true
}

/** 申请通知权限（Android 13+，用于下载完成后弹系统通知） */
export function requestAndroidNotificationPermission() {
  window.AndroidBridge?.requestNotificationPermission?.()
}

/** 按文件名推断 MIME（与原生侧保持一致的常见类型） */
export function guessMimeByName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.zip')) return 'application/zip'
  if (lower.endsWith('.apk')) return 'application/vnd.android.package-archive'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.txt') || lower.endsWith('.log')) return 'text/plain'
  if (lower.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}

/** 是否 APK 安装包 */
export function isApkFile(name: string): boolean {
  return name.toLowerCase().endsWith('.apk')
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
