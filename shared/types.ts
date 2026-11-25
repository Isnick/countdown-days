/**
 * shared/types.ts —— 跨进程共享的类型定义
 * 主进程（electron/）和渲染进程（src/）都从这里取类型，
 * 保证 IPC 两端的字段名 / 结构永远一致。
 */

/** 假期卡片的强调色（对应 styles/tokens.css 里的 --tone-*） */
export type ToneName = 'blue' | 'rose' | 'mint' | 'gold' | 'green' | 'violet' | 'red'

/**
 * 点窗口关闭按钮时的行为：
 *   ask  —— 每次都弹对话框问（默认）
 *   tray —— 收进托盘，程序继续在后台跑
 *   quit —— 直接退出
 */
export type CloseAction = 'ask' | 'tray' | 'quit'

/** 屏幕坐标（窗口左上角），用于记住迷你胶囊停在哪 */
export interface WindowPosition {
  x: number
  y: number
}

/** 用户设置：主进程是唯一事实来源，渲染进程只拿到镜像 */
export interface Settings {
  /** 上班时间 HH:MM */
  workStart: string
  /** 下班时间 HH:MM */
  workEnd: string
  /** 1=周一 … 7=周日 */
  workDays: number[]
  /** 出生日期 YYYY-MM-DD，空字符串表示未设置 */
  birthday: string
  /** 久坐提醒总开关 */
  sitEnabled: boolean
  /** 连续坐多少分钟提醒一次 */
  sitIntervalMin: number
  /** 是否只在工作时段计时 */
  sitWorkHoursOnly: boolean
  /** 是否同时发系统通知 */
  sitNotify: boolean
  /** 点关闭按钮时的行为（询问 / 收进托盘 / 直接退出） */
  closeAction: CloseAction
  /**
   * 省内存模式：关闭硬件加速，GPU 进程常驻内存能降一百多 MB，
   * 代价是动画交给 CPU 画。必须在启动前决定，改了需重启生效。
   */
  lowMemoryMode: boolean
  /**
   * 迷你胶囊上次被拖到的位置；null 表示还没拖过，按右下角停靠。
   * 存它只为一件事：收起再打开时胶囊还在原来的地方，而不是自己蹦回角落。
   */
  miniPosition: WindowPosition | null

  /* ---------------- 技术雷达（GitHub 热门） ---------------- */
  /** 是否在后台定时抓取 */
  trendingEnabled: boolean
  /** 轮询间隔（小时） */
  trendingPollHours: number
  /** OpenAI 兼容接口地址，填到 /v1 为止 */
  aiBaseUrl: string
  /** 模型名，例如 gpt-4o-mini / deepseek-chat */
  aiModel: string
}

/** 主进程持有的久坐计时状态 */
export interface SitState {
  /** 本轮「坐下来」的起点（毫秒时间戳） */
  since: number
  /** 上次提醒时间戳，用于冷却 */
  lastAlertAt: number
  /** 今日已提醒次数 */
  alertsToday: number
  /** 当前是否在计时 */
  tracking: boolean
  /** 提醒间隔（分钟） */
  intervalMin: number
  /** 提醒总开关 */
  enabled: boolean
  /** 是否只在工作时段提醒 */
  workHoursOnly: boolean
}

/** 主进程弹出久坐提醒时推给页面的数据 */
export interface SitAlertPayload {
  minutes: number
  alertsToday: number
}

/** 应用元信息（关于 / 页脚展示） */
export interface AppMeta {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  isPackaged: boolean
  settingsFile: string
}

/** 设置 + 久坐状态的整体快照（恢复默认时一次推回） */
export interface SettingsPayload {
  settings: Settings
  sit: SitState
}

/** 测试通知的结果 */
export interface NotifyResult {
  ok: boolean
  reason?: string
}

