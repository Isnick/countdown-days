/**
 * src/composables/useWorkCountdown.ts —— 下班 / 上班倒计时
 * 五种状态：假期中、休息日、还没上班、工作中、已下班。
 */

import { computed, type Ref } from 'vue'
import type { RichPart, Settings } from '@shared/types'
import { atTime, parseDate } from '@shared/date'
import { durText, fmtMD, weekName, words } from '@/utils/format'
import { holidayOn, isWorkday, nextWorkStart } from '@/utils/holidays'

export interface WorkView {
  label: string
  text: string
  sub: RichPart[]
  pct: number
  pillText: string
  pillClass: string
  timerClass: string
  /** 卡片强调色，用于进度条 */
  tone: 'teal' | 'gold' | 'idle'
}

const base = (): WorkView => ({
  label: '下班倒计时',
  text: '--:--:--',
  sub: [],
  pct: 0,
  pillText: '—',
  pillClass: 'pill',
  timerClass: 'timer',
  tone: 'teal'
})

export function useWorkCountdown(now: Ref<Date>, settings: Settings) {
  return computed<WorkView>(() => {
    const current = now.value
    const start = atTime(current, settings.workStart)
    const end = atTime(current, settings.workEnd)
    const t = current.getTime()
    let view = base()

    if (!isWorkday(current, settings.workDays)) {
      const holiday = holidayOn(current)
      if (holiday) {
        // 正在放假：显示还能休多久
        const holidayStart = parseDate(holiday.start)
        const holidayEnd = parseDate(holiday.end)
        holidayEnd.setHours(23, 59, 59, 999)
        const span = holidayEnd.getTime() - holidayStart.getTime()
        view = {
          label: '假期剩余',
          text: durText(holidayEnd.getTime() - t),
          sub: [{ text: `${holiday.name}假期 · 共 ${holiday.days ?? '待定'} 天 · ${fmtMD(holidayStart)} 起` }],
          pct: span > 0 ? Math.min(1, Math.max(0, (t - holidayStart.getTime()) / span)) : 0,
          pillText: '假期中',
          pillClass: 'pill pill-warn',
          timerClass: 'timer is-off',
          tone: 'gold'
        }
      } else {
        const next = nextWorkStart(current, settings.workDays, settings.workStart)
        view = {
          label: '距离上班',
          text: durText(next.getTime() - t),
          sub: [
            { text: '今天是休息日 · 下次上班 ' },
            { text: `${fmtMD(next)} 周${weekName(next)} ${settings.workStart}`, strong: true }
          ],
          pct: 0,
          pillText: '休息日',
          pillClass: 'pill pill-muted',
          timerClass: 'timer is-idle',
          tone: 'idle'
        }
      }
    } else if (current < start) {
      view = {
        label: '距离上班',
        text: durText(start.getTime() - t),
        sub: [
          { text: '今天 ' },
          { text: settings.workStart, strong: true },
          { text: ` 上班 · 到点下班还有 ${words(end.getTime() - start.getTime())}` }
        ],
        pct: 0,
        pillText: '还没上班',
        pillClass: 'pill pill-muted',
        timerClass: 'timer is-idle',
        tone: 'idle'
      }
    } else if (current < end) {
      view = {
        label: '下班倒计时',
        text: durText(end.getTime() - t),
        sub: [
          { text: '已工作 ' },
          { text: words(t - start.getTime()), strong: true },
          { text: ` · 工作时段 ${settings.workStart} — ${settings.workEnd}` }
        ],
        pct: (t - start.getTime()) / (end.getTime() - start.getTime()),
        pillText: '工作中',
        pillClass: 'pill',
        timerClass: 'timer',
        tone: 'teal'
      }
    } else {
      // 下班之后正计时，看看今天多留了多久
      view = {
        label: '今天已下班',
        text: `+${durText(t - end.getTime())}`,
        sub: [
          { text: '今天工作了 ' },
          { text: words(end.getTime() - start.getTime()), strong: true },
          { text: ` · ${settings.workEnd} 下的班` }
        ],
        pct: 1,
        pillText: '已下班',
        pillClass: 'pill pill-muted',
        timerClass: 'timer is-off',
        tone: 'gold'
      }
    }

    // 数字变长（带「天」）时字号要收一档，否则会顶到卡片边缘
    if (view.text.length > 13) view.timerClass += ' is-long'
    return view
  })
}
