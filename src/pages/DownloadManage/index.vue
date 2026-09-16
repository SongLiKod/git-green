<template>
  <div class="page">
    <!-- 移动端形态（Vant） -->
    <template v-if="isMobile">
      <div class="m-toolbar">
        <van-button size="small" type="primary" @click="load">刷新</van-button>
        <van-button v-if="isAndroid" size="small" plain @click="openDir">打开下载目录</van-button>
      </div>
      <van-empty v-if="records.length === 0" description="暂无下载记录" />
      <div v-for="r in records" :key="r.id" class="m-card">
        <div class="m-card-head">
          <div class="m-card-title">
            <div class="t">{{ r.filename }}</div>
            <div class="m-sub">{{ statusText(r.status) }} · {{ formatSize(r.size) }} · {{ formatTime(r.time) }}</div>
            <div v-if="r.status === 'done' && r.path" class="m-sub">已保存到 {{ r.path }}</div>
            <div v-else-if="r.status === 'error' && r.error" class="m-sub">失败：{{ r.error }}</div>
          </div>
          <van-tag :type="r.status === 'done' ? 'success' : r.status === 'error' ? 'danger' : 'primary'">{{ statusText(r.status) }}</van-tag>
        </div>
        <div class="m-actions">
          <template v-if="r.status === 'done'">
            <van-button v-if="r.uri" size="mini" type="primary" plain @click="openRecord(r)">打开文件</van-button>
            <van-button v-if="r.uri && isApk(r.filename)" size="mini" type="success" @click="installRecord(r)">立即安装</van-button>
            <van-button v-if="r.uri" size="mini" plain @click="shareRecord(r)">分享</van-button>
            <van-button v-if="isAndroid" size="mini" plain @click="openDir">下载目录</van-button>
          </template>
          <van-button v-else-if="!isAndroid" size="mini" plain @click="openDir">下载目录</van-button>
          <van-button size="mini" type="danger" plain @click="removeRecord(r)">删除记录</van-button>
        </div>
      </div>
    </template>

    <!-- 桌面形态（Element Plus） -->
    <template v-else>
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>下载记录（{{ records.length }}）</span>
            <div>
              <el-button @click="load">刷新</el-button>
            </div>
          </div>
        </template>
        <el-table :data="records" border stripe v-loading="loading">
          <el-table-column label="文件" min-width="220">
            <template #default="{ row }">
              <span class="mono">{{ row.filename }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 'done' ? 'success' : row.status === 'error' ? 'danger' : 'primary'">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="大小" width="100">
            <template #default="{ row }">{{ formatSize(row.size) }}</template>
          </el-table-column>
          <el-table-column label="保存位置" min-width="240">
            <template #default="{ row }">
              <span v-if="row.status === 'done'">{{ row.path || '浏览器默认下载目录' }}</span>
              <span v-else-if="row.status === 'error'">{{ row.error || '下载失败' }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatTime(row.time) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <template v-if="row.status === 'done'">
                <el-button v-if="row.uri" link type="primary" @click="openRecord(row)">打开</el-button>
                <el-button v-if="row.uri && isApk(row.filename)" link type="success" @click="installRecord(row)">安装</el-button>
                <el-button v-if="row.uri" link @click="shareRecord(row)">分享</el-button>
              </template>
              <el-button link type="danger" @click="removeRecord(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="records.length === 0" description="暂无下载记录" :image-size="60" />
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'DownloadManage' })
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listDownloads, removeDownload } from '@/utils/db'
import type { DownloadRecord } from '@/utils/db'
import {
  useIsMobile,
  isAndroidClient,
  openNativeFile,
  installNativeApk,
  openNativeDownloadDir,
  shareNativeFile,
  guessMimeByName,
  isApkFile,
  setNativeMessageHandler
} from '@/utils/platform'

const isMobile = useIsMobile()
const isAndroid = computed(() => isAndroidClient())

const records = ref<DownloadRecord[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  records.value = await listDownloads()
  loading.value = false
}

function statusText(status: DownloadRecord['status']): string {
  if (status === 'done') return '已完成'
  if (status === 'error') return '失败'
  return '下载中'
}

function isApk(name: string): boolean {
  return isApkFile(name)
}

function formatSize(size?: number): string {
  if (!size || size <= 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(time?: number): string {
  return time ? new Date(time).toLocaleString() : '-'
}

function openUri(uri: string) {
  if (openNativeFile(uri)) return
  ElMessage.info('当前环境不支持直接打开，请在系统下载目录查看')
}

function openRecord(r: DownloadRecord) {
  if (!r.uri) {
    ElMessage.info('该记录没有文件地址，请到系统下载目录查看')
    return
  }
  openUri(r.uri)
}

function installRecord(r: DownloadRecord) {
  if (!r.uri) {
    ElMessage.info('该记录没有文件地址，请到系统下载目录查看')
    return
  }
  if (!installNativeApk(r.uri)) ElMessage.info('当前环境不支持直接安装')
}

function shareRecord(r: DownloadRecord) {
  if (!r.uri) return
  if (!shareNativeFile(r.uri, guessMimeByName(r.filename))) ElMessage.info('当前环境不支持分享')
}

function openDir() {
  if (!openNativeDownloadDir()) ElMessage.info('请到系统文件管理的下载目录查看')
}

async function removeRecord(r: DownloadRecord) {
  records.value = records.value.filter(x => x.id !== r.id)
  await removeDownload(r.id)
  ElMessage.success('记录已删除')
}

onMounted(() => {
  load()
  setNativeMessageHandler(msg => ElMessage.warning(msg))
})
onBeforeUnmount(() => setNativeMessageHandler(null))
</script>

<style scoped>
.mono {
  font-family: Consolas, monospace;
  font-weight: 600;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
