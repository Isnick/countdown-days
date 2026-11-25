/**
 * scripts/gen-calendar-data.mjs —— 生成农历 / 节气紧凑数据
 * ------------------------------------------------------------------
 * 为什么不在运行时直接用农历库：那是一个 500KB 的包，而日历只需要「某天是农历几号、
 * 当天是不是节气」这点信息。所以这里用 lunar-javascript（仅在开发期用）把 1900-2100
 * 的数据算出来，压成两张小表写进 src/utils/calendar-data.ts，运行时零依赖。
 *
 * 用法：node scripts/gen-calendar-data.mjs
 * 重新生成后，跑一遍 `node scripts/verify-calendar.mjs` 抽查与库的一致性。
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { rootDir } from './compile-electron.mjs'

const require = createRequire(import.meta.url)
const { Solar } = require('lunar-javascript')

/** 支持范围：1900-01-31（正月初一）～ 2100-12-31 */
const START_YEAR = 1900
const END_YEAR = 2100

/** 24 节气的固定顺序，与 SOLAR_TERMS 表中的 2 位一组一一对应 */
const TERM_ORDER = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
]

const pad2 = (n) => String(n).padStart(2, '0')

/* ---------------- 1. 逐日扫描，收集农历月长与节气 ---------------- */

/** 按农历年归档：{ leap: 0|月号, months: [29|30...] } */
const lunarYears = new Map()
/** 按公历年归档 24 个节气的日号 */
const termDays = new Map()

// 从 1900-01-01 开始扫，这样 1900 年的小寒 / 大寒也能收到；农历部分只认 1900 年及以后
let cursor = new Date(START_YEAR, 0, 1)
// 多扫一点：2100 年的腊月要跨到 2101 年初才能算出天数
const end = new Date(END_YEAR + 1, 2, 1)

/** 当前正在统计的农历年 / 月 */
let currentYear = null
let currentMonth = null // { month, isLeap, days }
let currentYearRecord = null

/** 收尾正在统计的那一个月（月长要等到下个月初一才知道） */
function closeMonth() {
  if (!currentMonth || !currentYearRecord) return
  currentYearRecord.months.push(currentMonth.days)
  if (currentMonth.isLeap) currentYearRecord.leap = currentMonth.month
  currentMonth = null
}

for (let guard = 0; cursor <= end; guard += 1) {
  if (guard > 82000) throw new Error('扫描循环异常')

  const y = cursor.getFullYear()
  const m = cursor.getMonth() + 1
  const d = cursor.getDate()
  const lunar = Solar.fromYmd(y, m, d).getLunar()
  const lunarYear = lunar.getYear()
  const lunarMonthRaw = lunar.getMonth() // 闰月为负数
  const isLeap = lunarMonthRaw < 0
  const lunarMonth = Math.abs(lunarMonthRaw)

  // 每到初一：先给上个月定长，再看要不要换农历年，最后开新的一月
  if (lunar.getDay() === 1) {
    closeMonth()
    if (lunarYear !== currentYear) {
      currentYear = lunarYear
      currentYearRecord = { leap: 0, months: [] }
      lunarYears.set(lunarYear, currentYearRecord)
    }
    currentMonth = { month: lunarMonth, isLeap, days: 0 }
  }

  if (currentMonth) currentMonth.days += 1

  // 节气：库只在当天返回名字
  const term = lunar.getJieQi()
  if (term) {
    const index = TERM_ORDER.indexOf(term)
    if (index < 0) throw new Error(`未知节气：${term}`)
    if (!termDays.has(y)) termDays.set(y, new Array(24).fill(0))
    const slot = termDays.get(y)
    if (slot[index]) throw new Error(`${y} 年 ${term} 重复`)
    slot[index] = d
  }

  cursor = new Date(y, m - 1, d + 1)
}

closeMonth()

// 多扫出来的年份（1899 的前半段、2101）不需要，继续用会把不完整的年份写进表
for (const year of [...lunarYears.keys()]) {
  if (year > END_YEAR || year < START_YEAR) lunarYears.delete(year)
}

/* ---------------- 2. 打包成经典 lunarInfo 的 32 位格式 ---------------- */

const infoList = []
for (let year = START_YEAR; year <= END_YEAR; year += 1) {
  const record = lunarYears.get(year)
  if (!record) throw new Error(`缺少 ${year} 年的农历数据`)
  const { leap, months } = record
  const count = leap ? 13 : 12
  if (months.length < count) throw new Error(`${year} 年月数不足：${months.length}`)

  let info = leap & 0xf
  const normal = leap ? months.filter((_, i) => i !== leap) : months
  // 注意：months 里闰月紧跟在同名月之后，位置是 leap（0 基）
  for (let m = 1; m <= 12; m += 1) {
    if (normal[m - 1] === 30) info |= 0x10000 >> m
  }
  if (leap) {
    const leapLen = months[leap]
    if (leapLen === 30) info |= 0x10000
  }
  infoList.push(info)
}

/* ---------------- 3. 输出 TS ---------------- */

const hex = infoList.map((n) => `0x${n.toString(16).padStart(5, '0')}`)
const infoLines = []
for (let i = 0; i < hex.length; i += 10) {
  infoLines.push(`  ${hex.slice(i, i + 10).join(', ')}${i + 10 < hex.length ? ',' : ''}`)
}

const termLines = []
for (let year = START_YEAR; year <= END_YEAR; year += 1) {
  const slot = termDays.get(year)
  if (!slot) throw new Error(`缺少 ${year} 年的节气数据`)
  if (slot.some((d) => !d)) throw new Error(`${year} 年节气不全：${JSON.stringify(slot)}`)
  termLines.push(`  '${slot.map(pad2).join('')}',`)
}

const banner = `/**
 * src/utils/calendar-data.ts —— 农历 / 节气数据（自动生成，请勿手改）
 * ------------------------------------------------------------------
 * 生成：node scripts/gen-calendar-data.mjs
 * 数据源：lunar-javascript（天文算法），覆盖 ${START_YEAR}-01-31（正月初一）～ ${END_YEAR}-12-31。
 * 运行时不需要任何农历依赖，只查这两张表。
 */

/** 表里的第一年 */
export const LUNAR_START_YEAR = ${START_YEAR}

/**
 * 农历年表，一年一个 32 位整数（经典 lunarInfo 格式）：
 *   bit 0-3   闰月月份，0 表示无闰月
 *   bit 4-15  正月至十二月，1 = 30 天，0 = 29 天
 *   bit 16    闰月是否 30 天
 */
export const LUNAR_INFO: readonly number[] = [
${infoLines.join('\n')}
]

/**
 * 节气表，一年一个 48 位字符串：24 个节气在「当月」的日号，两位一组，顺序固定为
 * 小寒 大寒 立春 雨水 惊蛰 春分 清明 谷雨 立夏 小满 芒种 夏至
 * 小暑 大暑 立秋 处暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至
 * 第 i 个节气固定落在 Math.floor(i / 2) + 1 月。
 */
export const SOLAR_TERM_DAYS: readonly string[] = [
${termLines.join('\n')}
]
`

const outFile = path.join(rootDir, 'src', 'utils', 'calendar-data.ts')
fs.writeFileSync(outFile, banner, 'utf8')
console.log(`[gen] 已生成 ${path.relative(rootDir, outFile)}：${infoList.length} 年农历 + ${termLines.length} 年节气`)
