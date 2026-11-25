<script setup lang="ts">
/**
 * 技术雷达面板
 * ------------------------------------------------------------------
 * 一块「今天技术圈在冒什么」的看板，三层信息：
 *   1. 区间统计（上榜 / 新增 star / AI 覆盖 / 主要语言）
 *   2. 趋势柱（今日按每一轮抓取，周/月按天）
 *   3. 项目列表（AI 解读在行内，点整行用系统浏览器打开仓库）
 *
 * 数据全部来自主进程的快照聚合，这里不做计算，只做展示与切换粒度。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { TRENDING } from '@shared/constants'
import { pad2 } from '@shared/date'
import type { TrendingBar, TrendingItem, TrendingRange, TrendingState } from '@shared/types'
import { bridge } from '@/api/bridge'
import { useTrending } from '@/composables/useTrending'
import { thousands } from '@/utils/format'
import TrendingDetailDialog from './TrendingDetailDialog.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; 'open-settings': [] }>()

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const { range, view, refreshing, error, load, setRange, refresh, applyState } = useTrending()

const TABS: Array<{ value: TrendingRange; label: string }> = [
  { value: 'day', label: '今日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' }
]

const RANGE_HINT: Record<TrendingRange, string> = {
  day: '此刻榜单',
  week: '最近 7 天反复在榜',
  month: '最近 30 天反复在榜'
}

const state = computed<TrendingState | null>(() => view.value?.state ?? null)
const items = computed<TrendingItem[]>(() => view.value?.items ?? [])
const summary = computed(() => view.value?.summary ?? null)

/* ---------------- 状态胶囊 ---------------- */
const pill = computed(() => {
  const s = state.value
  if (!s) return { text: '读取中', cls: 'pill-muted' }
  if (s.running) return { text: '抓取中', cls: '' }
  if (!s.enabled) return { text: '自动抓取已关闭', cls: 'pill-muted' }
  if (s.lastError) return { text: '上一轮失败', cls: 'pill-warn' }
  return { text: `每 ${s.pollHours} 小时`, cls: '' }
})

/* ---------------- 统计格子 ---------------- */
interface StatCell {
  label: string
  value: string
  hint: string
  /** 语言名这类长文本用小一号字 */
  text?: boolean
}

const cells = computed<StatCell[]>(() => {
  const s = summary.value
  if (!s) return []
  const lang = s.languages[0]
  const ai = state.value
  const full = s.coveredDays >= s.rangeDays
  return [
    { label: '区间项目', value: String(s.repoCount), hint: `展示前 ${TRENDING.displayLimit} 个` },
    {
      label: '已解读',
      value: s.aiCount ? String(s.aiCount) : ai?.aiRunning ? '…' : '—',
      hint: ai?.aiRunning
        ? `生成中 ${ai.aiDone}/${ai.aiTotal}`
        : s.aiCount
          ? `共 ${s.aiCount} 条有介绍`
          : ai?.aiReady
            ? '马上自动补'
            : '未配置模型'
    },
    {
      // 数据覆盖度：解释「为什么周榜看着像日榜」，而不是让人以为切换坏了
      label: '数据覆盖',
      value: `${s.coveredDays}/${s.rangeDays}`,
      hint: full ? '本区间已满' : '天，会随抓取累积'
    },
    { label: '主要语言', value: lang?.name ?? '—', hint: lang ? `${lang.count} 个项目` : '暂无', text: true }
  ]
})

/** 粒度提示 + 覆盖不足时说清原因，别让人以为点了没反应 */
const rangeHint = computed(() => {
  const base = RANGE_HINT[range.value]
  const s = summary.value
  if (!s || s.coveredDays >= s.rangeDays) return base
  return `${base} · 已有 ${s.coveredDays}/${s.rangeDays} 天数据`
})

/* ---------------- 趋势柱 ---------------- */
const bars = computed(() => summary.value?.bars ?? [])
const barMax = computed(() => Math.max(1, ...bars.value.map((bar) => bar.count)))

function barHeight(bar: TrendingBar): string {
  if (!bar.count) return '0%'
  return `${Math.max(6, Math.round((bar.count / barMax.value) * 100))}%`
}

function barTitle(bar: TrendingBar): string {
  return `${bar.label} · ${bar.count} 个项目在榜`
}

