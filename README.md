# GitGreen

纯前端三端（Web / Windows Electron / Android WebView）多 GitHub 账号一站式管理工具。
所有 GitHub PAT 凭证仅在本机加密存储，不经过任何自建后端服务器。

---

## 一、三端形态

| 端 | 载体 | 能力 |
| --- | --- | --- |
| Web 网页端 | 浏览器（hash 路由） | 全部远程 GitHub 管理能力，窄屏（≤768px）自动切换移动形态 UI |
| Windows 客户端 | Electron | 在 Web 能力之上，通过 NodeJS 子进程额外提供**本地 Git 能力**（`git:exec`）与系统文件对话框（保存/打开/目录选择） |
| Android 客户端 | WebView（原生壳） | 复用同一套前端代码；下载由系统 `DownloadManager` 接管（后台断点续传），支持系统分享键 |

平台识别逻辑见 `src/utils/platform.ts`：
- `window.electronAPI` 存在 → Windows 客户端
- `window.AndroidBridge` 或 UA 含 `android` → Android 客户端
- 否则 → Web 端

移动形态 UI（Vant）判定：Android 客户端 **或** 屏幕宽度 ≤768px；桌面形态 UI（Element Plus）用于其余情况。

## 二、功能清单

| 路由 | 页面 | 主要功能 |
| --- | --- | --- |
| `/dashboard` | 仪表盘 | 当前账号/仓库概览、数据统计、快捷入口 |
| `/account` | 账号管理 | 多账号常驻：添加（PAT 校验→本地加密）、编辑备注/标签/分组/SSH主机、更新 PAT、状态检测（正常/过期/失效）、删除、**导入/导出加密配置备份**、SSH 公钥管理 |
| `/repo` | 仓库列表 | 按账号树展开仓库、置顶/收藏/自定义分组、跨账号全局搜索、新建/删除远程仓库 |
| `/repo-setting` | 仓库设置 | 基本信息、可见性、功能开关、协作者管理 |
| `/branch` | 分支管理 | 分支增删改、分支差异对比（文件级 diff + 提交记录）、分支保护规则 |
| `/commits` | 提交历史 | 提交列表、改动文件 diff、检索 |
| `/action` | Action 流水线 | workflows、运行记录（含分支列）、手动触发（解析 workflow inputs）、取消/重跑/日志下载、仓库 Variables/Secrets 管理（RSA 公钥加密写入）、产物与 Check 状态 |
| `/release` | Release 管理 | 列表/新建/编辑/删除，带进度与断点续传的资产下载 |
| `/file` | 文件管理 | 在线浏览/编辑/新增/删除（Contents API 直提远程仓库）、图片与源文件预览 |
| `/issue` | Issue 管理 | 列表（状态筛选、标签多选、最新关联提交列）、详情/评论、**Markdown 编辑器与渲染**、**仓库标签下拉管理（含 × 删除标签）** |
| `/pull` | Pull Request | 列表、详情/评论（Markdown）、文件 diff、审核（RECOMMEND 自动寻找有写权限账号代审）、合并、关闭 |
| `/log` | 操作日志 | 本地留痕、模块/级别过滤、导出、按保留天数自动清理 |
| `/settings` | 设置 | 主题（浅色/深色/跟随系统）、单页/多页签模式、自动同步与巡检、请求并发/超时/重试、**应用锁（PIN、口令加固、空闲/失焦自动锁定、邮箱验证码重置口令）**、备份/还原/危险操作 |

### Issue 功能细节
- 新建/编辑：标题、**Markdown 描述编辑器**（工具栏 + 编辑/预览切换 + Ctrl+Enter 快捷提交，编辑弹窗支持全屏并自适应撑满）、**标签多选组件**（可选仓库已有标签、输入回车可新建；下拉每一项带 `×` 就地删除仓库标签并同步清理已选项）
- 详情：Markdown 渲染正文与评论、关联提交（timeline 提取 referenced/committed 提交，点击可打开提交详情弹窗）
- 列表新增"关联提交"列：自动取每个 issue 时间线中**最新关联提交**的短 SHA，点击打开与该处一致的提交详情弹窗；无关联则留空

## 三、技术栈

- **框架**：Vue 3（`<script setup>` + TypeScript）、Vue Router（hash）、Pinia
- **UI**：Element Plus（桌面形态）、Vant 4（移动形态）、双主题 CSS 变量
- **构建**：Vite 5 + vue-tsc；桌面壳 Electron；移动壳 Android（WebView + `MainActivity`）
- **HTTP**：axios（统一错误码封装、并发门闩、指数退避重试）
- **Markdown**：markdown-it（本地解析，禁用原始 HTML 防 XSS）
- **加密**：Web Crypto `AES-256-CBC` + `PBKDF2`；GitHub Secrets 用仓库 RSA 公钥（libsodium-compatible WebCrypto）加密（`sealSecret`）

## 四、目录结构

