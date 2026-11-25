/**
 * electron/services/trending-store.ts —— 技术雷达的本地存储与统计
 * ------------------------------------------------------------------
 * 存储形态是「快照」，不是「当前榜单」：
 *   每一次抓取都原样记一条 { at, date, repos[] }，按月一个文件。
 *   日 / 周 / 月榜单全部是对快照的聚合，所以「这段时间反复在榜」
 *   这类判断才算得出来 —— 只存最新榜单的话，周榜 / 月榜会退化成
 *   「当月最后一次榜单」，没有意义。
 *
 * 目录结构（%APPDATA%/CountdownDays/trending/）：
 *   2026-11.json   当月快照
 *   insights.json  AI 解读缓存（按仓库名，只算一次）
 *   state.json     抓取时间戳（重启后接着上一轮的节奏，不会一开机就抓）
 *
 * 写盘一律先写 .tmp 再 rename：断电 / 强杀进程时不会留下半个 JSON。
 */

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { TRENDING } from '../../shared/constants'
import { addDays, keyOf, pad2 } from '../../shared/date'
import type {
  TrendingBar,
  TrendingInsight,
  TrendingItem,
  TrendingRange,
  TrendingRepo,
  TrendingState,
  TrendingSummary,
  TrendingView
} from '../../shared/types'

export interface SnapshotEntry {
  at: number
  /** 本地日期 YYYY-MM-DD */
  date: string
  repos: TrendingRepo[]
}

interface MonthFile {
  month: string
  entries: SnapshotEntry[]
}

export interface TrendingTimestamps {
  lastRunAt: number
  lastOkAt: number
  lastAttemptAt: number
}

const RANGE_DAYS: Record<TrendingRange, number> = { day: 1, week: 7, month: 30 }
/** 单个文件最多留多少轮快照（1 小时轮询一个月约 720 轮，留点余量） */
const MAX_ENTRIES_PER_MONTH = 900

function dir(): string {
  return path.join(app.getPath('userData'), 'trending')
}

const monthPath = (month: string): string => path.join(dir(), `${month}.json`)
const insightsPath = (): string => path.join(dir(), 'insights.json')
const statePath = (): string => path.join(dir(), 'state.json')

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value), 'utf8')
  await fs.rename(tmp, file)
}