const chartTitle = '在榜项目数'

/* ---------------- 时间文案 ---------------- */
function clockText(at: number): string {
  const d = new Date(at)
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const updatedText = computed(() => {
  const s = state.value
  return s?.lastOkAt ? `上次更新 ${clockText(s.lastOkAt)}` : '还没抓到过数据'
})

const nextText = computed(() => {
  const s = state.value
  if (!s) return ''
  if (!s.enabled) return '自动抓取已关闭'
  if (s.lastError) return '失败后 15 分钟重试'
  return s.nextRunAt ? `下次 ${clockText(s.nextRunAt)}` : ''
})

/* ---------------- 空状态 ---------------- */
interface EmptyState {
  title: string
  body: string
  action: 'refresh' | 'settings' | 'none'
}

const empty = computed<EmptyState | null>(() => {
  if (items.value.length) return null
  if (!view.value) {
    return error.value
      ? { title: '读取失败', body: error.value, action: 'refresh' }
      : { title: '正在读取本地快照', body: '马上就好。', action: 'none' }
  }

  const s = state.value
  if (!s) return null
  if (s.running) {
    return { title: '正在抓取 GitHub', body: '第一次抓取需要几秒钟，抓完这里会自动出现榜单。', action: 'none' }
  }
  if (s.lastError) return { title: '这次没抓到', body: s.lastError, action: 'refresh' }
  if (!s.lastOkAt) {
    return {
      title: '还没有数据',
      body: `后台每 ${s.pollHours} 小时抓一次「近 ${TRENDING.windowDays} 天创建」的新项目，也可以现在手动抓一轮。`,
      action: 'refresh'
    }
  }
  return {
    title: '这个区间还没有数据',
    body: '换个粒度看看，或者现在抓一次。快照是累积的，抓得越多统计越准。',
    action: 'refresh'
  }
})

/* ---------------- 详情弹窗 ---------------- */
const detailOpen = ref(false)
/**
 * 只记仓库名，不记项目对象：
 * 记对象的话，AI 解读后到的内容进不到弹窗里，用户会看到「正在生成」一直不动。
 * 用名字从当前列表里取，解读一落盘弹窗自己就长出来了。
 */
const activeName = ref('')
const fallbackItem = ref<TrendingItem | null>(null)

const activeItem = computed<TrendingItem | null>(() => {
  const live = items.value.find((item) => item.fullName === activeName.value)
  if (live) return live
  // 刷新后这个项目掉出榜单了，至少别让弹窗变成空白
  return fallbackItem.value
})

function openDetail(item: TrendingItem): void {
  activeName.value = item.fullName
  fallbackItem.value = item
  detailOpen.value = true
}

/* ---------------- 提示条：可以关掉，但换了新错误会再出现 ---------------- */
const dismissed = ref<Record<string, boolean>>({})

function dismiss(key: string): void {
  dismissed.value = { ...dismissed.value, [key]: true }
}

/* ---------------- AI 解读进度 ---------------- */
const progressPct = computed(() => {
  const s = state.value
  if (!s?.aiTotal) return 0
  return Math.min(100, Math.round((s.aiDone / s.aiTotal) * 100))
})

/** AI 刚跑完时留一句「完成」，几秒后自己消失 */
const aiJustFinished = ref(false)
let finishTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => state.value?.aiRunning,
  (now, before) => {
    if (before === true && now === false && (state.value?.aiTotal ?? 0) > 0) {
      aiJustFinished.value = true
      if (finishTimer) clearTimeout(finishTimer)
      finishTimer = setTimeout(() => {
        aiJustFinished.value = false
      }, 6000)
    }
  }
)

/* ---------------- 交互 ---------------- */
const LANG_COLOR: Record<string, string> = {
  TypeScript: '#7aa2ff',
  JavaScript: '#f5c26b',
  Python: '#5eead4',
  Go: '#7fd8c8',
  Rust: '#f0a07a',
  Java: '#ff8a8a',
  'C++': '#a78bfa',
  C: '#8b95a9',
  'C#': '#86efac',
  Vue: '#5eead4',
  Svelte: '#ff8a8a',
  HTML: '#f5c26b',
  CSS: '#7aa2ff',
  Shell: '#86efac',
  Ruby: '#ff8a8a',
  PHP: '#a78bfa',
  Swift: '#f0a07a',
  Kotlin: '#a78bfa',
  Zig: '#f5c26b'
}

