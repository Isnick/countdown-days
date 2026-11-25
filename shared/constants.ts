/**
 * shared/constants.ts —— 全局固定参数（唯一配置入口）
 * ------------------------------------------------------------------
 * 所有「写死的数字 / 字符串 / 日期」都集中在这里，改行为只要改这个文件：
 *   APP          应用标识、窗口尺寸、标题栏配色、关于对话框
 *   DEFAULTS     用户设置默认值
 *   LIMITS       数值边界（久坐间隔、稍后提醒时长…）
 *   OPTIONS      下拉选项（久坐间隔、提醒范围、工作日标签）
 *   TIMING       各种定时器 / 动画 / 防抖的时间常数
 *   LOOK         进度条配色、进度行定义、提示音参数
 *   HOLIDAYS     法定假期表 + 调休上班日
 *   IPC          主进程 ↔ 渲染进程的通道名
 *   COPY         多个模块共用的固定文案
 * 主进程（electron/）和渲染进程（src/）都从这里取值，不存在第二份定义。
 */

import type { HolidayRule, Settings } from './types'

/* ============================================================
 * 1. 应用标识 / 窗口 / 关于
 * ============================================================ */
export const APP = {
  /** Windows 通知与安装包用的 AppUserModelID */
  id: 'com.demo.countdown',
  productName: 'CountdownDays',
  /** 界面标题 */
  title: '倒数日',
  /** 标题栏品牌副标题 */
  brandSub: 'Countdown',
  /** 品牌图形 */
  brandMark: '◷',
  version: '2.0.0',

  /** 窗口尺寸策略：按屏幕可用区域夹在 [min, max] 之间，留出边距 */
  window: {
    minWidth: 940,
    minHeight: 620,
    maxWidth: 1140,
    maxHeight: 960,
    /** 距屏幕边缘的留白，避免小屏 / 125% 缩放时超出可见区域 */
    marginX: 60,
    marginY: 70,
    backgroundColor: '#0a0c11',
    /** 自绘标题栏高度，必须与 styles/layout.css 里的 --titlebar-h 一致 */
    titleBarHeight: 40,
    /** Windows 系统按钮区的覆盖配色 */
    titleBarOverlay: {
      color: '#0b0e13',
      symbolColor: '#aab4c8',
      height: 40
    },
    /**
     * 迷你悬浮胶囊：整窗尺寸（含四周留白），卡片自己再内缩 inset。
     * 留白是给 CSS 阴影的 —— 透明窗口的直角阴影会把圆角切出四个尖，
     * 所以阴影只能画在页面里，窗口就得比卡片大一圈。
     */
    mini: {
      width: 340,
      height: 116,
      inset: 10,
      /** 默认停靠在屏幕右下角时距屏幕边缘的距离 */
      margin: 18
    }
  },

  /** 全局快捷键：主界面 ⇄ 迷你胶囊 */
  miniShortcut: 'CommandOrControl+Alt+D',
  /** 给人看的写法（设置页 / 提示文案用） */
  miniShortcutLabel: 'Ctrl+Alt+D',

  /** 关于对话框文案 */
  about: {
    title: '关于',
    buttons: ['知道了'],
    detailLines: [
      '假期 / 下班 / 生日 / 久坐，四个倒计时装在一个窗口里。',
      '',
      '• 假期数据：国务院办公厅《关于 2027 年部分节假日安排的通知》（2026-11-05）',
      '• 设置与密钥只保存在本机；开启 AI 解读时，项目名称和描述会发送给你配置的模型服务'
    ]
  }
} as const

/* ============================================================
 * 2. 用户设置：默认值与边界
 * ============================================================ */
/**
 * 技术雷达（GitHub 热门）：抓取口径 + AI 成本控制。
 * 会影响「抓到什么」和「花多少钱」的数字都在这里，别散落到服务里。
 */
