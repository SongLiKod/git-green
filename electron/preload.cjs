/**
 * GitGreen Electron 预加载脚本：
 * 仅暴露本地 Git 执行、备份文件读写、目录选择与系统信息能力（Windows 客户端独有），
 * 不开放 Node 环境。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  gitExec: (args, cwd) => ipcRenderer.invoke('git:exec', { args, cwd }),
  fs: {
    saveFile: opts => ipcRenderer.invoke('fs:saveFile', opts),
    openFile: () => ipcRenderer.invoke('fs:openFile'),
    pickDirectory: () => ipcRenderer.invoke('fs:pickDirectory')
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo')
  }
})