const monthOf = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`

/** 从 from 到 to 之间跨过的月份（含两端），最多 13 个 */
function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  // 上限兜底：手改系统时间也不至于读出几百个文件
  while (cursor <= end && out.length < 13) {
    out.push(monthOf(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return out
}

/* ============================================================
 * 快照读写
 * ============================================================ */

export async function appendSnapshot(entry: SnapshotEntry): Promise<void> {
  const file = monthPath(entry.date.slice(0, 7))
  const data = await readJson<MonthFile>(file, { month: entry.date.slice(0, 7), entries: [] })

  data.entries.push(entry)
  if (data.entries.length > MAX_ENTRIES_PER_MONTH) {
    data.entries = data.entries.slice(-MAX_ENTRIES_PER_MONTH)
  }
  await writeJson(file, data)
  await pruneOldMonths()
}

/** 只保留最近 keepMonths 个月的文件 */
async function pruneOldMonths(): Promise<void> {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - TRENDING.keepMonths)
  const cutoffMonth = monthOf(cutoff)
  try {
    const names = await fs.readdir(dir())
    await Promise.all(
      names
        .filter((name) => /^\d{4}-\d{2}\.json$/.test(name) && name.slice(0, 7) < cutoffMonth)
        .map((name) => fs.rm(path.join(dir(), name), { force: true }))
    )
  } catch {
    // 目录还不存在 / 文件被占用：不影响主流程
  }
}

/** 读区间内的快照，按时间升序 */
export async function loadEntries(days: number): Promise<SnapshotEntry[]> {
  const today = new Date()
  const now = today.getTime()
  const from = addDays(today, -(days - 1))
  const fromKey = keyOf(from)
  const months = monthsBetween(from, today)
  const all: SnapshotEntry[] = []

  for (const month of months) {
    const data = await readJson<MonthFile>(monthPath(month), { month, entries: [] })
    for (const entry of data.entries) {
      // 系统时间被往回调过时，文件里可能留下「未来」的快照；
      // 让它参与聚合会一直霸占「最新」的位置，直接忽略
      if (entry.at > now + 60_000) continue
      if (entry.date >= fromKey && Array.isArray(entry.repos)) all.push(entry)
    }
  }

  return all.sort((a, b) => a.at - b.at)
}

/** 最早一条快照的日期，没有则空串 */
export async function earliestDate(): Promise<string> {
  try {
    const names = (await fs.readdir(dir()))
      .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
      .sort()
    for (const name of names) {
      const data = await readJson<MonthFile>(path.join(dir(), name), { month: '', entries: [] })
      const first = data.entries[0]
      if (first?.date) return first.date
    }
  } catch {
    // 没有目录就是没抓过
  }
  return ''
}

/* ============================================================
 * AI 解读缓存
 * ============================================================ */

export async function loadInsights(): Promise<Record<string, TrendingInsight>> {
  return readJson<Record<string, TrendingInsight>>(insightsPath(), {})
}

/** 按仓库名合并。顺手丢掉 180 天前的旧解读，文件不会无限长 */
export async function saveInsights(list: TrendingInsight[]): Promise<void> {
  if (!list.length) return
  const cache = await loadInsights()
  for (const insight of list) cache[insight.repoKey] = insight

  const cutoff = Date.now() - 180 * 86_400_000
  for (const [key, value] of Object.entries(cache)) {
    if (!value || value.at < cutoff) delete cache[key]
  }
  await writeJson(insightsPath(), cache)
}

/** 哪些仓库还没有可用解读（没有、换过模型、或提示词升级了） */
export function staleRepos(
  repos: TrendingRepo[],
  cache: Record<string, TrendingInsight>,
  model: string
): TrendingRepo[] {
  return repos.filter((repo) => {
    const insight = cache[repo.fullName]
    return !insight || insight.model !== model || insight.promptVersion !== TRENDING.promptVersion
  })
}

/* ============================================================
 * 抓取时间戳
 * ============================================================ */

export async function loadTimestamps(): Promise<TrendingTimestamps> {
  const saved = await readJson<Partial<TrendingTimestamps>>(statePath(), {})
  return {
    lastRunAt: Number(saved.lastRunAt) || 0,
    lastOkAt: Number(saved.lastOkAt) || 0,
    lastAttemptAt: Number(saved.lastAttemptAt) || 0
  }
}

export async function saveTimestamps(value: TrendingTimestamps): Promise<void> {
  await writeJson(statePath(), value)
}

/* ============================================================
 * 聚合
 * ============================================================ */

interface RepoAgg {
  repo: TrendingRepo
  /** 区间内被判定为热门的轮次数 */
  hits: number
  days: Set<string>
}

function aggregate(entries: SnapshotEntry[]): Map<string, RepoAgg> {
  const map = new Map<string, RepoAgg>()

  // entries 已按 at 升序，所以后写的一定更新
  for (const entry of entries) {
    for (const repo of entry.repos) {
      const key = repo.fullName.toLowerCase()
      const hit = map.get(key)
      if (hit) {
        hit.repo = repo
        hit.hits += 1
        hit.days.add(entry.date)
      } else {
        map.set(key, { repo, hits: 1, days: new Set([entry.date]) })
      }
    }
  }

  return map
}

/** 按天的柱子：当天在榜的去重项目数 */
function dailyBars(entries: SnapshotEntry[], days: number): TrendingBar[] {
  const perDay = new Map<string, Set<string>>()

  for (const entry of entries) {
    const bucket = perDay.get(entry.date) ?? new Set<string>()
    perDay.set(entry.date, bucket)
    for (const repo of entry.repos) bucket.add(repo.fullName.toLowerCase())
  }

  const bars: TrendingBar[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = keyOf(addDays(today, -i))
    bars.push({ date, label: date.slice(5), count: perDay.get(date)?.size ?? 0 })
  }
  return bars
}

/** 按轮次的柱子：一天里 8 次抓取，比一根柱子有信息量 */
function pollBars(entries: SnapshotEntry[]): TrendingBar[] {
  return entries.map((entry) => {
    const d = new Date(entry.at)
    const label = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    return {
      // 同一分钟里连抓两次时 label 会重名，桶键必须带时间戳才唯一
      date: String(entry.at),
      label,
      count: new Set(entry.repos.map((repo) => repo.fullName.toLowerCase())).size
    }
  })
}

function topOf(counter: Map<string, number>, limit: number): Array<{ name: string; count: number }> {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

export async function buildView(
  range: TrendingRange,
  state: TrendingState,
  insights: Record<string, TrendingInsight>
): Promise<TrendingView> {
  const days = RANGE_DAYS[range]
  const entries = await loadEntries(days)
  const coveredDays = new Set(entries.map((entry) => entry.date)).size

  /*
   * 「今日」只看最新一轮快照，语义是「此刻谁在冒」；
   * 「本周 / 本月」对区间内所有快照做聚合，按在榜轮次排序。
   *
   * 这么切是有原因的：如果三个粒度都做区间聚合，只要区间里只有一天数据，
   * 日榜和周榜就会是同一份榜单换了个标签 —— 用户点了觉得没反应。
   * 现在日榜是「此刻」，周/月是「这段时间反复在榜的」，两个不同的问题。
   */
  const source = range === 'day' ? entries.slice(-1) : entries
  const aggs = aggregate(source)

  const items: TrendingItem[] = []
  for (const agg of aggs.values()) {
    items.push({
      ...agg.repo,
      hits: agg.hits,
      days: agg.days.size,
      insight: insights[agg.repo.fullName] ?? null
    })
  }

  items.sort((a, b) => {
    // 在榜轮次是「持续性」：周/月榜里反复出现的排前面，冒一下就走的不占坑
    if (b.hits !== a.hits) return b.hits - a.hits
    const scoreDiff = (b.insight?.score ?? -1) - (a.insight?.score ?? -1)
    if (scoreDiff !== 0) return scoreDiff
    return b.stars - a.stars
  })

  const shown = items.slice(0, TRENDING.displayLimit)

  const languageCounter = new Map<string, number>()
  const tagCounter = new Map<string, number>()
  let aiCount = 0
  for (const item of shown) {
    if (item.language) languageCounter.set(item.language, (languageCounter.get(item.language) ?? 0) + 1)
    if (item.insight) {
      aiCount += 1
      for (const tag of item.insight.tags) tagCounter.set(tag, (tagCounter.get(tag) ?? 0) + 1)
    }
  }

  const summary: TrendingSummary = {
    polls: entries.length,
    repoCount: aggs.size,
    aiCount,
    coveredDays,
    rangeDays: days,
    languages: topOf(languageCounter, 4),
    tags: topOf(tagCounter, 6),
    bars: range === 'day' ? pollBars(entries) : dailyBars(entries, days)
  }

  return { range, items: shown, summary, state, since: await earliestDate() }
}