export const TRENDING = {
  /** GitHub 搜索接口（官方、结构化；trending 页面没有 API，不爬） */
  source: 'https://api.github.com/search/repositories',
  /** 只统计最近 N 天创建的项目，这才是「新项目在冒头」而不是「老牌大仓库」 */
  windowDays: 30,
  /** 入场门槛，过滤掉刚建的空仓库 */
  minStars: 100,
  /** 一次拉多少条 */
  perPage: 30,
  /** 页面上最多展示多少条 */
  displayLimit: 12,
  /** 轮询间隔（小时） */
  pollHours: { min: 1, max: 12, defaultValue: 3 },
  /** 单次 HTTP 超时 */
  requestTimeoutMs: 15_000,
  /** 模型单批超时：推理模型先思考再回答，留足时间 */
  aiTimeoutMs: 120_000,
  /** 每次请求带几个项目给模型（推理模型慢，批太大容易超时 / 返工） */
  aiBatch: 4,
  /** 一轮最多补多少条 AI 解读，控制单次花费（覆盖展示条数，兼顾排序后仍都有解读） */
  aiMaxPerRun: 16,
  /** 失败后多久重试 */
  retryDelayMs: 15 * 60_000,
  /** 快照保留月数 */
  keepMonths: 12,
  /**
   * 提示词版本：改了提示词就 +1，旧解读会自动重跑。
   * v2：新增「一句话大白话 / 详细介绍 / 怎么用」三段
   */
  promptVersion: 'v2',
  /** 描述截断长度，避免 prompt 被长文本撑爆 */
  maxDescriptionChars: 260,
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini'
} as const

export const DEFAULTS: Settings = {
  workStart: '09:00',
  workEnd: '18:00',
  workDays: [1, 2, 3, 4, 5],
  birthday: '',
  sitEnabled: true,
  sitIntervalMin: 45,
  sitWorkHoursOnly: true,
  sitNotify: true,
  closeAction: 'ask',
  lowMemoryMode: false,
  /** null = 还没拖过，按右下角停靠 */
  miniPosition: null,
  trendingEnabled: true,
  trendingPollHours: TRENDING.pollHours.defaultValue,
  aiBaseUrl: TRENDING.defaultBaseUrl,
  aiModel: TRENDING.defaultModel
}

export const LIMITS = {
  /** 久坐提醒间隔（分钟） */
  sitIntervalMin: { min: 5, max: 180 },
  /** 「稍后提醒」可延后的分钟数 */
  snooze: { min: 1, max: 60, defaultValue: 10 },
  /** 订阅需要向前搜索的上班日天数 */
  nextWorkSearchDays: 60,
  /** 工作日至少要留一天，否则倒计时无解 */
  minWorkDays: 1
} as const

/** 设置项的合法形态（落盘前统一消毒用） */
export const PATTERNS = {
  /** HH:MM，24 小时制 */
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  /** YYYY-MM-DD */
  date: /^\d{4}-\d{2}-\d{2}$/,
  /** http(s) 接口地址 */
  url: /^https?:\/\/[^\s]{4,300}$/
} as const

/* ============================================================
 * 3. 下拉选项 / 标签
 * ============================================================ */
/** 久坐提醒间隔的可选值（分钟） */
export const SIT_INTERVAL_OPTIONS = [30, 45, 60, 90, 120] as const

/** 提醒范围 */
export const SIT_SCOPE_OPTIONS = [
  { value: 'work', label: '工作时段提醒' },
  { value: 'all', label: '全天提醒' }
] as const

/** 关闭窗口时的行为（值必须与 CloseAction 一致） */
export const CLOSE_ACTION_OPTIONS = [
  { value: 'ask', label: '每次询问我', hint: '关闭时弹窗选择：收进托盘还是退出' },
  { value: 'tray', label: '最小化到托盘', hint: '关掉窗口但继续后台运行，倒计时和久坐提醒照常' },
  { value: 'quit', label: '直接退出', hint: '关闭窗口即结束程序' }
] as const

/** 合法的关闭行为取值，落盘前用来消毒 */
export const CLOSE_ACTIONS = ['ask', 'tray', 'quit'] as const