const langColor = (name: string): string => LANG_COLOR[name] ?? '#616c81'

function scoreClass(item: TrendingItem): string {
  const score = item.insight?.score
  if (score === undefined) return ''
  return score >= 80 ? 'hot' : score >= 60 ? 'good' : ''
}

function onAction(action: EmptyState['action']): void {
  if (action === 'refresh') void refresh()
  else if (action === 'settings') emit('open-settings')
}

/* ---------------- 打开面板时自动补解读 ---------------- */
let ensureAt = 0
const ensureRuns = ref(0)

/**
 * 列表里还有没解读的项目就自动补一批。
 * 用户没理由为了看到中文介绍先去点一次「刷新」——那是维护动作，不是使用动作。
 */
function maybeEnsureInsights(): void {
  if (!open.value) return
  const s = state.value
  if (!s?.aiReady || s.running || s.aiRunning) return
  // 上一轮已经报错就别反复烧请求，等用户手动刷新或去改配置
  if (s.aiError) return
  if (!items.value.some((item) => !item.insight)) return
  if (ensureRuns.value >= 2) return
  if (Date.now() - ensureAt < 60_000) return

  ensureAt = Date.now()
  ensureRuns.value += 1
  void bridge?.trendingEnsure()
}

/* ---------------- 生命周期 ---------------- */
let reloadTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribe: (() => void) | null = null

function handleState(next: TrendingState): void {
  applyState(next)
  // 主进程每跑完一轮 / 每读懂一批都会推一次；正在看面板时顺手把新数据取回来
  if (!open.value) return
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => void load(), 400)
}

// 每次打开都刷新一次：可能距离上次打开已经过了几小时
watch(open, (visible) => {
  if (!visible) return
  ensureRuns.value = 0
  ensureAt = 0
  void load()
})

watch([open, items], () => maybeEnsureInsights())

onMounted(() => {
  unsubscribe = bridge?.onTrendingChanged(handleState) ?? null
  if (open.value) void load()
})

onUnmounted(() => {
  unsubscribe?.()
  if (reloadTimer) clearTimeout(reloadTimer)
  if (finishTimer) clearTimeout(finishTimer)
})
</script>

