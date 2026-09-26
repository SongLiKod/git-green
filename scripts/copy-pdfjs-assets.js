/**
 * 同步 pdfjs-dist 运行时静态资源到 public/pdfjs：
 * - cmaps/          预定义 CMap（中文等 CID 字体必需，否则文字乱码）
 * - standard_fonts/ 14 种标准字体（未内嵌字体的 PDF 必需）
 * - wasm/           部分版本的图像解码器（存在才复制）
 * - pdf.worker.min.mjs（不参与打包，直接原样提供，避免打包器改写 Worker）
 *
 * 由 npm 的 predev / prebuild 钩子自动执行，无需手工运行。
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const srcRoot = path.join(root, 'node_modules', 'pdfjs-dist')
const destRoot = path.join(root, 'public', 'pdfjs')
const dirs = ['cmaps', 'standard_fonts', 'wasm']
const files = ['pdf.worker.min.mjs']

if (!fs.existsSync(srcRoot)) {
  console.error('未找到 pdfjs-dist，请先执行 npm install')
  process.exit(1)
}

let copied = 0

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    if (name.endsWith('.map')) continue // 不复制 sourcemap，减小体积
    const s = path.join(src, name)
    const d = path.join(dest, name)
    if (fs.statSync(s).isDirectory()) copyDir(s, d)
    else {
      fs.copyFileSync(s, d)
      copied++
    }
  }
}

fs.rmSync(destRoot, { recursive: true, force: true })
for (const d of dirs) {
  const src = path.join(srcRoot, d)
  if (!fs.existsSync(src)) continue
  copyDir(src, path.join(destRoot, d))
}
for (const f of files) {
  const src = path.join(srcRoot, 'build', f)
  if (!fs.existsSync(src)) continue
  fs.mkdirSync(destRoot, { recursive: true })
  fs.copyFileSync(src, path.join(destRoot, f))
  copied++
}

console.log(`pdfjs 运行时资源已同步到 public/pdfjs（${copied} 个文件）`)
