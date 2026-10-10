<template>
  <!-- 桌面形态（Element Plus）：没输入关键词、也没搜过 → 不渲染面板，避免常驻占屏 -->
  <el-card v-if="showPanel && !isMobile" shadow="never" class="gs-card">
    <template #header>
      <div class="gs-header">
        <span class="gs-title">
          GitHub 全站搜索：
          <b v-if="appliedKeyword">{{ appliedKeyword }}</b>
          <span v-else class="gs-placeholder">输入关键词模糊搜索 GitHub 上的仓库</span>
          <span v-if="total" class="gs-count">共 {{ total }} 个结果</span>
        </span>
        <div class="gs-ops">
          <el-select v-model="sort" size="small" style="width: 116px" @change="fetch(1)">
            <el-option label="按相关度" value="bestmatch" />
            <el-option label="按 Stars" value="stars" />
            <el-option label="按更新时间" value="updated" />
          </el-select>
          <el-button size="small" :loading="loading" :disabled="!appliedKeyword" @click="fetch(page)">重新搜索</el-button>
          <el-button size="small" text type="danger" @click="emit('close')">退出搜索</el-button>
        </div>
      </div>
    </template>

    <div class="gs-hint">结果不会自动加入任何列表：「进入查看」仅预览功能页，点「加入外部」才写入外部列表，「Fork」可直接 Fork 到你的账号</div>
    <el-alert v-if="errMsg" type="warning" :closable="false" :title="errMsg" style="margin-bottom: 10px" />
    <el-table ref="tableRef" :data="results" v-loading="loading" size="small" height="340">
      <el-table-column label="仓库" min-width="240">
        <template #default="{ row }">
          <div class="gs-name">
            <span class="gs-full">{{ row.full_name }}</span>
            <el-tag size="small" type="success">公开</el-tag>
            <el-tag v-if="row.fork" size="small" type="primary">Fork</el-tag>
            <el-tag v-if="row.archived" size="small" type="info">已归档</el-tag>
            <el-tag v-if="repoStore.isAdHocRepo(row.full_name)" size="small" type="info" effect="plain">外部</el-tag>
          </div>
          <div class="gs-desc">{{ row.description || '暂无简介' }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="language" label="语言" width="96">
        <template #default="{ row }">{{ row.language || '-' }}</template>
      </el-table-column>
      <el-table-column label="Stars" width="80">
        <template #default="{ row }">{{ row.stargazers_count }}</template>
      </el-table-column>
      <el-table-column label="Forks" width="80">
        <template #default="{ row }">{{ row.forks_count }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="118">
        <template #default="{ row }">{{ new Date(row.updated_at).toLocaleDateString() }}</template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="emit('enter', row)">进入查看</el-button>
          <el-button
            link
            :type="inList(row) ? 'info' : 'success'"
            :disabled="inList(row)"
            @click="add(row)"
          >{{ inList(row) ? '已在列表' : '加入外部' }}</el-button>
          <el-button link @click="emit('fork', row)">Fork</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span class="gs-empty">{{ emptyText }}</span>
      </template>
    </el-table>
    <div v-if="total > 0" class="gs-pager">
      <el-button size="small" :disabled="page <= 1 || loading" @click="fetch(page - 1)">上一页</el-button>
      <span class="gs-page">第 {{ page }} / {{ maxPage }} 页</span>
      <el-button size="small" :disabled="page >= maxPage || loading" @click="fetch(page + 1)">下一页</el-button>
    </div>
  </el-card>

  <!-- 移动端形态（Vant） -->
  <div v-else-if="showPanel" ref="mobileRef" class="gs-mobile">
    <div class="gs-header">
      <span class="gs-title">
        GitHub 全站搜索：
        <b v-if="appliedKeyword">{{ appliedKeyword }}</b>
        <span v-else class="gs-placeholder">输入关键词模糊搜索</span>
        <span v-if="total" class="gs-count">共 {{ total }} 个</span>
      </span>
      <div class="gs-ops">
        <van-button size="mini" plain @click="cycleSort">排序：{{ SORT_LABELS[sort] }}</van-button>
        <van-button size="mini" plain :loading="loading" :disabled="!appliedKeyword" @click="fetch(page)">重搜</van-button>
        <van-button size="mini" plain type="danger" @click="emit('close')">退出</van-button>
      </div>
    </div>
    <div class="gs-hint">查看不入列表，点「加入外部」才加入，也可直接 Fork</div>
    <div v-if="errMsg" class="gs-err">{{ errMsg }}</div>
    <van-loading v-if="loading" class="gs-loading" size="24px" vertical>正在搜索 GitHub…</van-loading>
    <template v-else>
      <van-empty v-if="results.length === 0" :description="emptyText" :image-size="70" />
      <div v-for="row in results" :key="row.full_name" class="m-card gs-item">
        <div class="m-card-head">
          <div class="m-card-title">
            <div class="t">{{ row.full_name }}</div>
            <div class="m-sub">{{ row.description || '暂无简介' }}</div>
          </div>
          <div class="m-tags" style="margin-top: 0">
            <van-tag type="success">公开</van-tag>
            <van-tag v-if="row.fork" type="primary">Fork</van-tag>
            <van-tag v-if="repoStore.isAdHocRepo(row.full_name)" type="default">外部</van-tag>
          </div>
        </div>
        <div class="m-meta">
          <span>{{ row.language || '-' }}</span>
          <span>★ {{ row.stargazers_count }}</span>
          <span>Fork {{ row.forks_count }}</span>
          <span>{{ new Date(row.updated_at).toLocaleDateString() }}</span>
        </div>
        <div class="m-actions">
          <van-button size="mini" type="primary" plain @click="emit('enter', row)">进入查看</van-button>
          <van-button
            size="mini"
            :type="inList(row) ? 'default' : 'success'"
            :disabled="inList(row)"
            plain
            @click="add(row)"
          >{{ inList(row) ? '已在列表' : '加入外部' }}</van-button>
          <van-button size="mini" plain @click="emit('fork', row)">Fork</van-button>
        </div>
      </div>
      <div v-if="total > 0" class="gs-pager">
        <van-button size="small" plain :disabled="page <= 1 || loading" @click="fetch(page - 1)">上一页</van-button>
        <span class="gs-page">第 {{ page }} / {{ maxPage }} 页</span>
        <van-button size="small" plain :disabled="page >= maxPage || loading" @click="fetch(page + 1)">下一页</van-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'GithubSearchResults' })
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAccountStore } from '@/stores/useAccountStore'
import { useRepoStore } from '@/stores/useRepoStore'
import { searchRepos, type GitHubRepo, type RepoSearchSort } from '@/api/githubRepo'
import { useIsMobile } from '@/utils/platform'

