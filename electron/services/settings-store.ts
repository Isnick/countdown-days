/**
 * electron/services/settings-store.ts —— 设置持久化
 * 职责：读写 %APPDATA%/CountdownDays/settings.json，并在落盘前统一消毒。
 * 主进程是设置的唯一事实来源，渲染进程只拿到副本。
 */

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { CLOSE_ACTIONS, DEFAULTS, LIMITS, PATTERNS, TRENDING } from '../../shared/constants'
import type { CloseAction, Settings, WindowPosition } from '../../shared/types'

let current: Settings = { ...DEFAULTS }
let cachedFile = ''

/** 设置文件的绝对路径（首次调用时解析） */
export function settingsFile(): string {
  if (!cachedFile) cachedFile = path.join(app.getPath('userData'), 'settings.json')
  return cachedFile
}

/** 合法的时间字符串，否则回落到默认值 */
function safeTime(value: unknown, fallback: string): string {
  return PATTERNS.time.test(String(value)) ? String(value) : fallback
}

/** 关闭行为只认三个值，其它一律回落到「每次询问」 */
function safeCloseAction(value: unknown): CloseAction {
  const text = String(value)
  return (CLOSE_ACTIONS as readonly string[]).includes(text) ? (text as CloseAction) : DEFAULTS.closeAction
}

/**
 * 胶囊位置：只接受两个有限数字，其它（null / 缺字段 / 手改成的字符串）一律当没存过。
 * 是否还在屏幕范围内由 mini-window 在开窗时判断 —— 那需要 screen 模块，不适合放在这里。
 */
function safePosition(value: unknown): WindowPosition | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<WindowPosition>
  const x = Number(raw.x)
  const y = Number(raw.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * 模型接口地址：必须是 http(s)，顺手去掉结尾的斜杠（拼 /chat/completions 时才不会出现 //）。
 */
function safeUrl(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim().replace(/\/+$/, '')
  return PATTERNS.url.test(text) ? text : fallback
}

/** 模型名允许 org/model、带版本号这类写法，但不接受空白和控制字符 */
function safeModel(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim()
  return /^[\w.:/\-]{1,80}$/.test(text) ? text : fallback
}

/**
 * 用户可能手改文件、也可能传奇怪的 IPC，落盘前统一消毒一遍。
 */
export function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULTS, ...(raw ?? {}) }

  const out: Settings = {
    workStart: safeTime(s.workStart, DEFAULTS.workStart),
    workEnd: safeTime(s.workEnd, DEFAULTS.workEnd),
    workDays: (Array.isArray(s.workDays) ? s.workDays : DEFAULTS.workDays)
      .map(Number)
      .filter((d) => d >= 1 && d <= 7),
    birthday: PATTERNS.date.test(String(s.birthday ?? '')) ? String(s.birthday) : '',
    sitEnabled: s.sitEnabled !== false,
    sitIntervalMin: Math.min(
      LIMITS.sitIntervalMin.max,
      Math.max(LIMITS.sitIntervalMin.min, Math.round(Number(s.sitIntervalMin) || DEFAULTS.sitIntervalMin))
    ),
    sitWorkHoursOnly: s.sitWorkHoursOnly !== false,
    sitNotify: s.sitNotify !== false,
    closeAction: safeCloseAction(s.closeAction),
    lowMemoryMode: s.lowMemoryMode === true,
    miniPosition: safePosition(s.miniPosition),
    trendingEnabled: s.trendingEnabled !== false,
    trendingPollHours: Math.min(
      TRENDING.pollHours.max,
      Math.max(
        TRENDING.pollHours.min,
        Math.round(Number(s.trendingPollHours) || TRENDING.pollHours.defaultValue)
      )
    ),
    aiBaseUrl: safeUrl(s.aiBaseUrl, DEFAULTS.aiBaseUrl),
    aiModel: safeModel(s.aiModel, DEFAULTS.aiModel)
  }

  // 去重 + 兜底：一天都不选的话倒计时没法算
  out.workDays = [...new Set(out.workDays)].sort((a, b) => a - b)
  if (out.workDays.length < LIMITS.minWorkDays) out.workDays = [...DEFAULTS.workDays]

  // 下班不晚于上班时，当天倒计时会算成负数，直接纠回默认值
  if (out.workEnd <= out.workStart) {
    out.workStart = DEFAULTS.workStart
    out.workEnd = DEFAULTS.workEnd
  }

  return out
}

/**
 * 启动最早期同步读一次「省内存模式」。
 * app.disableHardwareAcceleration() 必须在 ready 之前调用，等不了异步读盘，
 * 所以这里破例用一次 readFileSync：只读一个字段，文件也很小。
 */
export function peekLowMemoryMode(): boolean {
  try {
    const raw = readFileSync(settingsFile(), 'utf8')
    return (JSON.parse(raw) as Partial<Settings>).lowMemoryMode === true
  } catch {
    return false
  }
}

/** 首次启动或文件损坏时静默用默认值，等用户改设置时再写盘 */
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsFile(), 'utf8')
    current = normalizeSettings(JSON.parse(raw) as Partial<Settings>)
  } catch {
    current = { ...DEFAULTS }
  }
  return current
}

export async function persistSettings(): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(settingsFile()), { recursive: true })
    await fs.writeFile(settingsFile(), JSON.stringify(current, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('[settings] 写入失败：', (err as Error).message)
    return false
  }
}

export function getSettings(): Settings {
  return current
}

/** 合并补丁 → 消毒 → 落盘，返回消毒后的完整设置 */
export async function updateSettings(patch: Partial<Settings> | null): Promise<Settings> {
  current = normalizeSettings({ ...current, ...(patch ?? {}) })
  await persistSettings()
  return current
}

/** 恢复默认值并落盘 */
export async function resetSettings(): Promise<Settings> {
  current = { ...DEFAULTS }
  await persistSettings()
  return current
}
