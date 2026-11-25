/**
 * src/utils/holidays.ts —— 假期 / 工作日判断
 * 数据本身在 shared/constants.ts 的 HOLIDAY_TABLE / MAKEUP_WORKDAYS 里。
 */

import { HOLIDAY_TABLE, LIMITS, MAKEUP_WORKDAYS } from '@shared/constants'
import { atTime, addDays, keyOf, parseDate, weekdayOf } from '@shared/date'
import type { HolidayRule } from '@shared/types'

/** 假期区间（已解析成 Date） */
export interface HolidayRange {
  rule: HolidayRule
  start: Date
  end: Date
}

export const holidayRanges: HolidayRange[] = HOLIDAY_TABLE.map((rule) => ({
  rule,
  start: parseDate(rule.start),
  end: parseDate(rule.end)
}))

/** 某天落在哪个假期里（没有则 null） */
export function holidayOn(date: Date): HolidayRule | null {
  const key = keyOf(date)
  return HOLIDAY_TABLE.find((h) => key >= h.start && key <= h.end) ?? null
}

export function isMakeupDay(date: Date): boolean {
  return MAKEUP_WORKDAYS.includes(keyOf(date))
}

/**
 * 今天到底上不上班：先看是否调休上班日，再看是否在法定假期，
 * 最后看用户勾选的星期。
 */
export function isWorkday(date: Date, workDays: number[]): boolean {
  if (isMakeupDay(date)) return true
  if (holidayOn(date)) return false
  return workDays.includes(weekdayOf(date))
}

/** 从 from 往后找第一个「要上班的那天」的上班时刻 */
export function nextWorkStart(from: Date, workDays: number[], workStart: string): Date {
  for (let i = 0; i < LIMITS.nextWorkSearchDays; i += 1) {
    const day = addDays(from, i)
    if (!isWorkday(day, workDays)) continue
    const at = atTime(day, workStart)
    if (at > from) return at
  }
  // 兜底：正常数据不会走到这里
  return atTime(addDays(from, 1), workStart)
}

/** 今天及之后还没结束的假期，按开始时间排序 */
export function upcomingHolidays(today: Date): HolidayRange[] {
  return holidayRanges.filter((h) => h.end >= today)
}
