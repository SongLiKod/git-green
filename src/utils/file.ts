/** 是否 PDF 文件（PDF 在线预览专用） */
export function isPdfFile(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf')
}

/**
 * 超长路径中段省略：保留首段目录与完整文件名，其余目录用 … 代替。
 * 例：`src/pages/BranchManage/index.vue` → `src/pages/…/index.vue`
 * 不超过 max 时原样返回；无目录可省略或文件名本身超长时退回原文（交由 CSS 省略兜底）。
 */
export function shortenPath(path: string, max = 30): string {
  const p = String(path || '')
  if (p.length <= max) return p
  const parts = p.split('/')
  const name = parts[parts.length - 1]
  const dirs = parts.slice(0, -1)
  if (!dirs.length) return p
  // 由保留最多目录到最少目录逐级回退，取放得下的最长形态
  for (let keep = dirs.length - 1; keep >= 1; keep--) {
    const out = `${dirs.slice(0, keep).join('/')}/…/${name}`
    if (out.length <= max) return out
  }
  const onlyName = `…/${name}`
  return onlyName.length <= max ? onlyName : p
}

/** 字节数友好展示（PDF 预览下载进度用） */
export function formatBytes(size: number): string {
  if (!size || size < 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
