/**
 * electron/services/trending-service.ts —— 技术雷达的抓取与调度
 * ------------------------------------------------------------------
 * 为什么调度器放主进程：渲染进程的定时器在窗口隐藏时会被 Chromium 降频，
 * 而这个功能恰恰要在「窗口收进托盘 / 收起成胶囊」时继续跑。
 *
 * 调度用的是 setTimeout 链而不是 setInterval：
 *   笔记本睡一觉醒来，setInterval 可能一次性补发好几轮，
 *   既浪费额度又会让快照时间戳挤在一起。每次跑完再算下一次，天然不会堆积；
 *   另外监听 powerMonitor 的 resume，睡醒后如果已经过期就补抓一次。
 *
 * 抓取口径：GitHub 官方搜索接口，取「最近 30 天创建、star ≥ 100」的项目按 star 排序。
 * trending 页面没有官方 API，HTML 解析太脆，只作为以后的可选项，不在这里爬。
 */

import { net, shell } from 'electron'
import { TRENDING } from '../../shared/constants'
import { addDays, keyOf } from '../../shared/date'
import { getSettings } from './settings-store'
import { getSecret, secretStatus } from './secrets-store'
import { analyzeRepos, aiMissingReason, aiReady, testAi, type AiConfig } from './ai-service'
import {
  appendSnapshot,
  buildView,
  loadInsights,
  loadTimestamps,
  saveInsights,
  saveTimestamps,
  staleRepos,
  type TrendingTimestamps
} from './trending-store'
import type {
  AiTestResult,
  SecretStatus,
  TrendingRange,
  TrendingRepo,
  TrendingState,
  TrendingView
} from '../../shared/types'

interface GitHubItem {
  id?: number
  full_name?: string
  name?: string
  owner?: { login?: string }
  html_url?: string
  description?: string | null
  language?: string | null
  stargazers_count?: number
  forks_count?: number
  topics?: string[]
  created_at?: string
  pushed_at?: string
}

/** 只留展示需要的字段并做类型收敛，脏数据直接丢掉 */
function mapRepo(raw: GitHubItem): TrendingRepo | null {
  const fullName = String(raw.full_name ?? '')
  if (!fullName.includes('/')) return null

  const [owner, name] = fullName.split('/')
  return {
    id: Number(raw.id) || 0,
    fullName,
    owner: String(raw.owner?.login ?? owner),
    name: String(raw.name ?? name),
    url: String(raw.html_url ?? `https://github.com/${fullName}`),
    description: String(raw.description ?? '').replace(/\s+/g, ' ').trim(),
    language: String(raw.language ?? ''),
    stars: Math.max(0, Number(raw.stargazers_count) || 0),
    forks: Math.max(0, Number(raw.forks_count) || 0),
    topics: Array.isArray(raw.topics) ? raw.topics.map(String).slice(0, 6) : [],
    createdAt: String(raw.created_at ?? '').slice(0, 10),
    pushedAt: String(raw.pushed_at ?? '').slice(0, 10)
  }
}

