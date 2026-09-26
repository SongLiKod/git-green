/** 是否 PDF 文件（PDF 在线预览专用） */
export function isPdfFile(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf')
}

/** 字节数友好展示（PDF 预览下载进度用） */
export function formatBytes(size: number): string {
  if (!size || size < 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
