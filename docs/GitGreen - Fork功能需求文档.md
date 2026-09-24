# GitGreen — Fork 功能需求文档

版本：1.0 ｜ 状态：已确认并实现（P0~P4 全量）

## 一、背景与目标

GitGreen 为三端（Web / Electron Windows / Android）同源的 GitHub 管理工具，现有仓库、分支、Issue、PR、Action、Release、文件等模块，但**缺少 Fork 能力**：`GitHubRepo` 虽有 `fork` / `forks_count` 字段却没有展示与入口，也没有派生关系、跨 Fork 比较、同步上游能力。

目标：在遵守项目硬性约束的前提下，补齐「创建 Fork → 查看派生关系 → 管理 Fork 网络 → 跨 Fork 比较/提 PR → 同步上游」的完整闭环。

## 二、硬性约束（必须遵守）

1. 无后端，全部调用 GitHub REST API
2. 凭证仅本地加密存储，绝不外发
3. 禁止跳转 GitHub 官网，所有操作在软件内闭环
4. 绿色主题三模式、桌面/移动双形态 UI
5. 三端同源：Web / Electron / Android 共用一套代码
6. 多账号常驻：Fork 目标账号可任选已绑定账号
7. 高危操作二次确认（删除 Fork、同步上游）
8. 敏感操作写 IndexedDB 操作日志

## 三、分期方案

### P0 创建 Fork（已实现）
- API：`POST /repos/{owner}/{repo}/forks`，参数 `organization` / `name` / `default_branch_only`
- 返回 202 为异步操作：每 3s 轮询 `GET /repos/{owner}/{repo}`，60s 超时
- 就绪后：刷新目标账号仓库列表 → 切到目标账号 → 选中新仓库 → 写日志
- 入口：仓库列表每行「Fork」按钮、仓库设置「Fork 到我的账号」
- 弹窗 `ForkDialog.vue`（桌面 Element Plus / 移动 Vant 双形态）：目标账号、仓库名、Fork 到组织（`GET /user/orgs` 懒加载）、仅默认分支

### P1 派生关系展示（已实现）
- `GitHubRepo` 增加 `parent` / `source` / `network_count`
- 仓库设置页「Fork 与上游」卡片：派生自 xxx、网络源、当前 Fork 数
- 仓库列表：Fork 标签、「源自 xxx」说明、Forks 计数可点

### P2 `/forks` Fork 管理页（已实现）
- 新路由 `/forks`，进侧边菜单、移动端仓库菜单、上下文栏白名单
- `GET /repos/{owner}/{repo}/forks`（sort：newest/oldest/stargazers/watchers），分页加载更多（不全量拉取）
- 行操作：进入（本账号）/ 接入（外部账号 openExternalRepo）、克隆（HTTPS/SSH + 二维码）、复制、删除自己账号下的 Fork（二次确认 + 写日志）
- 标签：我的 / 公开 / 私有

### P3 跨 Fork 比较与提 PR（已实现）
- `getBranchDiffAcross`：`GET /repos/{base}/compare/{OWNER:base...OWNER:head}`（保留 `owner:` 前缀编码）
- 分支管理页：base/head 各自选择「仓库 + 分支」两级，同网络仓库选项 = 本仓库 + 上游/源（fork 时），支持移动端选择器
- 预览 diff 文件时取「对比仓库」侧内容
- 新建 PR：head 增加「来源仓库」选择（本仓库 + 同网络 fork 前 30，可手填 `owner/repo`），跨仓库时 head 提交为 `owner:branch`
- PR 列表/详情显示跨仓库 head（`head.label`），深链 `/pull?headOwner=&headRepo=` 支持「向上游提 PR」入口

### P4 同步上游（已实现，需真机验收 A7）
- 主路径：`POST /repos/{owner}/{repo}/merge-upstream`（body：`branch`）
- 状态检查：跨网络 compare，`behind_by` = 落后上游提交数，`ahead_by` = 领先数
- 错误降级：409 冲突 → 引导「向上游提 PR」或 Electron 本地 Git；404 → 提示接口不可用走跨仓库 PR / 本地 Git；422 → 参数或分支状态不合法
- 高危二次确认 + 写日志

## 四、错误映射约定

| 码 | 含义 |
| --- | --- |
| 404 | 源仓库不存在/不可读，或目标账号无读取权限 |
| 403 | 源仓库禁止 Fork / 权限不足 / 限流 |
| 409 | 同步上游存在冲突（request.ts 新增该码映射） |
| 422 | 参数不合法 / 该账号已存在同名 Fork |

## 五、改动清单

新增：
- `src/api/githubFork.ts`
- `src/components/ForkDialog.vue`
- `src/pages/ForkManage/index.vue`

修改：
- `src/api/request.ts`（409 映射）
- `src/api/githubRepo.ts`（parent/source/network_count）
- `src/api/githubBranch.ts`（getBranchDiffAcross）
- `src/api/githubPullRequest.ts`（head.label/repo）
- `src/stores/useRepoStore.ts`（forkRepo/waitRepoReady）
- `src/pages/RepoList/index.vue`、`RepoSetting/index.vue`、`BranchManage/index.vue`、`PullRequestManage/index.vue`、`Dashboard/index.vue`
- `src/router/index.ts`、`src/App.vue`、`README.md`

## 六、验收标准

- A1 Fork 成功后自动切目标账号并选中新仓库，且写入操作日志
- A2 Fork 异步 60s 内就绪可自动完成；超时给出明确提示与「刷新仓库」指引
- A3 404/403/422 错误提示符合错误映射表
- A4 仓库设置页可看到 parent/source，仓库列表 Fork 标签与「源自 xxx」正确
- A5 `/forks` 分页加载不重复、排序切换生效；删除 Fork 有二次确认并落日志
- A6 分支管理可比较上游与本仓库（`owner:branch`），diff 文件可预览
- A7 同步上游主路径在真实 fork 上验证通过（**待真机验收**）；409 冲突可降级
- A8 新建 PR 可选择来源仓库，跨仓库 head 显示为 `owner:branch`
- A9 桌面与移动双形态、三端（Web/Electron/Android）表现一致

## 七、遗留事项

1. **A7 未真机验收**：当前环境无法访问 GitHub 文档与 API，`merge-upstream` 端点需在有 PAT 的环境实测；若端点不可用，代码已按 404 分支降级到「向上游提 PR」引导。
2. Fork 管理页仅拉取第一页 30 条 + 加载更多，未做全量网络统计。
3. Dashboard「我的 Fork」按已加载仓库统计，未单独请求 API。
