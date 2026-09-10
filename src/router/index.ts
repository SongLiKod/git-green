import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'Dashboard', component: () => import('@/pages/Dashboard/index.vue'), meta: { title: '仪表盘' } },
    { path: '/account', name: 'AccountManage', component: () => import('@/pages/AccountManage/index.vue'), meta: { title: '账号管理' } },
    { path: '/repo', name: 'RepoList', component: () => import('@/pages/RepoList/index.vue'), meta: { title: '仓库列表' } },
    { path: '/repo-setting', name: 'RepoSetting', component: () => import('@/pages/RepoSetting/index.vue'), meta: { title: '仓库设置' } },
    { path: '/branch', name: 'BranchManage', component: () => import('@/pages/BranchManage/index.vue'), meta: { title: '分支管理' } },
    { path: '/action', name: 'ActionManage', component: () => import('@/pages/ActionManage/index.vue'), meta: { title: 'Action流水线' } },
    { path: '/release', name: 'ReleaseManage', component: () => import('@/pages/ReleaseManage/index.vue'), meta: { title: 'Release管理' } },
    { path: '/file', name: 'FileManager', component: () => import('@/pages/FileManager/index.vue'), meta: { title: '文件管理' } },
    { path: '/log', name: 'LogManage', component: () => import('@/pages/LogManage/index.vue'), meta: { title: '操作日志' } },
    { path: '/settings', name: 'Settings', component: () => import('@/pages/Settings/index.vue'), meta: { title: '设置' } }
  ]
})

export default router
