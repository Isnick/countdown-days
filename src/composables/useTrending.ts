/**
 * src/composables/useTrending.ts —— 技术雷达的响应式状态
 * ------------------------------------------------------------------
 * 视图由主进程算好（快照聚合 + AI 解读缓存），这里只负责：切粒度、拉数据、接推送。
 * 数据量不大，不需要客户端缓存层；每次切粒度重新取一遍最省心，也不会读到过期结果。
 */

import { ref } from 'vue'
import type { TrendingRange, TrendingState, TrendingView } from '@shared/types'
import { bridge } from '@/api/bridge'

const range = ref<TrendingRange>('day')
const view = ref<TrendingView | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')

/** 请求序号：快速连点日/周/月时，只认最后一次的结果 */
let seq = 0

async function load(): Promise<void> {
  if (!bridge) {
    error.value = 'preload 没有加载'
    return
  }
  const mine = ++seq
  loading.value = true
  try {
    const next = await bridge.trendingView(range.value)
    if (mine === seq) {
      view.value = next
      error.value = ''
    }
  } catch (err) {
    if (mine === seq) error.value = (err as Error).message || '读取失败'
  } finally {
    if (mine === seq) loading.value = false
  }
}

async function setRange(next: TrendingRange): Promise<void> {
  if (next === range.value && view.value) return
  range.value = next
  await load()
}

async function refresh(): Promise<void> {
  if (!bridge || refreshing.value) return
  refreshing.value = true
  try {
    await bridge.trendingRefresh()
    await load()
  } catch (err) {
    error.value = (err as Error).message || '抓取失败'
  } finally {
    refreshing.value = false
  }
}

/** 主进程推来状态：先就地更新，页面需要时再拉一次视图 */
function applyState(state: TrendingState): void {
  if (view.value) view.value = { ...view.value, state }
}

export function useTrending() {
  return { range, view, loading, refreshing, error, load, setRange, refresh, applyState }
}
