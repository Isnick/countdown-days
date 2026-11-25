/**
 * src/composables/useHolidays.ts —— 假期倒计时列表
 */

import { computed, type Ref } from 'vue'
import type { HolidayRule } from '@shared/types'
import { keyOf, MS_PER_DAY, parseDate, startOfDay } from '@shared/date'
import { weekName } from '@/utils/format'
import { upcomingHolidays } from '@/utils/holidays'

export interface HolidayCardModel {
  key: string
  rule: HolidayRule
  /** 列表里的「下一个」 */
  isNext: boolean
  /** 今天开始放假 */
  isToday: boolean
  /** 数字位显示的内容（倒计时数字，或「今天开始 / 还剩 N 天」） */
  daysText: string
  /** 数字位显示的是文字（字号要小一档） */
  isText: boolean
  /** 是否显示「天」这个单位 */
  showUnit: boolean
  rangeText: string
  noteText: string
}

const ymd = (d: Date): string => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
const md = (d: Date): string => `${d.getMonth() + 1}.${d.getDate()}`

/** 「2027.01.01 周五 — 01.03」这样的日期区间 */
function rangeTextOf(rule: HolidayRule): string {
  const start = parseDate(rule.start)
  const end = parseDate(rule.end)

  if (keyOf(start) === keyOf(end)) return `${ymd(start)} 周${weekName(start)}`
  if (start.getFullYear() === end.getFullYear()) return `${ymd(start)} — ${md(end)}`
  return `${ymd(start)} — ${ymd(end)}`
}

export function useHolidays(now: Ref<Date>) {
  return computed<HolidayCardModel[]>(() => {
    const today = startOfDay(now.value)
    const list = upcomingHolidays(today)
    if (!list.length) return []

    // 「下一个」标记给第一个还没开始的假期；正在放假时列表第一张仍然高亮
    const nextIndex = Math.max(
      0,
      list.findIndex((item) => item.start > today)
    )

    return list.map((item, index) => {
      const daysUntil = Math.round((item.start.getTime() - today.getTime()) / MS_PER_DAY)
      const isToday = daysUntil === 0
      const remaining = isToday ? 0 : Math.round((item.end.getTime() - today.getTime()) / MS_PER_DAY) + 1

      return {
        key: `${item.rule.name}-${item.rule.start}`,
        rule: item.rule,
        isNext: index === nextIndex,
        isToday,
        daysText: daysUntil > 0 ? String(daysUntil) : isToday ? '今天开始' : `还剩 ${remaining} 天`,
        isText: daysUntil <= 0,
        showUnit: daysUntil > 0,
        rangeText: rangeTextOf(item.rule),
        noteText: `${item.rule.days ? `放假 ${item.rule.days} 天 · ` : ''}${item.rule.note}`
      }
    })
  })
}