/** 工作日芯片：value 与 Date.getDay() 的换算保持一致（1=周一 … 7=周日） */
export const WEEKDAYS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' }
] as const

/** 按 Date.getDay() 索引的星期中文（0=周日） */
export const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'] as const

/* ============================================================
 * 4. 时间常数
 * ============================================================ */
export const TIMING = {
  /** 界面刷新的秒针间隔 */
  clockTickMs: 1000,
  /** 主进程久坐检查间隔（10 秒粒度足够，几乎不占资源） */
  sitTickMs: 10_000,
  /** 久坐状态推送的最小间隔：状态没变化就不重复推，减少 IPC 与重渲染 */
  sitHeartbeatMs: 60_000,
  /** 设置项合并写盘的防抖 */
  settingsSaveDebounceMs: 220,
  /** 迷你胶囊被拖动后，位置写盘的防抖（拖动中会连发 moved 事件） */
  miniPosSaveMs: 400,
  /** 两次久坐提醒之间的最小冷却，防止连环轰炸 */
  alertCooldownMs: 60_000,
  /** 界面内提醒气泡的自动消失时间 */
  toastDurationMs: 45_000,
  /** 气泡退场动画时长（与 CSS 的 toast-out 对应） */
  toastLeaveMs: 260,
  /** 缩放适配：最小缩放比 / 二分次数 / 判定容差 */
  fitMinScale: 0.55,
  fitIterations: 6,
  fitTolerance: 0.5,
  /** 一天的毫秒数 */
  msPerDay: 86_400_000
} as const

/* ============================================================
 * 5. 外观 / 声音
 * ============================================================ */
/** 时间进度卡片的三行 */
export const PROGRESS_ROWS = [
  { key: 'today', label: '今天', tone: 'teal' },
  { key: 'week', label: '本周', tone: 'blue' },
  { key: 'year', label: '今年', tone: 'violet' }
] as const

/** 提醒提示音：两个柔和的短音 */
export const CHIME = {
  frequencies: [880, 660],
  /** 两音之间的间隔（秒） */
  noteGapSec: 0.2,
  attackSec: 0.02,
  decaySec: 0.18,
  volume: 0.05
} as const

/* ============================================================
 * 6. 法定假期表
 * ------------------------------------------------------------
 * 来源：国务院办公厅《关于 2027 年部分节假日安排的通知》
 *       国办发明电〔2026〕10 号，2026-11-05 发布
 * 以后每年 11 月公布新安排后，在这里追加一段即可。
 * ============================================================ */
export const HOLIDAY_SOURCE = '数据来源：国务院办公厅 2027 年放假安排'

export const HOLIDAY_TABLE: HolidayRule[] = [
  {
    name: '元旦',
    emoji: '🎉',
    start: '2027-01-01',
    end: '2027-01-03',
    days: 3,
    note: '周五至周日，不用调休',
    tone: 'blue'
  },
  {
    name: '春节',
    emoji: '🧧',
    start: '2027-02-05',
    end: '2027-02-13',
    days: 9,
    note: '除夕到初八 · 1/31、2/14 补班',
    tone: 'rose'
  },
  {
    name: '清明节',
    emoji: '🌿',
    start: '2027-04-03',
    end: '2027-04-05',
    days: 3,
    note: '周六至周一，不用调休',
    tone: 'mint'
  },
  {
    name: '劳动节',
    emoji: '🛠️',
    start: '2027-05-01',
    end: '2027-05-05',
    days: 5,
    note: '周六至周三 · 5/8 补班',
    tone: 'gold'
  },
  {
    name: '端午节',
    emoji: '🛶',
    start: '2027-06-09',
    end: '2027-06-09',
    days: 1,
    note: '周三，不调休',
    tone: 'green'
  },
  {
    name: '中秋节',
    emoji: '🥮',
    start: '2027-09-15',
    end: '2027-09-15',
    days: 1,
    note: '周三，不调休',
    tone: 'violet'
  },
  {
    name: '国庆节',
    emoji: '🇨🇳',
    start: '2027-10-01',
    end: '2027-10-07',
    days: 7,
    note: '周五至周四 · 9/26、10/9 补班',
    tone: 'red'
  },
  {
    name: '元旦',
    emoji: '🎉',
    start: '2028-01-01',
    end: '2028-01-01',
    days: null,
    note: '法定日期；调休安排待公布',
    tone: 'blue'
  },
  {
    name: '春节',
    emoji: '🧧',
    start: '2028-01-25',
    end: '2028-01-26',
    days: null,
    note: '除夕 1/25、初一 1/26 · 待公布',
    tone: 'rose'
  }
]

