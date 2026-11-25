/**
 * src/utils/festivals.ts —— 日历上的所有标记
 * ------------------------------------------------------------------
 * 一天可能同时压着好几件事，这里按「从重到轻」的顺序收进 items：
 *   holiday  法定节假日（醒目色块），来自 shared/constants.ts 的 HOLIDAY_TABLE
 *   makeup   调休上班日（角标「班」），来自 MAKEUP_WORKDAYS
 *   lunar    农历传统节日与小节（春节 / 元宵 / 腊八 / 小年 / 除夕…），见 utils/lunar.ts
 *   term     二十四节气
 *   festival 国际 / 纪念 / 民间节日，按公历规则现场算，任何年份都有
 * 格子里那行小字只露一条，优先级：假期 > 传统节日 > 节气 > 国际节日 > 农历日期，
 * 其余条目照旧在点击后的详情里列出来。
 */

import { HOLIDAY_TABLE, MAKEUP_WORKDAYS } from '@shared/constants'
import { keyOf, parseDate } from '@shared/date'
import type { HolidayRule } from '@shared/types'
import { lunarFestivalOf, solarTermOn, solarToLunar, type LunarDate } from './lunar'

export type FestivalKind = 'holiday' | 'makeup' | 'lunar' | 'term' | 'festival'

/** 格子上的小字可能是「农历日期」，单独给个类型 */
export type CaptionKind = FestivalKind | 'lunarDay'

export interface FestivalItem {
  name: string
  /** 格子里的短名，尽量 2-4 个字 */
  short: string
  kind: FestivalKind
  emoji: string
  /** 补充说明，法定假期和传统节日会有 */
  note?: string
}

export interface DayInfo {
  items: FestivalItem[]
  /** 格子上那一行小字，没有就是 null */
  caption: { text: string; kind: CaptionKind } | null
  /** 当天的农历，超出数据范围时为 null */
  lunar: LunarDate | null
}

interface FixedRule {
  month: number
  day: number
  name: string
  short: string
  emoji: string
}

interface FloatingRule {
  month: number
  /** 第几个（1 起） */
  nth: number
  /** 0=周日 … 6=周六 */
  weekday: number
  name: string
  short: string
  emoji: string
}

/** 公历固定日期的国际 / 纪念 / 民间节日 */
const FIXED: FixedRule[] = [
  { month: 1, day: 1, name: '元旦', short: '元旦', emoji: '🎊' },
  { month: 2, day: 2, name: '世界湿地日', short: '湿地日', emoji: '🪷' },
  { month: 2, day: 14, name: '情人节', short: '情人节', emoji: '💐' },
  { month: 3, day: 8, name: '妇女节', short: '妇女节', emoji: '🌷' },
  { month: 3, day: 12, name: '植树节', short: '植树节', emoji: '🌳' },
  { month: 3, day: 15, name: '消费者权益日', short: '权益日', emoji: '🛡️' },
  { month: 4, day: 1, name: '愚人节', short: '愚人节', emoji: '🃏' },
  { month: 4, day: 22, name: '世界地球日', short: '地球日', emoji: '🌍' },
  { month: 4, day: 23, name: '世界读书日', short: '读书日', emoji: '📚' },
  { month: 5, day: 1, name: '劳动节', short: '劳动节', emoji: '🔧' },
  { month: 5, day: 4, name: '青年节', short: '青年节', emoji: '✊' },
  { month: 5, day: 12, name: '国际护士节', short: '护士节', emoji: '💉' },
  { month: 6, day: 1, name: '儿童节', short: '儿童节', emoji: '🎈' },
  { month: 6, day: 5, name: '世界环境日', short: '环境日', emoji: '🌱' },
  { month: 7, day: 1, name: '建党节', short: '建党节', emoji: '🚩' },
  { month: 8, day: 1, name: '建军节', short: '建军节', emoji: '🎖️' },
  { month: 9, day: 10, name: '教师节', short: '教师节', emoji: '📖' },
  { month: 10, day: 1, name: '国庆节', short: '国庆节', emoji: '🇨🇳' },
  { month: 10, day: 31, name: '万圣节', short: '万圣节', emoji: '🎃' },
  { month: 11, day: 11, name: '光棍节', short: '光棍节', emoji: '🛒' },
  { month: 12, day: 24, name: '平安夜', short: '平安夜', emoji: '🎄' },
  { month: 12, day: 25, name: '圣诞节', short: '圣诞节', emoji: '🎁' },
  { month: 12, day: 31, name: '跨年夜', short: '跨年', emoji: '🎆' }
]

/** 按「某月第几个星期几」计算的节日 */
const FLOATING: FloatingRule[] = [
  { month: 5, nth: 2, weekday: 0, name: '母亲节', short: '母亲节', emoji: '💝' },
  { month: 6, nth: 3, weekday: 0, name: '父亲节', short: '父亲节', emoji: '👔' },
  { month: 11, nth: 4, weekday: 4, name: '感恩节', short: '感恩节', emoji: '🦃' }
]

/** 传统节日在格子里的短名（「小年（北）」写不下） */
const LUNAR_SHORT: Record<string, string> = {
  春节: '春节',
  元宵节: '元宵',
  龙头节: '龙抬头',
  端午节: '端午',
  七夕节: '七夕',
  中元节: '中元',
  中秋节: '中秋',
  重阳节: '重阳',
  寒衣节: '寒衣',
  下元节: '下元',
  腊八节: '腊八',
  '小年（北）': '小年',
  '小年（南）': '小年',
  除夕: '除夕'
}

/** 二十四节气，顺序与 lunar.ts 里的表一致（这里只用来挑图标） */
const TERM_NAMES = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
]

