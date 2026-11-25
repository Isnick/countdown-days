/**
 * electron/services/sit-service.ts —— 久坐计时（主进程持有唯一状态）
 * ------------------------------------------------------------------
 * 为什么放在主进程：窗口最小化、被遮挡时渲染进程的定时器会被 Chromium 降频，
 * 而「该起来活动了」恰恰是你不看窗口的时候最需要。主进程的 setInterval 不受影响。
 */

import { LIMITS, TIMING } from '../../shared/constants'
import { hmToMinutes, keyOf, minutesOfDay, weekdayOf } from '../../shared/date'
import { getSettings } from './settings-store'
import type { SitAlertPayload, SitState } from '../../shared/types'

interface SitListeners {
  /** 状态变化时广播给页面 */
  onState: (state: SitState) => void
  /** 到点提醒（系统通知 / 气泡 / 任务栏闪烁由调用方决定） */
  onAlert: (payload: SitAlertPayload) => void
}

export class SitService {
  private since = Date.now()
  private lastAlertAt = 0
  private alertsToday = 0
  private dayKey = ''
  private timer: ReturnType<typeof setInterval> | null = null
  /** 上一次推送给页面的状态指纹，用来去重 */
  private lastPushKey = ''
  private lastPushAt = 0

  constructor(private readonly listeners: SitListeners) {}

  /** 启动 10 秒粒度的检查循环 */
  start(): void {
    this.stop()
    this.dayKey = keyOf(new Date())
    this.since = Date.now()
    this.lastAlertAt = 0
    this.timer = setInterval(() => this.tick(), TIMING.sitTickMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** 只认用户勾选的星期；法定节假日 / 调休在渲染进程里叠加判断 */
  private isScheduledWorkday(d: Date): boolean {
    return getSettings().workDays.includes(weekdayOf(d))
  }

  private inWorkWindow(d: Date): boolean {
    const settings = getSettings()
    const m = minutesOfDay(d)
    return m >= hmToMinutes(settings.workStart) && m < hmToMinutes(settings.workEnd)
  }

  /** 当前是否应该计时：关了提醒、或（只在工作时段提醒时）不在工作时段，就暂停 */
  private shouldTrack(now: number): boolean {
    const settings = getSettings()
    if (!settings.sitEnabled) return false
    const d = new Date(now)
    if (settings.sitWorkHoursOnly && (!this.isScheduledWorkday(d) || !this.inWorkWindow(d))) return false
    return true
  }

  getState(): SitState {
    const settings = getSettings()
    return {
      since: this.since,
      lastAlertAt: this.lastAlertAt,
      alertsToday: this.alertsToday,
      tracking: this.shouldTrack(Date.now()),
      intervalMin: settings.sitIntervalMin,
      enabled: settings.sitEnabled,
      workHoursOnly: settings.sitWorkHoursOnly
    }
  }

  /** 用户点「我起来活动了」 */
  reset(): SitState {
    this.since = Date.now()
    this.lastAlertAt = 0
    this.broadcast(true)
    return this.getState()
  }

  /** 「稍后提醒」：把起点往前挪，让剩余时间正好等于 delayMin */
  snooze(minutes: number = LIMITS.snooze.defaultValue): SitState {
    const delay = Math.min(LIMITS.snooze.max, Math.max(LIMITS.snooze.min, Number(minutes) || LIMITS.snooze.defaultValue))
    const intervalMs = getSettings().sitIntervalMin * 60_000
    this.since = Date.now() - Math.max(0, intervalMs - delay * 60_000)
    this.lastAlertAt = 0
    this.broadcast(true)
    return this.getState()
  }

  /** 设置变更后重新对齐（间隔 / 开关变了，界面上的水位球要立刻反映） */
  notifySettingsChanged(): void {
    this.broadcast(true)
  }

  private tick(): void {
    const now = Date.now()
    const key = keyOf(new Date(now))

    // 跨天清零
    if (key !== this.dayKey) {
      this.dayKey = key
      this.alertsToday = 0
      this.since = now
      this.lastAlertAt = 0
    }

    if (!this.shouldTrack(now)) {
      // 不在计时区间（下班了 / 关了提醒）：起点一直推到「现在」，
      // 这样第二天上班时不会一开窗就弹「你已坐了 15 小时」
      this.since = now
    } else {
      const elapsedMin = (now - this.since) / 60_000
      const cooled = now - this.lastAlertAt > TIMING.alertCooldownMs
      if (elapsedMin >= getSettings().sitIntervalMin && cooled) {
        this.fireAlert()
        return
      }
    }

    this.broadcast()
  }

  private fireAlert(): void {
    const settings = getSettings()
    this.lastAlertAt = Date.now()
    this.alertsToday += 1
    // 提醒后重新计时，用户不理也不会每 10 秒响一次
    this.since = Date.now()

    this.listeners.onAlert({ minutes: settings.sitIntervalMin, alertsToday: this.alertsToday })
    this.broadcast(true)
  }

  private broadcast(force = false): void {
    const state = this.getState()
    // 页面上的进度条是拿 since 自己算的，状态没变化时没必要每 10 秒推一次，
    // 只在「有意义的变化」或一分钟一次心跳时推送，减少 IPC 与重渲染。
    const key = [state.tracking, state.enabled, state.intervalMin, state.workHoursOnly, state.alertsToday, state.tracking ? state.since : 0].join('|')
    const now = Date.now()
    if (!force && key === this.lastPushKey && now - this.lastPushAt < TIMING.sitHeartbeatMs) return
    this.lastPushKey = key
    this.lastPushAt = now
    this.listeners.onState(state)
  }
}
