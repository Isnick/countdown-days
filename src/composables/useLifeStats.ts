/**
 * src/composables/useLifeStats.ts —— 已活天数 / 下次生日 / 这一岁的进度
 */

import { computed, type Ref } from 'vue'
import type { RichPart, Settings } from '@shared/types'
import { MS_PER_DAY, parseDate, startOfDay } from '@shared/date'
import { fmtYMD, thousands, weekName } from '@/utils/format'

export interface LifeView {
  /** 还没填出生日期 */
  empty: boolean
  /** 填了个未来的日期 */
  future: boolean
  daysLived: number | null
  /** 「3 岁 2 个月 5 天」 */
  ageText: string
  sub: RichPart[]
  pillText: string
  /** 距下次生日：主数字或「就是今天」 */
  nextMain: string
  /** 主数字后面的小字 */
  nextHint: string
  /** 这一岁已过的比例 0..1 */
  pct: number
  caption: string
  pctText: string
}

/** 生日到现在的年月日差 */
function ageParts(birth: Date, now: Date): { y: number; m: number; d: number } {
  let y = now.getFullYear() - birth.getFullYear()
  let m = now.getMonth() - birth.getMonth()
  let d = now.getDate() - birth.getDate()

  if (d < 0) {
    m -= 1
    d += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  if (m < 0) {
    m += 12
    y -= 1
  }
  return { y, m, d }
}

/** 下一次生日（今天生日则返回今天） */
function nextBirthday(birth: Date, now: Date): Date {
  const candidate = new Date(now.getFullYear(), birth.getMonth(), birth.getDate())
  return candidate < startOfDay(now)
    ? new Date(now.getFullYear() + 1, birth.getMonth(), birth.getDate())
    : candidate
}

export function useLifeStats(now: Ref<Date>, settings: Settings) {
  return computed<LifeView>(() => {
    const current = now.value
    const view: LifeView = {
      empty: true,
      future: false,
      daysLived: null,
      ageText: '',
      sub: [{ text: '填上出生日期，看看你在这个世界上待了多少天' }],
      pillText: '第 — 天',
      nextMain: '—',
      nextHint: '',
      pct: 0,
      caption: '这一岁的进度',
      pctText: '—'
    }

    if (!settings.birthday) return view

    const birth = parseDate(settings.birthday)
    if (birth > current) {
      return {
        ...view,
        empty: true,
        future: true,
        sub: [{ text: '出生日期不能晚于今天' }]
      }
    }

    const days = Math.floor((current.getTime() - birth.getTime()) / MS_PER_DAY)
    const age = ageParts(birth, current)
    const next = nextBirthday(birth, current)
    const left = Math.round((startOfDay(next).getTime() - startOfDay(current).getTime()) / MS_PER_DAY)

    // 这一岁（上次生日 → 下次生日）的进度
    const previous = new Date(next.getFullYear() - 1, birth.getMonth(), birth.getDate())
    const span = next.getTime() - previous.getTime()
    const pct = span > 0 ? Math.min(1, Math.max(0, (current.getTime() - previous.getTime()) / span)) : 0

    return {
      empty: false,
      future: false,
      daysLived: days,
      ageText: `${age.y} 岁 ${age.m} 个月 ${age.d} 天`,
      sub: [
        { text: '出生于 ' },
        { text: `${fmtYMD(birth)} 星期${weekName(birth)}`, strong: true },
        { text: ` · ${age.y} 岁 ${age.m} 个月 ${age.d} 天` }
      ],
      pillText: `第 ${thousands(days + 1)} 天`,
      nextMain: left === 0 ? '就是今天' : String(left),
      nextHint: left === 0 ? '生日快乐' : '天',
      pct,
      caption: `${age.y} 岁这一年的进度`,
      pctText: `${(pct * 100).toFixed(1)}%`
    }
  })
}
