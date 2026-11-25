/**
 * src/composables/useTodayLine.ts —— 标题栏右侧那行「今天是… · 距xx还有 N 天」
 */

import { computed, type Ref } from 'vue'
import type { RichPart } from '@shared/types'
import { MS_PER_DAY, startOfDay } from '@shared/date'
import { fmtYMD, weekName } from '@/utils/format'
import { upcomingHolidays } from '@/utils/holidays'

export function useTodayLine(now: Ref<Date>) {
  return computed<RichPart[]>(() => {
    const current = now.value
    const today = startOfDay(current)
    const parts: RichPart[] = [{ text: `今天是 ${fmtYMD(current)} 星期${weekName(current)}` }]

    const next = upcomingHolidays(today)[0]
    if (next) {
      const days = Math.round((next.start.getTime() - today.getTime()) / MS_PER_DAY)
      if (days > 0) {
        parts.push(
          { text: ` · 距${next.rule.name}还有 ` },
          { text: String(days), strong: true },
          { text: ' 天' }
        )
      } else {
        parts.push({ text: ` · ${next.rule.name}假期中` })
      }
    }

    return parts
  })
}
