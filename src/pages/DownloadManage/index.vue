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
            <div v-else-if="r.status === 'error' && r.error" class="m-sub">
              失败：{{ r.error }}
              <template v-if="r.loaded">（已下载 {{ formatSize(r.loaded) }}{{ r.size ? ' / ' + formatSize(r.size) : '' }}）</template>
            </div>
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
          <van-button
            v-else-if="r.status === 'error' && r.url"
            size="mini"
            type="primary"
            @click="resumeRecord(r)"
          >{{ r.loaded ? '继续下载' : '重新下载' }}</van-button>
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
              <span v-else-if="row.status === 'error'">
                {{ row.error || '下载失败' }}
                <template v-if="row.loaded">（已下载 {{ formatSize(row.loaded) }}{{ row.size ? ' / ' + formatSize(row.size) : '' }}）</template>
              </span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatTime(row.time) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="260">
            <template #default="{ row }">
              <template v-if="row.status === 'done'">
                <el-button v-if="row.uri" link type="primary" @click="openRecord(row)">打开</el-button>
                <el-button v-if="row.uri && isApk(row.filename)" link type="success" @click="installRecord(row)">安装</el-button>
                <el-button v-if="row.uri" link @click="shareRecord(row)">分享</el-button>
              </template>
              <el-button v-else-if="row.status === 'error' && row.url" link type="primary" @click="resumeRecord(row)">
                {{ row.loaded ? '继续下载' : '重新下载' }}
              </el-button>
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
import { useAccountStore } from '@/stores/useAccountStore'
import { useLogStore } from '@/stores/useLogStore'
import { listDownloads, removeDownload, saveDownload } from '@/utils/db'
import type { DownloadRecord } from '@/utils/db'
import { executeDownload, saveBlob, isDownloadActive } from '@/utils/downloader'
import {
  useIsMobile,
  isAndroidClient,
  cancelNativeDownload,
  openNativeFile,
  installNativeApk,
  openNativeDownloadDir,
  shareNativeFile,
  guessMimeByName,
  isApkFile,
  setNativeMessageHandler
} from '@/utils/platform'

const accountStore = useAccountStore()
const logStore = useLogStore()

const isMobile = useIsMobile()
const isAndroid = computed(() => isAndroidClient())

const records = ref<DownloadRecord[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  const all = await listDownloads()
  // 上次会话遗留的「下载中」按中断处理（本会话仍在跑的不动），带 url 的可一键继续
  records.value = all.map(r =>
    r.status === 'downloading' && !isDownloadActive(r.id)
      ? { ...r, status: 'error' as const, error: r.error || (r.url ? '已中断，可继续下载' : '已中断') }
      : { ...r }
  )
  loading.value = false
}

/** 记录来自哪个模块 → 写日志时的归类 */
function moduleOf(r: DownloadRecord): string {
  if (r.id.startsWith('file-')) return 'file'
  if (r.id.startsWith('artifact-')) return 'action'
  return 'release'
}

/**
 * 继续下载：复用记录 id，Android 原生按「地址+文件名」找回分片，
 * Web/Windows 从 IndexedDB 分片接着拉。新任务与续传共用同一段执行逻辑。
 */
async function resumeRecord(r: DownloadRecord) {
  if (!r.url || r.status === 'downloading') return
  const pat = await accountStore.getPat(r.accountId)
  if (!pat) return
  r.status = 'downloading'
  r.error = undefined
  await saveDownload({ ...r })

  await executeDownload(
    { id: r.id, url: r.url, filename: r.filename, accept: r.accept, size: r.size, accountId: r.accountId },
    pat,
    {
      onProgress: (loaded, total, percent) => {
        r.loaded = loaded
        r.percent = percent
        if (total && !r.size) r.size = total
      },
      onDone: info => {
        r.status = 'done'
        r.percent = 100
        r.error = undefined
        if (info.blob) {
          saveBlob(info.blob, r.filename)
          r.path = '浏览器默认下载目录'
        } else {
          r.path = info.path
          r.uri = info.uri
        }
        if (info.total && !r.size) r.size = info.total
        void saveDownload({ ...r })
        ElMessage.success(info.path ? `${r.filename} 已保存到 ${info.path}` : `${r.filename} 下载完成`)
        logStore.write({ module: moduleOf(r), action: '继续下载', detail: r.filename, level: 'success' })
      },
      onError: (msg, partial) => {
        r.status = 'error'
        r.error = msg
        if (partial) {
          r.loaded = partial.loaded
          r.percent = partial.total > 0 ? Math.min(99, Math.round((partial.loaded / partial.total) * 100)) : r.percent
          if (partial.total && !r.size) r.size = partial.total
        }
        void saveDownload({ ...r })
        ElMessage.error(`下载失败：${msg}`)
        logStore.write({ module: moduleOf(r), action: '继续下载', detail: `${r.filename} 下载失败：${msg}`, level: 'error' })
      }
    }
  )
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
  // 正在跑的原生下载先取消，避免删除后仍继续写盘
  if (r.status === 'downloading') cancelNativeDownload(r.id)
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
