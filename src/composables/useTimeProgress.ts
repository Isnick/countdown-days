/**
 * src/composables/useTimeProgress.ts —— 今天 / 本周 / 今年 的时间进度
 */

import { computed, type Ref } from 'vue'
import { PROGRESS_ROWS } from '@shared/constants'
import { startOfDay, weekdayOf } from '@shared/date'
import { words } from '@/utils/format'

export interface ProgressRow {
  key: string
  label: string
  tone: string
  pct: number
  pctText: string
  footText: string
}

export interface ProgressView {
  rows: ProgressRow[]
  year: string
}

export function useTimeProgress(now: Ref<Date>) {
  return computed<ProgressView>(() => {
    const current = now.value
    const todayZero = startOfDay(current)
    const tomorrowZero = new Date(todayZero.getFullYear(), todayZero.getMonth(), todayZero.getDate() + 1)
    // 本周按周一到周日算
    const weekZero = new Date(
      todayZero.getFullYear(),
      todayZero.getMonth(),
      todayZero.getDate() - (weekdayOf(current) - 1)
    )
    const weekEnd = new Date(weekZero.getFullYear(), weekZero.getMonth(), weekZero.getDate() + 7)
    const yearZero = new Date(current.getFullYear(), 0, 1)
    const yearEnd = new Date(current.getFullYear() + 1, 0, 1)

    const ranges: Array<[Date, Date]> = [
      [todayZero, tomorrowZero],
      [weekZero, weekEnd],
      [yearZero, yearEnd]
    ]

    const rows = PROGRESS_ROWS.map((row, index) => {
      const [from, to] = ranges[index] ?? ranges[0]
      const span = to.getTime() - from.getTime()
      const pct = span > 0 ? Math.min(1, Math.max(0, (current.getTime() - from.getTime()) / span)) : 0
      return {
        key: row.key,
        label: row.label,
        tone: row.tone,
        pct,
        pctText: `${(pct * 100).toFixed(1)}%`,
        footText: `还剩 ${words(to.getTime() - current.getTime())}`
      }
    })

    return { rows, year: String(current.getFullYear()) }
  })
}