const props = defineProps<{ keyword: string }>()
const emit = defineEmits<{
  (e: 'enter', repo: GitHubRepo): void
  (e: 'fork', repo: GitHubRepo): void
  /** 退出全站搜索（父级关掉搜索范围并清空关键词） */
  (e: 'close'): void
}>()

const accountStore = useAccountStore()
const repoStore = useRepoStore()
const isMobile = useIsMobile()

const PER_PAGE = 20
/** GitHub 搜索最多返回前 1000 条，页码上限按 per_page 折算 */
const MAX_PAGE = Math.max(1, Math.floor(1000 / PER_PAGE))

const SORT_LABELS: Record<RepoSearchSort, string> = {
  bestmatch: '相关度',
  stars: 'Stars',
  forks: 'Forks',
  updated: '更新时间'
}

const results = ref<GitHubRepo[]>([])
const total = ref(0)
const page = ref(1)
const sort = ref<RepoSearchSort>('bestmatch')
const loading = ref(false)
const errMsg = ref('')
/** 实际发起搜索的关键词（输入变化有防抖，展示以生效值为准） */
const appliedKeyword = ref('')
/** 面板显隐：未输入关键词且从未搜过时完全不渲染；输入即出现、清空即消失 */
const showPanel = computed(() => !!props.keyword.trim() || !!appliedKeyword.value)
const tableRef = ref<any>()
const mobileRef = ref<HTMLElement>()

