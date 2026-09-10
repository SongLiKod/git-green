/**
 * 三端平台识别：Web网页端 / Windows客户端(Electron) / Android客户端(WebView)
 */

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
  /** Android 原生下载管理器（系统 DownloadManager，支持后台断点续传） */
  download: (taskJson: string) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    AndroidBridge?: AndroidBridge
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

/**
 * 尝试交给 Android 原生下载管理器（后台断点续传）。
 * 返回 true 表示已由原生下载接管；Web/Windows 端返回 false，由前端 blob 下载闭环。
 */
export function tryNativeDownload(url: string, headers: Record<string, string>, filename: string): boolean {
  if (window.AndroidBridge) {
    window.AndroidBridge.download(JSON.stringify({ url, headers, filename }))
    return true
  }
  return false
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