<template>
  <el-dialog
    v-model="open"
    width="800px"
    align-center
    append-to-body
    class="settings-dialog trending-dialog"
  >
    <template #header>
      <div class="tr-head">
        <div class="tr-title">
          <b>技术雷达</b>
          <span>GitHub 近 {{ TRENDING.windowDays }} 天冒头的新项目</span>
        </div>
        <div class="tr-head-right">
          <span class="pill" :class="pill.cls">{{ pill.text }}</span>
          <button class="tr-btn" :disabled="refreshing || state?.running" @click="refresh">
            {{ state?.running ? '抓取中' : '刷新' }}
          </button>
        </div>
      </div>
    </template>

    <div class="tr-body">
      <div class="tr-tabs">
        <button
          v-for="tab in TABS"
          :key="tab.value"
          class="tr-tab"
          :class="{ on: range === tab.value }"
          @click="setRange(tab.value)"
        >
          {{ tab.label }}
        </button>
        <span class="tr-range-hint">{{ rangeHint }}</span>
      </div>

      <!-- AI 解读进度：抓到了但解读还在跑，必须让人看见它在干活 -->
      <div v-if="state?.aiRunning" class="tr-ai-bar">
        <div class="tr-ai-track"><i :style="{ width: progressPct + '%' }"></i></div>
        <span>AI 正在解读 {{ state.aiDone }}/{{ state.aiTotal }}</span>
      </div>
      <div v-else-if="aiJustFinished" class="tr-ai-bar is-done">
        <span>AI 解读完成 · 点任意项目看详细介绍</span>
      </div>

      <!-- 空状态：没数据 / 抓取中 / 失败 -->
      <div v-if="empty" class="tr-empty">
        <b>{{ empty.title }}</b>
        <p v-if="empty.body">{{ empty.body }}</p>
        <el-button v-if="empty.action !== 'none'" size="small" :loading="refreshing" @click="onAction(empty.action)">
          {{ empty.action === 'refresh' ? '立即抓取' : '去配置' }}
        </el-button>
      </div>

      <template v-else>
        <div class="tr-stats">
          <div v-for="cell in cells" :key="cell.label" class="tr-stat">
            <span>{{ cell.label }}</span>
            <b :class="{ 'is-text': cell.text }">{{ cell.value }}</b>
            <em>{{ cell.hint }}</em>
          </div>
        </div>

        <div v-if="bars.length > 1" class="tr-chart">
          <div class="tr-chart-head">
            <span>{{ chartTitle }}</span>
            <span>{{ range === 'day' ? '按抓取轮次' : '按天' }}</span>
          </div>
          <div class="tr-bars">
            <div v-for="bar in bars" :key="bar.date" class="tr-bar" :title="barTitle(bar)">
              <i v-if="bar.count > 0" :style="{ height: barHeight(bar) }"></i>
            </div>
          </div>
          <div class="tr-axis">
            <span>{{ bars[0]?.label }}</span>
            <span>{{ bars[bars.length - 1]?.label }}</span>
          </div>
        </div>

        <!-- 提示条都能关掉；换了新错误会重新出现 -->
        <div v-if="state?.lastError && !dismissed[state.lastError]" class="tr-banner is-error">
          <span>这一轮抓取失败：{{ state.lastError }}</span>
          <button class="tr-link" @click="refresh">重试</button>
          <button class="tr-close" title="关闭提示" @click="dismiss(state.lastError)">×</button>
        </div>

        <div
          v-else-if="state?.aiError && !dismissed[state.aiError]"
          class="tr-banner is-error"
        >
          <span>AI 解读失败：{{ state.aiError }}</span>
          <button class="tr-link" @click="emit('open-settings')">检查配置</button>
          <button class="tr-close" title="关闭提示" @click="dismiss(state.aiError)">×</button>
        </div>

        <div
          v-else-if="state && !state.aiReady && !state.aiRunning && !summary?.aiCount && !dismissed.noai"
          class="tr-banner"
        >
          <span>AI 没启用：{{ state.aiReason }}。配好后每个项目都会有一句大白话介绍。</span>
          <button class="tr-link" @click="emit('open-settings')">去配置</button>
          <button class="tr-close" title="关闭提示" @click="dismiss('noai')">×</button>
        </div>

        <ul class="tr-list">
          <li v-for="(item, index) in items" :key="item.fullName" class="tr-item" @click="openDetail(item)">
            <span class="tr-rank">{{ String(index + 1).padStart(2, '0') }}</span>

            <div class="tr-main">
              <div class="tr-line">
                <b class="tr-name">{{ item.fullName }}</b>
              </div>

              <!-- 列表只放一句话：AI 没生成时退回仓库原始描述 -->
              <p class="tr-intro" :class="{ 'is-raw': !item.insight }">
                {{ item.insight?.intro || item.description || '这个项目还没写描述' }}
              </p>

              <div class="tr-meta">
                <span v-if="item.language" class="tr-lang">
                  <i :style="{ background: langColor(item.language) }"></i>{{ item.language }}
                </span>
                <span>★ {{ thousands(item.stars) }}</span>
                <span v-if="item.days > 1">{{ item.days }} 天上榜</span>
                <!-- 周/月榜专属：区间内被抓到几轮在榜，日榜都是 1 轮所以不显示 -->
                <span v-else-if="range !== 'day' && item.hits > 1">{{ item.hits }} 轮在榜</span>
                <!-- 解读状态：读懂了就明确写「已解读」，别让用户去猜 -->
                <span v-if="item.insight" class="tr-state is-done">已解读</span>
                <span v-else-if="state?.aiRunning" class="tr-state is-doing">解读中</span>
                <span v-else-if="state?.aiReady" class="tr-state">待解读</span>
                <span v-for="tag in item.insight?.tags ?? []" :key="tag" class="tr-tag">{{ tag }}</span>
              </div>
            </div>

            <span v-if="item.insight" class="tr-score" :class="scoreClass(item)" :title="`已解读 · ${item.insight.score} 分，点击看详细介绍`">
              {{ item.insight.score }}
            </span>
          </li>
        </ul>
      </template>
    </div>

    <!-- 放在 dialog 的 footer 里：不随列表滚动，随时能看到数据新鲜度 -->
    <template #footer>
      <div class="tr-foot">
        <span>
          {{ updatedText }} · {{ nextText }} · 口径：近 {{ TRENDING.windowDays }} 天创建、star ≥
          {{ TRENDING.minStars }}
        </span>
        <span v-if="summary">{{ summary.polls }} 轮快照 · 点项目看详细解读</span>
      </div>
    </template>
  </el-dialog>

  <TrendingDetailDialog
    v-model="detailOpen"
    :item="activeItem"
    :ai-running="state?.aiRunning"
    :ai-ready="state?.aiReady"
  />