/** 翻页/重搜后把列表复位到顶部：桌面端是表格内部滚动，移动端把整个面板滚回顶端 */
function resetScroll() {
  void nextTick(() => {
    if (isMobile.value) {
      mobileRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const wrap: HTMLElement | null =
      tableRef.value?.$el?.querySelector('.el-scrollbar__wrap') ||
      tableRef.value?.$el?.querySelector('.el-table__body-wrapper')
    if (wrap) wrap.scrollTop = 0
  })
}
let seq = 0
let debounceTimer: number | undefined

const maxPage = computed(() => Math.min(MAX_PAGE, Math.max(1, Math.ceil(total.value / PER_PAGE))))

const emptyText = computed(() => {
  if (loading.value) return '正在搜索 GitHub…'
  if (!props.keyword.trim()) return '输入关键词即可模糊搜索 GitHub 上的仓库'
  return `未找到与「${appliedKeyword.value || props.keyword.trim()}」匹配的仓库`
})

/** 是否已在账号列表或外部列表中（在列表则无需再「加入外部」） */
function inList(repo: GitHubRepo): boolean {
  return !!repoStore.findAccountIdByRepo(repo.full_name)
}

async function add(repo: GitHubRepo) {
  await repoStore.addAdHocRepo(repo)
}

/** 移动端排序切换（点按循环：相关度 → Stars → 更新时间） */
function cycleSort() {
  const order: RepoSearchSort[] = ['bestmatch', 'stars', 'updated']
  sort.value = order[(order.indexOf(sort.value) + 1) % order.length]
  fetch(1)
}

/** 拉取 GitHub 全站搜索结果（seq 丢弃过期响应，避免快速输入时旧结果覆盖新结果） */
async function fetch(pageNo: number) {
  const kw = props.keyword.trim()
  appliedKeyword.value = kw
  if (!kw) {
    results.value = []
    total.value = 0
    page.value = 1
    errMsg.value = ''
    return
  }
  const mySeq = ++seq
  loading.value = true
  errMsg.value = ''
  try {
    // 有账号时用 PAT 搜索（限流更宽松），无账号时退回匿名搜索
    const accountId = repoStore.currentAccountId || accountStore.activeId
    const token = accountId ? await accountStore.getPat(accountId) : ''
    const res = await searchRepos(kw, {
      token: token || undefined,
      page: pageNo,
      perPage: PER_PAGE,
      sort: sort.value
    })
    if (mySeq !== seq) return
    if (res.code === 200 && res.data) {
      results.value = res.data.items || []
      total.value = res.data.total_count || 0
      page.value = pageNo
    } else {
      results.value = []
      total.value = 0
      errMsg.value =
        res.code === 403
          ? 'GitHub 搜索触发限流或权限不足，请稍后再试'
          : res.code === 422
            ? `搜索条件不合法：${res.msg}`
            : `搜索失败：${res.msg}`
    }
  } catch (e: any) {
    if (mySeq === seq) {
      results.value = []
      errMsg.value = `搜索异常：${String(e?.message || e)}`
    }
  } finally {
    if (mySeq === seq) {
      loading.value = false
      // 新一批结果渲染后复位滚动位置，避免停留在上一页的底部
      resetScroll()
    }
  }
}

/** 关键词防抖搜索（450ms） */
watch(
  () => props.keyword,
  () => {
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => fetch(1), 450)
  }
)

onMounted(() => {
  if (props.keyword.trim()) fetch(1)
})
onBeforeUnmount(() => {
  if (debounceTimer) window.clearTimeout(debounceTimer)
})
</script>

<style scoped>
.gs-card {
  margin-bottom: 14px;
}
.gs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.gs-title {
  font-size: 14px;
  color: var(--text-main);
}
.gs-title b {
  color: var(--color-primary);
}
.gs-placeholder {
  color: var(--text-secondary);
}
.gs-count {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.gs-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gs-name {
  display: flex;
  align-items: center;
  gap: 6px;
}
.gs-full {
  font-weight: 600;
}
.gs-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.gs-empty {
  color: var(--text-secondary);
}
.gs-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
}
.gs-page {
  font-size: 12px;
  color: var(--text-secondary);
}
.gs-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 18px;
  margin: 4px 0 10px;
}
.gs-err {
  margin: 8px 12px 0;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.12);
}
.gs-loading {
  padding: 24px 0;
}
/* 移动端：卡片沿用全局 .m-card，这里只做容器收敛 */
.gs-mobile {
  margin-top: 4px;
}
.gs-item {
  margin-top: 10px;
}
.gs-mobile .gs-hint {
  margin: 6px 12px 0;
}
</style>
