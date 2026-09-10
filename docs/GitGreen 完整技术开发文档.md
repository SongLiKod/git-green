# GitGreen 完整技术开发文档（最终纯净完整版）

## 0\. 项目总览

**项目名称：GitGreen**

**项目定位：纯前端三端 GitHub 多账号管理工具**

**核心架构：零后端、零服务器、零 Nginx、零数据库、零 Redis**

所有逻辑、API 请求、数据存储、主题渲染全部运行在客户端，Vue3 直接调用 GitHub 官方 REST API。无需部署任何服务端，开箱即用。

**主题体系：绿色主色调 \+ 浅色模式 / 深色模式 / 跟随系统模式**

**支持三端：**

- Web：纯静态 Vite \+ Vue3，无需服务器

- Windows：Electron 桌面客户端

- Android：WebView 套静态资源

## 1\. 架构设计（核心）

### 1\.1 整体架构链路

UI 业务层（Vue3）→ 本地 API 适配器（Axios 封装）→ GitHub 官方 API

所有数据、账号凭证、主题配置、仓库分组 **全部本地持久化**，不上传任何服务器。

### 1\.2 架构优势

- 无需后端开发、无需运维、无需部署

- 三端共用一套源代码，维护成本极低

- 所有操作页面闭环，不跳转 GitHub 官网

- 账号 PAT 本地 AES 加密，隐私安全

- 自带完整深色/浅色/系统跟随主题

### 1\.3 三端能力差异

- **Web 端**：仅远程 API 操作，无本地 Git

- **Windows 端**：完整功能 \+ 本地 Git 命令调用

- **Android 端**：远程全功能 \+ 断点续传下载

## 2\. 全局技术栈

### 2\.1 公共技术栈（全平台统一）

- 框架：Vue3 \+ Vite

- 语言：TypeScript

- UI 库：Element Plus（全局绿色主题）

- 状态管理：Pinia

- 路由：Vue Router

- 网络：Axios

- 加密：Web Crypto AES\-256\-CBC

- 存储：LocalStorage / IndexedDB

### 2\.2 平台独有技术

- Windows：Electron、NodeJS 子进程调用 Git

- Android：WebView、原生下载管理器

## 3\. 全局统一规范

### 3\.1 API 统一返回结构

```typescript
{
  code: number
  msg: string
  data: any
}
```

- 200：成功

- 401：Token 失效

- 403：限流 / 权限不足

- 500：网络/服务异常

### 3\.2 加密规范

所有 GitHub PAT 密钥采用 **AES\-256\-CBC** 加密存储，全程本地，永不外传。

### 3\.3 主题色值规范（固定）

- 主色：\#009458

- 浅绿：\#34b97c

- 深绿：\#007244

主题模式：light / dark / system

## 4\. 完整项目目录结构

```Plain Text
src
├── api
│   ├── request.ts
│   ├── githubAccount.ts
│   ├── githubRepo.ts
│   ├── githubBranch.ts
│   ├── githubAction.ts
│   ├── githubRelease.ts
│   └── githubFile.ts
├── assets
│   ├── theme.css
│   └── element-vars.css
├── components
│   └── ThemeSwitch.vue
├── pages
│   ├── AccountManage
│   ├── RepoList
│   ├── RepoSetting
│   ├── BranchManage
│   ├── ActionManage
│   ├── ReleaseManage
│   └── FileManager
├── stores
│   ├── useThemeStore.ts
│   ├── useAccountStore.ts
│   └── useRepoStore.ts
├── utils
│   ├── crypto.ts
│   └── platform.ts
├── router
├── App.vue
└── main.ts
```

## 5\. 核心源码（完整无缺失）

### 5\.1 主题状态管理 stores/useThemeStore\.ts

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  const themeMode = ref<ThemeMode>('system')
  const actualDark = ref(false)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  function calcActualDark(mode: ThemeMode): boolean {
    if (mode === 'system') return mediaQuery.matches
    return mode === 'dark'
  }

  function applyDocumentClass() {
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.classList.add(actualDark.value ? 'dark' : 'light')
  }

  function updateTheme(mode: ThemeMode) {
    themeMode.value = mode
    actualDark.value = calcActualDark(mode)
    applyDocumentClass()
  }

  mediaQuery.addEventListener('change', () => {
    if (themeMode.value === 'system') {
      actualDark.value = mediaQuery.matches
      applyDocumentClass()
    }
  })

  function initTheme() {
    const val = localStorage.getItem('themeMode') as ThemeMode
    if (val) themeMode.value = val
    updateTheme(themeMode.value)
  }

  function setThemeMode(mode: ThemeMode) {
    localStorage.setItem('themeMode', mode)
    updateTheme(mode)
  }

  return { themeMode, actualDark, initTheme, setThemeMode }
})
```

### 5\.2 全局主题样式 assets/theme\.css

```css
:root {
  --color-primary: #009458;
  --color-primary-light: #34b97c;
  --color-primary-dark: #007244;
}

