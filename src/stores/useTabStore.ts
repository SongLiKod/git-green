/**
 * 多标签页状态（桌面端）：页签列表、keep-alive 缓存名单、重启恢复
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface AppTab {
  path: string
  name: string
  title: string
}

const TABS_KEY = 'gitgreen_tabs'

export const useTabStore = defineStore('tab', () => {
  const tabs = ref<AppTab[]>([])
  const lastActive = ref('')

  const cachedNames = ref<string[]>([
    'Dashboard',
    'AccountManage',
    'RepoList',
    'RepoSetting',
    'BranchManage',
    'CommitHistory',
    'ActionManage',
    'ReleaseManage',
    'FileManager',
    'IssueManage',
    'PullRequestManage',
    'LogManage',
    'Settings'
  ])

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(TABS_KEY) || '{"tabs":[],"last":""}')
      tabs.value = Array.isArray(saved.tabs) ? saved.tabs : []
      lastActive.value = saved.last || ''
    } catch {
      tabs.value = []
    }
  }

  function persist() {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: tabs.value, last: lastActive.value }))
  }

  function open(tab: AppTab) {
    const exists = tabs.value.find(t => t.path === tab.path)
    if (exists) {
      exists.title = tab.title
    } else {
      tabs.value.push(tab)
    }
    lastActive.value = tab.path
    persist()
  }

  /** 关闭页签，返回应跳转的相邻页签路径 */
  function remove(path: string): string | null {
    const idx = tabs.value.findIndex(t => t.path === path)
    if (idx < 0) return null
    tabs.value.splice(idx, 1)
    const neighbor = tabs.value[Math.min(idx, tabs.value.length - 1)]
    persist()
    return neighbor ? neighbor.path : null
  }

  function setActive(path: string) {
    lastActive.value = path
    persist()
  }

  load()
  return { tabs, lastActive, cachedNames, open, remove, setActive }
})