/** 窗口 / 系统动作白名单 */
export type AppAction =
  | 'minimize'
  | 'maximize'
  | 'close'
  | 'quit'
  | 'reload'
  | 'devtools'
  | 'about'
  /** 直接收进托盘，不再弹询问框 */
  | 'hide'
  /** 重启应用（省内存模式这类启动期开关改完要用它） */
  | 'relaunch'

/** 进程内存快照（设置页展示，单位 MB） */
export interface MemoryStats {
  /** 全部相关进程的常驻内存合计 */
  totalMb: number
  /** 主进程 */
  mainMb: number
  /** 渲染进程（页面） */
  rendererMb: number
  /** GPU 进程 */
  gpuMb: number
  /** utility / network 等子进程合计 */
  otherMb: number
  /** 应用已经运行了多少分钟（判断是不是「长时间运行」） */
  uptimeMin: number
  /** 采样时间戳 */
  at: number
}

/** 一条假期规则（纯数据） */
export interface HolidayRule {
  name: string
  emoji: string
  /** 放假起始日 YYYY-MM-DD（含） */
  start: string
  /** 放假结束日 YYYY-MM-DD（含） */
  end: string
  /** 放假天数；null 表示官方尚未公布调休安排 */
  days: number | null
  /** 卡片上的一行说明 */
  note: string
  tone: ToneName
}

/* ============================================================
 * 技术雷达：GitHub 热门项目的采集、解读与统计
 * ============================================================ */

/** 统计粒度 */
export type TrendingRange = 'day' | 'week' | 'month'

/** 抓取到的一个仓库（只留展示需要的字段，整条 API 响应没必要落盘） */
export interface TrendingRepo {
  /** GitHub 数字 id，用来做稳定去重 */
  id: number
  /** owner/name */
  fullName: string
  owner: string
  name: string
  url: string
  description: string
  language: string
  stars: number
  forks: number
  /** 仓库标签最多留 6 个 */
  topics: string[]
  /** 创建日期 YYYY-MM-DD */
  createdAt: string
  /** 最近推送日期 YYYY-MM-DD */
  pushedAt: string
}

/**
 * AI 对单个仓库的解读。
 * 只算一次并落盘缓存：同一个项目下次上榜时直接复用，不为同一段文字重复付费。
 */
export interface TrendingInsight {
  repoKey: string
  /** 一句话大白话介绍，列表里就显示它 */
  intro: string
  /** 为什么最近火 */
  why: string
  /** 适合谁 */
  forWho: string
  /** 大白话详细介绍（详情弹窗用） */
  detail: string
  /** 怎么用，2-4 步 */
  howto: string[]
  tags: string[]
  /** 0-100 值得看评分 */
  score: number
  /** 产出它的模型，换模型后可以按需重跑 */
  model: string
  promptVersion: string
  at: number
}

/** 列表里的一行：仓库 + 区间内的增长指标 */
export interface TrendingItem extends TrendingRepo {
  /** 区间内被 GitHub 判为热门的轮次数：越大说明不是偶然冒一下 */
  hits: number
  /** 区间内上榜天数 */
  days: number
  insight: TrendingInsight | null
}

/** 趋势图上的一根柱子 */
export interface TrendingBar {
  /** 桶键：按天是 YYYY-MM-DD，按轮次是 HH:MM */
  date: string
  /** 直接显示在轴上的短标签 */
  label: string
  /** 桶内去重项目数 */
  count: number
}

/** 区间统计 */
export interface TrendingSummary {
  /** 区间内成功抓取次数 */
  polls: number
  /** 去重项目数 */
  repoCount: number
  /** 有 AI 解读的项目数 */
  aiCount: number
  /** 区间内实际有数据的天数（用来解释「周榜为什么长得像日榜」） */
  coveredDays: number
  /** 区间应有的天数：1 / 7 / 30 */
  rangeDays: number
  languages: Array<{ name: string; count: number }>
  tags: Array<{ name: string; count: number }>
  bars: TrendingBar[]
}

