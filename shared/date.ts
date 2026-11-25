/**
 * shared/date.ts —— 纯日期工具（无 DOM、无 Node 依赖）
 * 主进程和渲染进程共用，避免两边对「今天是不是工作日」算出不同答案。
 */

import { TIMING } from './constants'

export const MS_PER_DAY = TIMING.msPerDay

export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 当天 00:00:00.000 */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 本地日期键 YYYY-MM-DD */
export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 解析 YYYY-MM-DD 为本地日期（不用 new Date(str)，避免被当成 UTC） */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** 把 HH:MM 套到某一天上 */
export function atTime(d: Date, hm: string): Date {
  const [h, m] = hm.split(':').map(Number)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0, 0, 0)
}

/** HH:MM → 当天第几分钟 */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** 某时刻是当天第几分钟 */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 星期几，1=周一 … 7=周日（和 Settings.workDays 的口径一致） */
export function weekdayOf(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay()
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** 两个日期相差的整天数（按本地零点算，不受夏令时影响） */
export function diffDays(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY)
}
