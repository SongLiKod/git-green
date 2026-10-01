/**
 * GitGreen Windows 客户端（Electron 主进程）
 * 包含全部远程功能 + 本地Git能力（NodeJS 子进程调用 Git）
 */
const { app, BrowserWindow, ipcMain, protocol, net, session, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { pathToFileURL } = require('url')

const DIST_DIR = path.join(__dirname, '..', 'dist')

/** 通过 NodeJS 子进程调用本地 git 命令 */
function runGit(args, cwd) {
  return new Promise(resolve => {
    const child = spawn('git', args, cwd ? { cwd } : {})
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => (stdout += String(d)))
    child.stderr.on('data', d => (stderr += String(d)))
    child.on('close', code => resolve({ code, stdout, stderr }))
    child.on('error', err => resolve({ code: -1, stdout, stderr: String(err && err.message ? err.message : err) }))
  })
}

ipcMain.handle('git:exec', async (_event, payload) => {
  const args = Array.isArray(payload && payload.args) ? payload.args : []
  const cwd = payload && payload.cwd ? String(payload.cwd) : undefined
  return await runGit(args, cwd)
})

/* 备份文件保存 / 打开 / 目录选择 / 系统信息 */
ipcMain.handle('fs:saveFile', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: payload.defaultPath || 'gitgreen-backup.json',
    filters: [{ name: 'JSON 备份', extensions: ['json'] }]
  })
  if (canceled || !filePath) return null
  fs.writeFileSync(filePath, String(payload.content || ''), 'utf-8')
  return filePath
})

ipcMain.handle('fs:openFile', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  return { name: path.basename(filePaths[0]), content: fs.readFileSync(filePaths[0], 'utf-8') }
})

ipcMain.handle('fs:pickDirectory', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  return canceled || filePaths.length === 0 ? null : filePaths[0]
})

ipcMain.handle('system:getInfo', () => ({
  platform: process.platform,
  versions: process.versions
}))

// 注册特权 scheme：ES Module / fetch / 安全上下文（crypto.subtle 需要安全上下文）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gitgreen',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#009458',
    title: 'GitGreen',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadURL('gitgreen://app/index.html')
  }
}

app.whenReady().then(() => {
  // Windows客户端「无跨域限制」：为GitHub资产下载跳转域名注入CORS响应头
  // 注意：
  //  1) 目标域若已自带 Access-Control-Allow-Origin（如 Actions 日志所在的
  //     *.blob.core.windows.net 存储会返回自身的 "*"），则禁止再注入，
  //     否则 Electron 会与原有响应头合并成多值 "*, *"，触发 CORS 拦截。
  //  2) api.github.com 的二进制下载响应（octet-stream / Range 206）不带任何 CORS 头，
  //     预检白名单里也没有 Range；这里补 ACAO 与 Range，Windows 客户端才能正常下载并断点续传。
  session.defaultSession.webRequest.onHeadersReceived(
    {
      urls: [
        'https://api.github.com/*',
        'https://release-assets.githubusercontent.com/*',
        'https://objects.githubusercontent.com/*',
        'https://codeload.github.com/*',
        'https://*.blob.core.windows.net/*',
        'https://*.githubusercontent.com/*'
      ]
    },
    (details, callback) => {
      const headers = details.responseHeaders || {}
      const merged = { ...headers }
      const findHeader = name =>
        Object.keys(merged).find(k => k.toLowerCase() === name.toLowerCase())

      // --- GitHub API：预检白名单补 Range，响应补 ACAO，Windows 客户端才能分片断点续传 ---
      if (details.url.startsWith('https://api.github.com/')) {
        // 1) GitHub 对二进制下载响应（application/octet-stream / Range 206）不返回
        //    Access-Control-Allow-Origin，浏览器会直接判为跨域失败，这里补上
        if (!findHeader('access-control-allow-origin')) {
          merged['access-control-allow-origin'] = ['*']
        }
        // 2) 预检的 Access-Control-Allow-Headers 白名单不含 Range，补进去才能发分片请求
        const allowKey = findHeader('access-control-allow-headers')
        const raw = allowKey ? merged[allowKey] : undefined
        const existing = Array.isArray(raw) ? raw.join(', ') : String(raw || '')
        const missing = ['Range', 'If-Range'].filter(
          h => !new RegExp(`(^|,)\\s*${h}\\s*(,|$)`, 'i').test(existing)
        )
        if (missing.length > 0) {
          const value = missing.reduce((acc, h) => (acc ? `${acc}, ${h}` : h), existing)
          // 缺白名单时必须带上 Authorization，否则会把原本放行的带 Token 请求一起挡掉
          if (allowKey) merged[allowKey] = [value]
          else merged['access-control-allow-headers'] = [`Authorization, ${value}`]
        }
        return callback({ responseHeaders: merged })
      }

      // --- 资产域：沿用原有注入逻辑 ---
      // 目标域若已自带 Access-Control-Allow-Origin（如 Actions 日志所在的
      // *.blob.core.windows.net 存储会返回自身的 "*"），则禁止再注入，
      // 否则 Electron 会与原有响应头合并成多值 "*, *"，触发 CORS 拦截。
      const hasCorsOrigin = findHeader('access-control-allow-origin')
      if (hasCorsOrigin) {
        return callback({ responseHeaders: merged })
      }
      merged['access-control-allow-origin'] = ['*']
      merged['access-control-allow-headers'] = ['*']
      callback({ responseHeaders: merged })
    }
  )

  protocol.handle('gitgreen', request => {
    let urlPath = decodeURIComponent(new URL(request.url).pathname)
    if (!urlPath || urlPath === '/') urlPath = '/index.html'
    const filePath = path.join(DIST_DIR, urlPath)
    if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath)) {
      return new Response('Not Found', { status: 404 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