/** 因调休而需要上班的周末（用来判断「今天到底上不上班」） */
export const MAKEUP_WORKDAYS: string[] = [
  '2027-01-31',
  '2027-02-14',
  '2027-05-08',
  '2027-09-26',
  '2027-10-09'
]

/* ============================================================
 * 7. IPC 通道名
 * ============================================================ */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsReset: 'settings:reset',
  settingsChanged: 'settings:changed',
  sitState: 'sit:state',
  sitReset: 'sit:reset',
  sitSnooze: 'sit:snooze',
  sitAlert: 'sit:alert',
  notifyTest: 'notify:test',
  appMeta: 'app:meta',
  appAction: 'app:action',
  memoryStats: 'app:memory',
  miniToggle: 'mini:toggle',
  miniExpand: 'mini:expand',
  /* 技术雷达 */
  trendingView: 'trending:view',
  trendingRefresh: 'trending:refresh',
  trendingEnsure: 'trending:ensure',
  trendingChanged: 'trending:changed',
  trendingOpen: 'trending:open',
  aiTest: 'ai:test',
  secretsGet: 'secrets:get',
  secretsSave: 'secrets:save'
} as const

/* ============================================================
 * 8. 共用文案
 * ============================================================ */
export const COPY = {
  brand: APP.title,
  footer: {
    holiday: '假期数据来自国务院办公厅通知',
    privacy: '设置保存在本机',
    shortcut: 'F12 开发者工具'
  },
  sitAlert: {
    title: '该起来活动一下了',
    body: (minutes: number) => `你已经连续坐了 ${minutes} 分钟。站起来走两分钟，喝口水，看看远处。`,
    toastBody: (minutes: number) =>
      `你已经连续坐了 ${minutes} 分钟。站起来走两分钟、接杯水、看看远处，腰会谢谢你。`
  },
  notifyTest: {
    title: '现在是测试通知',
    body: (minutes: number) => `久坐提醒已就绪：每 ${minutes} 分钟提醒一次。`
  },
  /** 点关闭按钮时的询问框 */
  closePrompt: {
    title: '关闭窗口',
    message: '要直接退出，还是最小化到托盘继续运行？',
    detail:
      '最小化到托盘后程序继续在后台运行，倒计时和久坐提醒都不会断；\n想彻底结束请右键托盘图标选择「退出」。',
    /** 顺序必须和 resolveClose 里的 index 判断一致 */
    buttons: ['最小化到托盘', '直接退出', '取消'],
    remember: '记住我的选择，下次不再提示（可在设置里修改）'
  },
  tray: {
    tooltip: `${APP.title} · 倒计时进行中`,
    show: '显示主界面',
    quit: '退出',
    hintTitle: '还在后台运行',
    hintBody: '窗口已收进托盘。右键托盘图标可以随时显示或退出。'
  },
  mini: {
    /** 胶囊上的悬停提示：两个隐藏手势得有人告诉用户 */
    hint: '拖动顶部可移动 · 双击回到主界面',
    expand: '回到主界面',
    title: '迷你胶囊',
    /** 标题栏 / 设置页里按钮的说明 */
    action: '收成胶囊',
    shortcutHint: `快捷键 ${APP.miniShortcutLabel}`
  },
  preloadError: {
    title: 'preload 没有加载成功',
    body: '检查 electron/main.ts 里 webPreferences.preload 的路径。'
  }
} as const