html.light {
  --bg-page: #ffffff;
  --bg-card: #f8faf8;
  --text-main: #1f2937;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
}

html.dark {
  --bg-page: #111816;
  --bg-card: #1f2925;
  --text-main: #e5e7eb;
  --text-secondary: #9ca3af;
  --border-color: #37413c;
}

body {
  background: var(--bg-page);
  color: var(--text-main);
  transition: 0.25s ease;
}
```

### 5\.3 Element Plus 绿色主题覆盖 assets/element\-vars\.css

```css
:root {
  --el-color-primary: #009458;
  --el-color-primary-light-3: #34b97c;
  --el-color-primary-dark-2: #007244;
}
html.dark {
  --el-color-primary: #009458;
  --el-color-primary-light-3: #34b97c;
  --el-color-primary-dark-2: #007244;
}
```

### 5\.4 主题切换组件 components/ThemeSwitch\.vue

```vue
<template>
  <el-select v-model="mode" @change="handle">
    <el-option label="浅色模式" value="light" />
    <el-option label="深色模式" value="dark" />
    <el-option label="跟随系统" value="system" />
  </el-select>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useThemeStore } from '@/stores/useThemeStore'
const t = useThemeStore()
const mode = ref(t.themeMode)
const handle = (v: any) => t.setThemeMode(v)
</script>
```

### 5\.5 Axios 统一请求封装 api/request\.ts

```typescript
import axios from 'axios'
const service = axios.create({
  baseURL: 'https://api.github.com',
  timeout: 30000
})

service.interceptors.request.use(config => {
  return config
})

service.interceptors.response.use(
  res => ({ code: 200, msg: 'success', data: res.data }),
  err => {
    const c = err.response?.status
    if (c === 401) return { code: 401, msg: 'Token失效' }
    if (c === 403) return { code: 403, msg: '请求限流或权限不足' }
    return { code: 500, msg: '请求异常' }
  }
)

export default service
```

## 6\. 全量 API 模块说明

### 6\.1 账号模块 githubAccount\.ts

- verifyPat：校验 PAT 有效性

- getLocalAccountList：读取本地账号列表

- addAccount：新增 GitHub 账号

- editAccount：修改账号备注/标签

- deleteAccount：删除账号

- exportAccounts：导出加密账号配置

- importAccounts：导入账号配置

### 6\.2 仓库模块 githubRepo\.ts

- getUserRepos：获取账号仓库列表

- createRepo：新建远程仓库

- deleteRepo：删除仓库

- getRepoSetting：获取仓库完整配置

- updateRepoBasic：修改仓库信息

- updateRepoVisibility：公私仓库切换

- getCollaborators / addCollaborator / removeCollaborator：协作者管理

### 6\.3 分支模块 githubBranch\.ts

- getBranches：获取分支列表

- createBranch：创建远程分支

- deleteBranch：删除分支

- renameBranch：重命名分支

- getBranchDiff：分支差异对比

### 6\.4 Action 模块 githubAction\.ts

- listWorkflows：获取工作流列表

- listRuns：获取执行记录

- triggerWorkflow：手动触发流水线

- cancelRun：取消运行

- rerunRun：重新运行

- getRunLogs：获取运行日志

- getWorkflowFileContent / saveWorkflowFile：在线编辑 YAML

### 6\.5 Release 模块 githubRelease\.ts

- listReleases：获取版本列表

- getReleaseDetail：版本详情

- createRelease / updateRelease / deleteRelease：版本管理

### 6\.6 文件模块 githubFile\.ts

- getFileTree：获取文件目录

- getFileContent：读取文件

- saveFile：保存文件

- deleteFile：删除文件

## 7\. Vite 开发跨域配置 vite\.config\.ts

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    proxy: {
      '/api.github.com': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api.github.com/, '')
      }
    }
  }
})
```

## 8\. 项目硬性技术约束（不可修改）

1. 全程纯前端架构，**无后端、无服务器、无 Nginx、无数据库**

2. 所有网络请求由 Vue3 前端直连 GitHub 官方 API

3. 所有账号数据、配置、缓存全部本地存储，不上传外网

4. 固定绿色主题，支持亮/暗/跟随系统三模式

5. 所有操作内置闭环，禁止跳转 GitHub 官网

6. 三端同源代码，仅 Windows 独有本地 Git 能力

## 9\. 初始化入口 main\.ts

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './assets/theme.css'
import './assets/element-vars.css'
import router from './router'
import { createPinia } from 'pinia'
import { useThemeStore } from './stores/useThemeStore'

const app = createApp(App)
app.use(ElementPlus)
app.use(createPinia())
app.use(router)

const themeStore = useThemeStore()
themeStore.initTheme()

app.mount('#app')
```

> （注：部分内容可能由 AI 生成）