</template>

<style scoped>
:global(.trending-dialog) {
  max-width: 94vw;
}

.tr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 右边给弹窗自带的关闭按钮留位置 */
  padding-right: 32px;
}

.tr-title {
  display: flex;
  align-items: baseline;
  gap: 9px;
  min-width: 0;
}

.tr-title b {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: #e9edf6;
}

.tr-title span {
  font-size: 10.5px;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tr-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.tr-btn {
  height: 26px;
  padding: 0 11px;
  border-radius: 8px;
  border: 1px solid #2b3444;
  background: rgba(255, 255, 255, 0.045);
  color: #c2cbdb;
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.tr-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.09);
  border-color: #3d4a61;
  color: #fff;
}

.tr-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.tr-body {
  padding: 2px 0 0;
}

/* ---------- 粒度切换 ---------- */
.tr-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 11px;
}

.tr-tab {
  height: 26px;
  padding: 0 13px;
  border-radius: 8px;
  border: 1px solid #2b3444;
  background: rgba(255, 255, 255, 0.04);
  color: #c2cbdb;
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s;
}

.tr-tab:hover {
  color: #fff;
  border-color: #3d4a61;
}

.tr-tab.on {
  color: #06231e;
  background: linear-gradient(180deg, #6ff0da, #3ecdb4);
  border-color: #4fdec4;
  font-weight: 700;
}

.tr-range-hint {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--dim);
}

/* ---------- 统计格子 ---------- */
.tr-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.tr-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 9px 11px;
  border-radius: 11px;
  border: 1px solid #232a38;
  background: rgba(255, 255, 255, 0.026);
}

.tr-stat > span {
  font-size: 10px;
  letter-spacing: 0.8px;
  color: var(--dim);
}

.tr-stat > b {
  font-family: var(--mono);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--teal);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tr-stat > b.is-text {
  font-size: 13.5px;
  color: #dfe7f4;
}

.tr-stat > em {
  font-style: normal;
  font-size: 9.5px;
  color: #4d5769;
}

/* ---------- 趋势柱 ---------- */
.tr-chart {
  padding: 9px 12px 7px;
  border-radius: 11px;
  border: 1px solid #232a38;
  background: rgba(255, 255, 255, 0.02);
  margin-bottom: 10px;
}

.tr-chart-head {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--dim);
  margin-bottom: 7px;
}

.tr-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 4px;
  height: 48px;
  /* 给柱子一条地面线，空白天数才不会被看成浮在中间的短横杠 */
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

/* 柱子限宽并按两端对齐铺开：30 天时不会糊成一片，7 天时也不会变成大方块 */
.tr-bar {
  flex: 1 1 0;
  max-width: 16px;
  height: 100%;
  display: flex;
  align-items: flex-end;
  min-width: 3px;
}

.tr-bar i {
  display: block;
  width: 100%;
  min-height: 2px;
  border-radius: 3px 3px 1px 1px;
  background: linear-gradient(180deg, rgba(94, 234, 212, 0.85), rgba(94, 234, 212, 0.22));
  transition: height 0.3s ease;
}

.tr-bar:hover i {
  background: linear-gradient(180deg, #8ff5e4, rgba(94, 234, 212, 0.4));
}

.tr-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  font-family: var(--mono);
  font-size: 9.5px;
  color: #4d5769;
}

/* ---------- 提示条 ---------- */
.tr-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 11px;
  margin-bottom: 9px;
  border-radius: 10px;
  border: 1px solid rgba(245, 194, 107, 0.24);
  background: rgba(245, 194, 107, 0.07);
  font-size: 10.5px;
  line-height: 1.5;
  color: #e3c48f;
}