/** 后台抓取任务的状态（页面顶部的状态胶囊用它） */
export interface TrendingState {
  enabled: boolean
  running: boolean
  /** 模型地址 + Key + 模型名是否齐全 */
  aiReady: boolean
  /** 没就绪时缺什么，直接显示给用户 */
  aiReason: string
  /** AI 是否正在解读（进度条用它） */
  aiRunning: boolean
  /** 已完成的解读条数 */
  aiDone: number
  /** 本轮需要解读的总条数 */
  aiTotal: number
  pollHours: number
  /** 本次运行里最后一次成功抓取 */
  lastRunAt: number
  /** 历史最后一次成功抓取 */
  lastOkAt: number
  /** 下次计划抓取时间；0 表示已关闭 */
  nextRunAt: number
  /** 最近一次失败原因，空字符串表示正常 */
  lastError: string
  /** AI 解读最近一次失败原因（抓取正常但模型挂了时单独提示） */
  aiError: string
}

/** 页面一次拿到的完整视图 */
export interface TrendingView {
  range: TrendingRange
  items: TrendingItem[]
  summary: TrendingSummary
  state: TrendingState
  /** 最早一条快照的日期，空字符串表示还没抓过 */
  since: string
}

/** API Key / Token 只回传「有没有」和掩码，明文永远不出主进程 */
export interface SecretStatus {
  aiApiKey: boolean
  githubToken: boolean
  /** 形如 sk-1…abcd */
  aiKeyHint: string
  ghTokenHint: string
  /** 是否走了系统加密（safeStorage） */
  encrypted: boolean
}

/** 密钥字段名 */
export type SecretField = 'aiApiKey' | 'githubToken'

/** 模型连通性测试结果 */
export interface AiTestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

/** preload 通过 contextBridge 暴露给页面的能力（window.api） */
export interface DesktopApi {
  getSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  resetSettings(): Promise<SettingsPayload>

  getSitState(): Promise<SitState>
  resetSit(): Promise<SitState>
  snoozeSit(minutes?: number): Promise<SitState>
  testNotify(): Promise<NotifyResult>

  appMeta(): Promise<AppMeta>
  appAction(action: AppAction): Promise<void>
  /** 取一次各进程内存快照 */
  memoryStats(): Promise<MemoryStats>

  /**
   * 主界面 ⇄ 迷你胶囊：胶囊显示时把主窗口收起来，收起时把主窗口叫回来。
   * 返回切换之后胶囊是否可见，调用方据此更新按钮文案。
   */
  toggleMini(): Promise<boolean>
  /** 从胶囊回到主界面（胶囊上双击 / 「展开」按钮） */
  expandMini(): Promise<void>

  onSitState(cb: (state: SitState) => void): () => void
  onSitAlert(cb: (payload: SitAlertPayload) => void): () => void
  onSettingsChanged(cb: (payload: SettingsPayload) => void): () => void

  /* ---- 技术雷达 ---- */
  trendingView(range: TrendingRange): Promise<TrendingView>
  /** 立刻抓一次（不看轮询间隔），返回抓完的状态 */
  trendingRefresh(): Promise<TrendingState>
  /** 把当前列表里还缺解读的项目补一批（面板打开时自动调，不用每次都手动刷新） */
  trendingEnsure(): Promise<void>
  /** 用系统浏览器打开仓库；只接受 https://github.com/ 开头 */
  trendingOpen(url: string): Promise<void>
  /** 发一个最小请求验证模型地址 / Key / 模型名是否可用 */
  testAi(): Promise<AiTestResult>
  getSecrets(): Promise<SecretStatus>
  /** 传空字符串表示清除该字段 */
  saveSecrets(patch: Partial<Record<SecretField, string>>): Promise<SecretStatus>
  onTrendingChanged(cb: (state: TrendingState) => void): () => void
}

/** 富文本片段：用于「已工作 2 小时 · 工作时段 09:00 — 18:00」这类局部加粗的说明行 */
export interface RichPart {
  text: string
  strong?: boolean
}