```
├─ android/                 # Android 壳工程（app/build.gradle 承载 APK 版本号）
├─ electron/                # Electron 主进程（本地 Git、文件对话框、CORS 注入、gitgreen:// 协议）
├─ scripts/
│  ├─ copy-dist.js          # 构建后把 dist 复制进 android 壳 assets/dist
│  └─ sync-android-version.js  # 从 package.json 同步 Android versionName/versionCode
├─ src/
│  ├─ api/                  # GitHub REST API 封装（见下）
│  ├─ components/           # 可复用组件
│  ├─ pages/                # 各功能页面（桌面/移动双形态 UI）
│  ├─ router/
│  ├─ stores/               # Pinia 状态
│  ├─ types/
│  └─ utils/                # 平台/加密/日志库/锁/邮箱/Markdown 工具
├─ dist/                    # Web/Electron 构建产物
└─ package.json
```

### 核心组件
- `MdEditor.vue`：Markdown 编辑器（工具栏插入语法、编辑/预览、自动增高、`fill` 全屏撑满模式）
- `MdRender.vue`：Markdown 渲染器（链接新窗口、代码块/表格/任务列表样式，禁用 HTML）
- `LabelSelect.vue`：标签多选 `el-select`（可选已有标签、回车新建、每项 `×`，`@remove` 回调用例自行处理删除）
- `FileDiffList.vue` / `SourceFilePreview.vue`：提交/PR 文件 diff 与源文件预览
- `AppLock.vue` / `QrDialog.vue` / `ThemeSwitch.vue`：应用锁解锁 UI、二维码、主题切换

### API 层（`src/api`）
- `request.ts`：axios 实例 + 统一返回 `ApiResult`（200/401/403/422/500）、**并发门闩**（默认为 4，可平滑扩容到 60 档，配置接管）、可选指数退避重试、路径分段编码 `encPath`、GitHub GET 防缓存时间戳
- `githubAccount.ts`：账号本地加密存取、PAT 校验（区分过期/失效）、导入导出（含主密钥材料）
- `githubRepo.ts` / `githubBranch.ts` / `githubCommit.ts`：仓库、分支（保护规则、diff 对比）、提交
- `githubIssue.ts`：Issue、评论、时间线（关联提交）、仓库标签（列表/删除）、提交详情
- `githubPullRequest.ts`：PR、文件、审核、合并、关闭
- `githubAction.ts`：workflow/run/jobs/logs、仓库变量与密钥（RSA 密封）、产物、Check 注解
- `githubRelease.ts`：Release 与**断点续传下载**（下载进度入库）
- `githubFile.ts`：Contents API 树/内容/原始 Base64/Blob 兜底、在线增改删
- `githubSsh.ts`：SSH 公钥管理

## 五、安全体系（全部本地）

- **主密钥（MK）**：随机 32 字节，`AES-256-CBC` 包装后存本机
  - 日常：用设备密钥包装（`PBKDF2` 固定口令+本地盐派生）
  - **口令加固**：改用 PIN 派生密钥包装 MK；锁定态内存无 MK，任何数据不可解；忘记口令则数据不可恢复
- **PAT 加密**：`encryptPAT/decryptPAT`，仅在运行时解密进内存使用，绝不外传；旧版数据启动自动迁移到 MK 加密
- **应用锁**（`lockService.ts`）：PIN 口令 + 失败次数冷却 + 空闲/失焦/后台自动锁定 + 邮箱验证码重置（EmailJS，用户显式配置，无自建后端）
- **备份还原**（`db.ts`）：可选手工保管含密钥材料（salt+MK 包装+PIN 盐），跨设备还原后仍可解出凭证；可选不含凭证的分级备份
- **操作留痕**：所有敏感操作写 IndexedDB 操作日志（模块/动作/级别）

## 六、数据存储

- `localStorage`（本地端加密不在此列）：`gitgreen_settings`（设置）、`gitgreen_repo_meta`（仓库收藏/置顶/分组）、`gitgreen_accounts`（账号+密文 PAT）、`gitgreen_lock`/`gitgreen_pin_hash`（锁）、`gitgreen_crypto_*`（密钥材料）、`gitgreen_tabs`（多页签）
- `IndexedDB`（`gitgreen`）：操作日志、下载记录
- 全程无自建服务器；仅直连 `api.github.com` 及 GitHub 资产域名

## 七、开发与构建

```bash
npm install
npm run dev               # Web 开发（Vite）
npm run build             # 类型检查 + 产物（vue-tsc --noEmit && vite build）

# Windows 客户端
npm run electron:start    # 开发启动（需 VITE_DEV_SERVER_URL）
npm run electron:build    # 打包 NSIS 安装包
npm run electron:portable # 打包便携版

# Android APK
npm run apk:build         # 构建 dist → 复制进 android 壳 → gradle assembleDebug/Release
```

### Android 版本号同步
APK 安装界面显示的版本来自 `android/app/build.gradle` 的 `versionName/versionCode`，与 `package.json` 无关。
`apk:build` 会先执行 `scripts/sync-android-version.js`：从 `package.json` 读取版本写入 gradle，
`versionCode` 按 `主×10000 + 次×100 + 补丁` 推导（如 `1.3.0` → `10300`）。

## 八、关键配置项（`useSettingsStore`）

请求并发上限、请求超时、失败重试次数（运行时写入 `requestRuntime`，重启保留）、操作日志保留天数、自动巡检间隔、主题、页面模式等；配置变更即时应用到运行时。

---

> 说明：本工具为开发者自用型工具，请妥善保管 PAT 权限与导出的备份文件；开启「口令加固」后请务必留存口令或配置邮箱重置，否则加密数据无法恢复。