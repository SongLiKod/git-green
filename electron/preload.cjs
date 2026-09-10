/**
 * GitGreen Electron 预加载脚本：
 * 仅暴露本地 Git 执行能力（Windows 客户端独有），不开放 Node 环境。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  gitExec: (args, cwd) => ipcRenderer.invoke('git:exec', { args, cwd })
})
