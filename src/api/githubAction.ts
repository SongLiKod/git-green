import service, { auth, encPath, type ApiResult } from './request'
import { utf8ToBase64 } from '@/utils/crypto'

export interface Workflow {
  id: number
  name: string
  path: string
  state: string
  created_at: string
  html_url: string
}

export interface WorkflowRun {
  id: number
  name: string
  display_title: string
  status: 'queued' | 'in_progress' | 'completed' | string
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | 'timed_out' | 'action_required' | null
  event: string
  branch: string
  head_sha: string
  run_number: number
  created_at: string
  updated_at: string
}

export interface RunJob {
  id: number
  run_id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string
  completed_at: string | null
}

/** 获取所有 Workflow 工作流列表 */
export function listWorkflows(token: string, owner: string, repo: string): Promise<ApiResult<{ workflows: Workflow[]; total_count: number }>> {
  return service.get(`/repos/${owner}/${repo}/actions/workflows?per_page=100`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<{ workflows: Workflow[]; total_count: number }>>
}

/** 获取执行记录（全部运行 或 指定工作流运行） */
export function listRuns(
  token: string,
  owner: string,
  repo: string,
  workflowId?: number,
  page = 1
): Promise<ApiResult<{ workflow_runs: WorkflowRun[]; total_count: number }>> {
  const base = workflowId
    ? `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`
    : `/repos/${owner}/${repo}/actions/runs`
  return service.get(`${base}?per_page=30&page=${page}&exclude_pull_requests=true`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<{ workflow_runs: WorkflowRun[]; total_count: number }>>
}

/** 手动触发流水线（workflow_dispatch） */
export function triggerWorkflow(
  token: string,
  owner: string,
  repo: string,
  workflowId: number,
  ref: string
): Promise<ApiResult> {
  return service.post(
    `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
    { ref },
    { headers: auth(token) }
  ) as unknown as Promise<ApiResult>
}

/** 取消运行中的流水线 */
export function cancelRun(token: string, owner: string, repo: string, runId: number): Promise<ApiResult> {
  return service.post(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, {}, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

/** 重新运行历史流水线 */
export function rerunRun(token: string, owner: string, repo: string, runId: number): Promise<ApiResult> {
  return service.post(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {}, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult>
}

/** 获取某次运行的全部 Job */
export function listRunJobs(
  token: string,
  owner: string,
  repo: string,
  runId: number
): Promise<ApiResult<{ jobs: RunJob[]; total_count: number }>> {
  return service.get(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<{ jobs: RunJob[]; total_count: number }>>
}

/**
 * 获取运行日志：逐 Job 拉取原始日志文本并合并，
 * 页面轮询调用即可实时流式查看运行日志。
 */
export async function getRunLogs(
  token: string,
  owner: string,
  repo: string,
  runId: number
): Promise<ApiResult<string>> {
  const jobsRes = await listRunJobs(token, owner, repo, runId)
  if (jobsRes.code !== 200 || !jobsRes.data) return { code: jobsRes.code, msg: jobsRes.msg }
  const headers = { ...auth(token), Accept: 'application/vnd.github+json' }
  let text = ''
  for (const job of jobsRes.data.jobs) {
    const logRes = (await service.get(`/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`, {
      headers,
      transformResponse: [(d: any) => d]
    })) as unknown as ApiResult<string>
    if (logRes.code === 200) {
      text += `\n===== Job #${job.id} ${job.name} [${job.status}${job.conclusion ? '/' + job.conclusion : ''}] =====\n`
      text += typeof logRes.data === 'string' ? logRes.data : ''
      text += '\n'
    }
  }
  return { code: 200, msg: 'success', data: text }
}

/** 读取 Workflow yml 文件内容（在线编辑前加载） */
export function getWorkflowFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<ApiResult<{ content: string | null; sha: string }>> {
  return service.get(`/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`, {
    headers: auth(token)
  }) as unknown as Promise<ApiResult<{ content: string | null; sha: string }>>
}

/** 保存 Workflow yml 文件（直接提交到远程仓库） */
export function saveWorkflowFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string,
  message: string,
  branch: string
): Promise<ApiResult> {
  return service.put(
    `/repos/${owner}/${repo}/contents/${encPath(path)}`,
    { message, content: utf8ToBase64(content), sha, branch },
    { headers: auth(token) }
  ) as unknown as Promise<ApiResult>
}