export class TrendingService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private timestamps: TrendingTimestamps = { lastRunAt: 0, lastOkAt: 0, lastAttemptAt: 0 }
  private lastError = ''
  private aiError = ''
  private nextRunAt = 0
  /** AI 解读进度：界面上的进度条靠它 */
  private aiRunning = false
  private aiDone = 0
  private aiTotal = 0
  /**
   * 解读互斥锁。和 aiRunning 分开是因为它的语义不一样：
   * aiRunning 是「给用户看的进度」，aiBusy 是「防止两路同时进来」。
   * 没有它，刷新刚结束时的自动解读会撞上面板的「补缺」请求，
   * 同一批项目被请求两遍 —— 既费钱，又会往缓存里重复写。
   */
  private aiBusy = false

  constructor(private readonly onChange: (state: TrendingState) => void) {}

  async start(): Promise<void> {
    this.timestamps = await loadTimestamps()
    // 从没抓过就 3 秒后先抓一次，用户打开面板就能看到东西
    this.plan(this.timestamps.lastAttemptAt ? undefined : 3_000)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.nextRunAt = 0
  }

  /** 设置里改了开关 / 间隔后重排 */
  reschedule(): void {
    this.plan()
  }

  /** 只改了密钥：AI 可用状态可能变了，重算一次推给界面 */
  secretsChanged(): void {
    this.emit()
  }

  /** 睡眠唤醒：过期就补抓，没过期就按原计划走 */
  onResume(): void {
    const s = getSettings()
    if (!s.trendingEnabled) return
    const interval = s.trendingPollHours * 3_600_000
    const overdue = Date.now() - this.timestamps.lastAttemptAt > interval
    this.plan(overdue ? 5_000 : undefined)
  }

  getState(): TrendingState {
    const s = getSettings()
    const missing = aiMissingReason(this.aiConfig())
    return {
      enabled: s.trendingEnabled,
      running: this.running,
      aiReady: !missing,
      aiReason: missing,
      aiRunning: this.aiRunning,
      aiDone: this.aiDone,
      aiTotal: this.aiTotal,
      pollHours: s.trendingPollHours,
      lastRunAt: this.timestamps.lastRunAt,
      lastOkAt: this.timestamps.lastOkAt,
      nextRunAt: this.nextRunAt,
      lastError: this.lastError,
      aiError: this.aiError
    }
  }

  async view(range: TrendingRange): Promise<TrendingView> {
    // IPC 那头传什么都可能，非法粒度按「今日」处理，别让 NaN 传到日期计算里
    const safe: TrendingRange = range === 'week' || range === 'month' ? range : 'day'
    return buildView(safe, this.getState(), await loadInsights())
  }

  /** 手动刷新：不看开关和间隔，点了就跑 */
  async refresh(): Promise<TrendingState> {
    if (this.running) return this.getState()

    this.running = true
    this.emit()

    try {
      const repos = await this.fetchRepos()
      const now = Date.now()
      await appendSnapshot({ at: now, date: keyOf(new Date(now)), repos })

      this.timestamps = { lastRunAt: now, lastOkAt: now, lastAttemptAt: now }
      await saveTimestamps(this.timestamps)
      this.lastError = ''
      this.running = false
      this.plan()
      this.emit()

      // 解读慢慢补：先把榜单给用户看，AI 结果到了再推一次
      void this.enrich(repos)
    } catch (err) {
      this.timestamps = { ...this.timestamps, lastAttemptAt: Date.now() }
      await saveTimestamps(this.timestamps)
      this.lastError = (err as Error).message
      this.running = false
      this.plan()
      this.emit()
      console.warn('[trending] 抓取失败：', this.lastError)
    }

    return this.getState()
  }

  /** 仓库链接只允许 https://github.com/，交给系统浏览器打开 */
  async open(url: string): Promise<void> {
    const target = String(url ?? '')
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/i.test(target)) {
      throw new Error('只支持打开 GitHub 仓库链接')
    }
    await shell.openExternal(target)
  }

  async testAi(): Promise<AiTestResult> {
    return testAi(this.aiConfig())
  }

  getSecretStatus(): SecretStatus {
    return secretStatus()
  }

  private aiConfig(): AiConfig {
    const s = getSettings()
    return {
      baseUrl: s.aiBaseUrl,
      model: s.aiModel,
      apiKey: getSecret('aiApiKey')
    }
  }

  /**
   * 下一次抓取 = 上次尝试时间 + 间隔。
   * initialDelay 只给两个场景用：刚启动（先抓一次）和睡醒补抓。
   */
  private plan(initialDelay?: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null

    const s = getSettings()
    if (!s.trendingEnabled) {
      this.nextRunAt = 0
      this.emit()
      return
    }

    const interval = s.trendingPollHours * 3_600_000
    let delay: number
    if (initialDelay !== undefined) delay = initialDelay
    else if (this.lastError) delay = TRENDING.retryDelayMs
    else delay = Math.max(60_000, this.timestamps.lastAttemptAt + interval - Date.now())

    this.nextRunAt = Date.now() + delay
    this.timer = setTimeout(() => {
      this.timer = null
      void this.refresh()
    }, delay)
    this.emit()
  }

  private async fetchRepos(): Promise<TrendingRepo[]> {
    const since = keyOf(addDays(new Date(), -TRENDING.windowDays))
    const url = new URL(TRENDING.source)
    url.searchParams.set('q', `created:>=${since} stars:>=${TRENDING.minStars}`)
    url.searchParams.set('sort', 'stars')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', String(TRENDING.perPage))

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      // GitHub 要求带 User-Agent，否则直接 403
      'User-Agent': 'CountdownDays-Trending/2.0'
    }
    const token = getSecret('githubToken').trim()
    if (token) headers.Authorization = `Bearer ${token}`

    let response: Response
    try {
      // net.fetch：走 Chromium 网络栈，系统代理 / PAC 生效（Node 的 fetch 不读这些）
      response = await net.fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(TRENDING.requestTimeoutMs)
      })
    } catch (err) {
      const name = (err as Error).name
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Error('连接 GitHub 超时，检查一下网络或代理')
      }
      throw new Error(`连不上 GitHub：${(err as Error).message}`)
    }

    if (!response.ok) {
      if (response.status === 401) throw new Error('GitHub Token 无效，请到设置里重新填写')
      if (response.status === 403 || response.status === 429) {
        const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0)
        const waitMin = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000)) : 0
        throw new Error(
          `GitHub 接口限流${waitMin ? `，约 ${waitMin} 分钟后恢复` : ''}；配一个 Token 可把额度从 10 次/分提到 30 次/分`
        )
      }
      if (response.status === 422) throw new Error('GitHub 认为查询条件不合法（可能是系统日期异常）')
      throw new Error(`GitHub 返回 ${response.status}`)
    }

    const data = (await response.json()) as { items?: GitHubItem[] }
    const repos = (data.items ?? []).map(mapRepo).filter((repo): repo is TrendingRepo => repo !== null)
    if (!repos.length) throw new Error('这一轮没抓到项目，可能查询条件太严')
    return repos
  }

  /**
   * 面板打开时调：把各个粒度里还缺解读的项目补一批。
   * 轮询本身也会解读，这里兜的是「抓取时模型还没配好 / 应用当时没开着」的情况，
   * 省得用户必须先手动刷新一次才看得到介绍。
   */
  async ensureInsights(): Promise<void> {
    if (this.running || this.aiBusy) return
    if (!aiReady(this.aiConfig())) return
    await this.enrich([])
  }

  /** 补齐缺失的 AI 解读。失败只影响解读，不影响已经入库的榜单 */
  private async enrich(repos: TrendingRepo[]): Promise<void> {
    if (this.aiBusy) return
    this.aiBusy = true

    try {
      const cfg = this.aiConfig()
      if (!aiReady(cfg)) {
        this.aiRunning = false
        this.aiDone = 0
        this.aiTotal = 0
        return
      }

      try {
        const cache = await loadInsights()
        const state = this.getState()

        /*
         * 优先给「现在真的会被看到」的项目写解读。
         * 三个粒度的榜单不一样（今日 = 此刻榜单，周/月 = 在榜轮次排序），
         * 只按抓取顺序取前 16 条，会出现「列表第一行反而没有解读」的尴尬。
         */
        const priority: TrendingRepo[] = []
        const seen = new Set<string>()
        const push = (list: TrendingRepo[]): void => {
          for (const repo of list) {
            const key = repo.fullName.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            priority.push(repo)
          }
        }
        for (const range of ['day', 'week', 'month'] as TrendingRange[]) {
          push((await buildView(range, state, cache)).items)
        }
        push(repos)

        const stale = staleRepos(priority, cache, cfg.model).slice(0, TRENDING.aiMaxPerRun)
        if (!stale.length) {
          if (this.aiError) {
            this.aiError = ''
            this.emit()
          }
          return
        }

        // 先亮出进度：让用户知道 AI 在干活，而不是「抓完了但没解读」
        this.aiRunning = true
        this.aiDone = 0
        this.aiTotal = stale.length
        this.aiError = ''
        this.emit()

        const { error } = await analyzeRepos(
          stale,
          cfg,
          (done, total) => {
            this.aiDone = done
            this.aiTotal = total
            this.emit()
          },
          async (batch) => {
            // 每读懂一批就落盘 + 推送：列表里这几行立刻变成「已解读」，点开就有内容
            await saveInsights(batch)
            this.emit()
          }
        )

        this.aiError = error
      } catch (err) {
        this.aiError = (err as Error).message
        console.warn('[trending] AI 解读失败：', this.aiError)
      }
    } finally {
      // 完成/失败/无事可做都要解锁并收掉进度条；done/total 留着，界面可以显示「16/16」
      this.aiBusy = false
      this.aiRunning = false
      this.emit()
    }
  }

  private emit(): void {
    this.onChange(this.getState())
  }
}
