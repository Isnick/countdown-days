/**
 * src/utils/lunar.ts —— 农历 / 节气 / 干支
 * ------------------------------------------------------------------
 * 数据在 calendar-data.ts（由 scripts/gen-calendar-data.mjs 生成），这里只做换算：
 *   solarToLunar  公历 → 农历（含闰月、月名、日名、干支年）
 *   solarTermOn   当天是不是二十四节气之一
 *   lunarFestival 农历传统节日与小节（春节 / 元宵 / 腊八 / 小年 / 除夕…）
 * 支持范围 1900-01-31 ～ 2100-12-31，超出范围返回 null，日历会自动降级成只显示公历。
 */

import { LUNAR_INFO, LUNAR_START_YEAR, SOLAR_TERM_DAYS } from './calendar-data'

const MS_PER_DAY = 86_400_000
/** 表内第一天：1900-01-31（正月初一） */
const BASE_UTC = Date.UTC(1900, 0, 31)
/** 表内最后一年 */
const LAST_YEAR = LUNAR_START_YEAR + LUNAR_INFO.length - 1

/** 农历日名，下标 0 对应初一 */
const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
]

/** 农历月名，下标 0 对应正月 */
const MONTH_NAMES = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月'
]

/** 二十四节气，顺序与 SOLAR_TERM_DAYS 的两位一组完全对应 */
export const SOLAR_TERM_NAMES = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
] as const

const GAN = '甲乙丙丁戊己庚辛壬癸'
const ZHI = '子丑寅卯辰巳午未申酉戌亥'

export interface LunarDate {
  /** 农历年（干支年的那个数字，例如 2027） */
  year: number
  /** 1-12 */
  month: number
  /** 1-30 */
  day: number
  /** 是否是闰月 */
  isLeap: boolean
  /** 正月 / 腊月 … */
  monthName: string
  /** 初一 / 廿三 … */
  dayName: string
  /** 丁未年 */
  ganZhiYear: string
  /** 「正月初一」这样的完整写法 */
  text: string
}

/** 该农历年的闰月月份，0 表示没有闰月 */
function leapMonth(year: number): number {
  return LUNAR_INFO[year - LUNAR_START_YEAR] & 0xf
}

/** 闰月天数（没有闰月返回 0） */
function leapDays(year: number): number {
  if (!leapMonth(year)) return 0
  return LUNAR_INFO[year - LUNAR_START_YEAR] & 0x10000 ? 30 : 29
}

/** 某平月的天数（m 为 1-12） */
function monthDays(year: number, m: number): number {
  return LUNAR_INFO[year - LUNAR_START_YEAR] & (0x10000 >> m) ? 30 : 29
}

/** 农历一年共多少天 */
function yearDays(year: number): number {
  let sum = 348 // 12 个月按 29 天算
  const info = LUNAR_INFO[year - LUNAR_START_YEAR]
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) {
    if (info & bit) sum += 1
  }
  return sum + leapDays(year)
}

/** 公历 → 农历；超出数据范围返回 null */
export function solarToLunar(date: Date): LunarDate | null {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  let rest = Math.round((utc - BASE_UTC) / MS_PER_DAY)
  if (rest < 0) return null

  let year = LUNAR_START_YEAR
  while (year <= LAST_YEAR && rest >= yearDays(year)) {
    rest -= yearDays(year)
    year += 1
  }
  if (year > LAST_YEAR) return null

  // rest 现在是「这一农历年的第几天」（0 起）
  const leap = leapMonth(year)
  let month = 1
  let isLeap = false
  let dayIndex = rest

  for (;;) {
    const length = isLeap ? leapDays(year) : monthDays(year, month)
    if (dayIndex < length) break
    dayIndex -= length
    if (leap > 0 && !isLeap && month === leap) {
      // 同名闰月紧跟在平月后面
      isLeap = true
    } else {
      isLeap = false
      month += 1
    }
  }

  const monthName = MONTH_NAMES[month - 1]
  const dayName = DAY_NAMES[dayIndex]
  return {
    year,
    month,
    day: dayIndex + 1,
    isLeap,
    monthName: isLeap ? `闰${monthName}` : monthName,
    dayName,
    ganZhiYear: `${GAN[(year - 4) % 10]}${ZHI[(year - 4) % 12]}年`,
    text: `${isLeap ? '闰' : ''}${monthName}${dayName}`
  }
}

/** 当天是不是二十四节气之一；不是返回 null */
export function solarTermOn(date: Date): string | null {
  const row = SOLAR_TERM_DAYS[date.getFullYear() - LUNAR_START_YEAR]
  if (!row) return null
  // 每个月固定两个节气：第 i 个节气在 Math.floor(i / 2) + 1 月
  const first = (date.getMonth()) * 2
  for (let i = first; i < first + 2; i += 1) {
    if (Number(row.slice(i * 2, i * 2 + 2)) === date.getDate()) return SOLAR_TERM_NAMES[i]
  }
  return null
}

/** 农历传统节日 / 小节；闰月不算节（民间习惯） */
export function lunarFestivalOf(lunar: LunarDate): string | null {
  if (lunar.isLeap) return null
  const { month, day } = lunar

  // 除夕：腊月的最后一天（廿九或三十都可能）
  if (month === 12 && day === monthDays(lunar.year, 12)) return '除夕'

  switch (month) {
    case 1:
      if (day === 1) return '春节'
      if (day === 15) return '元宵节'
      return null
    case 2:
      return day === 2 ? '龙头节' : null
    case 5:
      return day === 5 ? '端午节' : null
    case 7:
      if (day === 7) return '七夕节'
      return day === 15 ? '中元节' : null
    case 8:
      return day === 15 ? '中秋节' : null
    case 9:
      return day === 9 ? '重阳节' : null
    case 10:
      if (day === 1) return '寒衣节'
      return day === 15 ? '下元节' : null
    case 12:
      if (day === 8) return '腊八节'
      if (day === 23) return '小年（北）'
      return day === 24 ? '小年（南）' : null
    default:
      return null
  }
}