.tr-banner.is-error {
  border-color: rgba(248, 113, 113, 0.26);
  background: rgba(248, 113, 113, 0.08);
  color: #ffb4b4;
}

.tr-banner > span {
  flex: 1;
  min-width: 0;
}

.tr-link {
  flex: none;
  border: none;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 10.5px;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.tr-link:hover {
  color: #fff;
}

/* 提示条右上角的关闭：不关掉会一直挂在那儿 */
.tr-close {
  flex: none;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;
  cursor: pointer;
}

.tr-close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}

/* ---------- AI 解读进度 ---------- */
.tr-ai-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 10.5px;
  color: var(--teal);
}

.tr-ai-track {
  flex: 1;
  height: 6px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.tr-ai-track > i {
  display: block;
  height: 100%;
  width: 0;
  border-radius: 99px;
  background: linear-gradient(90deg, #2bbfa6, var(--teal));
  transition: width 0.35s ease;
}

.tr-ai-bar > span {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.tr-ai-bar.is-done {
  color: var(--dim);
}

/* ---------- 列表 ---------- */
.tr-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.tr-item {
  display: flex;
  gap: 9px;
  padding: 10px 11px;
  border-radius: 12px;
  border: 1px solid #232a38;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.014));
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.tr-item:hover {
  border-color: #3a455c;
  background: rgba(255, 255, 255, 0.06);
}

.tr-rank {
  flex: none;
  width: 15px;
  padding-top: 2px;
  font-family: var(--mono);
  font-size: 10.5px;
  color: #3f4a5e;
}

.tr-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tr-line {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.tr-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #e6eefc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 解读状态：已解读 / 解读中 / 待解读，直接写在 meta 行里，不用去猜 */
.tr-state {
  padding: 0 6px;
  border-radius: 5px;
  border: 1px dashed rgba(94, 234, 212, 0.28);
  color: rgba(94, 234, 212, 0.7);
  font-size: 9px;
  line-height: 1.6;
}

.tr-state.is-doing {
  border-style: solid;
  border-color: rgba(245, 194, 107, 0.34);
  color: #e3c48f;
  animation: tr-breathe 1.6s ease-in-out infinite;
}

.tr-state.is-done {
  border-style: solid;
  border-color: rgba(94, 234, 212, 0.3);
  background: rgba(94, 234, 212, 0.1);
  color: var(--teal);
}

@keyframes tr-breathe {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tr-state.is-doing {
    animation: none;
  }
}

.tr-intro {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: #c2cddd;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 没有 AI 解读时退回仓库原文，压低存在感，别抢了「一句话介绍」的位置 */
.tr-intro.is-raw {
  color: #7d8a9e;
}

.tr-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 9px;
  font-size: 9.5px;
  color: var(--dim);
}

.tr-lang {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tr-lang i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.tr-tag {
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid rgba(122, 162, 255, 0.2);
  background: rgba(122, 162, 255, 0.09);
  color: #9db6f5;
  font-size: 9px;
}

.tr-score {
  flex: none;
  align-self: flex-start;
  width: 33px;
  height: 33px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  border: 1px solid #262e3d;
  background: rgba(255, 255, 255, 0.04);
  color: #7d8a9e;
  font-family: var(--mono);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.tr-score.hot {
  color: #062a24;
  background: linear-gradient(160deg, #6ff0da, #2bbfa6);
  border-color: #4fdec4;
  font-weight: 700;
}

.tr-score.good {
  color: var(--gold);
  background: rgba(245, 194, 107, 0.12);
  border-color: rgba(245, 194, 107, 0.3);
}

/* ---------- 空状态 ---------- */
.tr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px 32px;
  text-align: center;
}

.tr-empty b {
  font-size: 13px;
  color: #dfe7f4;
}

.tr-empty p {
  margin: 0;
  max-width: 440px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--dim);
}

/* ---------- 页脚 ---------- */
:global(.trending-dialog .el-dialog__footer) {
  padding: 8px 18px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.tr-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 9.5px;
  line-height: 1.6;
  color: #4d5769;
  text-align: left;
}

.tr-foot > span:first-child {
  min-width: 0;
}
</style>
