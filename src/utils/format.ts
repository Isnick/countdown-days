/**
 * src/utils/format.ts —— 纯展示用的格式化函数
 */

import { WEEK_CN } from '@shared/constants'
import { pad2 } from '@shared/date'

/** 倒计时数字：小于一天时 hh:mm:ss，大于一天时 “3 天 hh:mm:ss” */
export function durText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return days > 0 ? `${days} 天 ${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

/** 口语化时长：「2 小时 15 分钟」 */
export function words(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const out: string[] = []
  if (d) out.push(`${d} 天`)
  if (h) out.push(`${h} 小时`)
  if (m || !out.length) out.push(`${m} 分钟`)
  return out.join(' ')
}

export const fmtMD = (d: Date): string => `${d.getMonth() + 1} 月 ${d.getDate()} 日`

export const fmtYMD = (d: Date): string => `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`

/** 千分位，例如 12,345 */
export const thousands = (n: number): string => n.toLocaleString('en-US')

/** 星期中文，0=周日 */
export const weekName = (d: Date): string => WEEK_CN[d.getDay()] ?? ''

/** 百分比字符串，保留 digits 位小数 */
export const percent = (ratio: number, digits = 2): string =>
  `${(Math.min(1, Math.max(0, ratio)) * 100).toFixed(digits)}%`