/** 节气按季节换个图标，纯装饰 */
function termEmoji(index: number): string {
  if (index <= 1 || index >= 20) return '❄️'
  if (index <= 7) return '🌱'
  if (index <= 13) return '☀️'
  return '🍂'
}

/** 法定假期逐日展开：YYYY-MM-DD → 假期规则 */
const HOLIDAY_DAYS: Map<string, HolidayRule> = (() => {
  const map = new Map<string, HolidayRule>()
  for (const rule of HOLIDAY_TABLE) {
    const cursor = parseDate(rule.start)
    const end = parseDate(rule.end)
    // 区间不会超过几十天，guard 只是防脏数据死循环
    for (let guard = 0; cursor <= end && guard < 60; guard += 1) {
      map.set(keyOf(cursor), rule)
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return map
})()

const MAKEUP_DAYS = new Set(MAKEUP_WORKDAYS)

/** 法定假期数据覆盖的年份（日历底部用来提示数据范围） */
export const HOLIDAY_YEARS: number[] = [
  ...new Set(
    HOLIDAY_TABLE.flatMap((rule) => [rule.start, rule.end]).map((text) => Number(text.slice(0, 4)))
  )
].sort((a, b) => a - b)

/** 某月第 nth 个星期几是几号 */
function nthWeekdayOfMonth(year: number, month: number, nth: number, weekday: number): number {
  if (nth > 0) {
    const first = new Date(year, month - 1, 1)
    const offset = (weekday - first.getDay() + 7) % 7
    return 1 + offset + (nth - 1) * 7
  }
  const last = new Date(year, month, 0)
  const offset = (last.getDay() - weekday + 7) % 7
  return last.getDate() - offset
}

/** 某一天的全部标记 + 格子上要显示的小字 */
export function dayInfo(date: Date): DayInfo {
  const items: FestivalItem[] = []
  const key = keyOf(date)
  const lunar = solarToLunar(date)

  // 1. 法定假期
  const holiday = HOLIDAY_DAYS.get(key)
  if (holiday) {
    items.push({
      name: holiday.name,
      short: holiday.name,
      kind: 'holiday',
      emoji: holiday.emoji,
      note: holiday.days ? `放假 ${holiday.days} 天 · ${holiday.note}` : holiday.note
    })
  }
  // 2. 调休上班
  if (MAKEUP_DAYS.has(key)) {
    items.push({
      name: '调休上班',
      short: '班',
      kind: 'makeup',
      emoji: '💼',
      note: '因调休需要上班的周末'
    })
  }

  const taken = new Set(items.map((item) => item.name))

  // 3. 农历传统节日（闰月不算节）
  // 名字和法定假期重名时（春节 / 端午节 / 中秋节）不重复进列表，
  // 但格子小字仍然要用它 —— 初一该写「春节」而不是「正月」。
  const lunarName = lunar ? lunarFestivalOf(lunar) : null
  if (lunar && lunarName && !taken.has(lunarName)) {
    items.push({
      name: lunarName,
      short: LUNAR_SHORT[lunarName] ?? lunarName.slice(0, 3),
      kind: 'lunar',
      emoji: '🏮',
      note: `农历${lunar.text}`
    })
    taken.add(lunarName)
  }

  // 4. 二十四节气
  const term = solarTermOn(date)
  if (term && !taken.has(term)) {
    items.push({
      name: term,
      short: term,
      kind: 'term',
      emoji: termEmoji(TERM_NAMES.indexOf(term)),
      note: '二十四节气'
    })
    taken.add(term)
  }

  // 5. 国际 / 纪念 / 民间节日
  const month = date.getMonth() + 1
  const day = date.getDate()
  for (const rule of FIXED) {
    if (rule.month !== month || rule.day !== day || taken.has(rule.name)) continue
    items.push({ name: rule.name, short: rule.short, kind: 'festival', emoji: rule.emoji })
    taken.add(rule.name)
  }
  for (const rule of FLOATING) {
    if (rule.month !== month || taken.has(rule.name)) continue
    if (nthWeekdayOfMonth(date.getFullYear(), month, rule.nth, rule.weekday) !== day) continue
    items.push({ name: rule.name, short: rule.short, kind: 'festival', emoji: rule.emoji })
  }

  return {
    items,
    caption: captionOf(items, lunar, holiday?.start === key, lunarName),
    lunar
  }
}

/**
 * 格子里那行小字：一天只露一条。
 * 优先级：传统节日 > 假期首日 > 节气 > 国际节日 > 农历日期。
 * 假期的后续几天不再重复写假期名（玫红色块已经说明一切），改回农历日，
 * 这样「除夕 / 春节 / 初二 / 初三」能自然连起来；初一则显示月名（正月 / 腊月）。
 */
function captionOf(
  items: FestivalItem[],
  lunar: LunarDate | null,
  holidayStartsToday: boolean,
  lunarName: string | null
): DayInfo['caption'] {
  if (lunarName) return { text: LUNAR_SHORT[lunarName] ?? lunarName.slice(0, 3), kind: 'lunar' }

  const holiday = items.find((item) => item.kind === 'holiday')
  if (holiday && holidayStartsToday) return { text: holiday.short, kind: 'holiday' }

  const term = items.find((item) => item.kind === 'term')
  if (term) return { text: term.short, kind: 'term' }

  const festival = items.find((item) => item.kind === 'festival')
  if (festival) return { text: festival.short, kind: 'festival' }

  if (!lunar) return null
  if (lunar.day === 1) return { text: lunar.monthName, kind: 'lunarDay' }
  return { text: lunar.dayName, kind: 'lunarDay' }
}
