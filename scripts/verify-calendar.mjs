/**
 * scripts/verify-calendar.mjs —— 校验农历 / 节气表
 * ------------------------------------------------------------------
 * 拿运行时实现（src/utils/lunar.ts）和 lunar-javascript 逐日对拍：
 *   · 每一天的农历年 / 月（含闰月）/ 日必须一致
 *   · 每一天的节气名必须一致
 * 任何一条对不上都会打印出来并以非 0 退出。
 *
 * 用法：node scripts/verify-calendar.mjs [起始年] [结束年]
 */

import path from 'node:path'
import { createRequire } from 'node:module'
import * as esbuild from 'esbuild'
import { rootDir } from './compile-electron.mjs'

const require = createRequire(import.meta.url)
const { Solar } = require('lunar-javascript')

/** 先把 TS 版实现打成一个临时 CJS，Node 才 require 得到 */
async function loadRuntime() {
  const result = await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/utils/lunar.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    write: false,
    absWorkingDir: rootDir
  })
  const code = result.outputFiles[0].text
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(module, module.exports, require)
  return module.exports
}

const fromYear = Number(process.argv[2] ?? 1900)
const toYear = Number(process.argv[3] ?? 2100)

const lunar = await loadRuntime()
const start = new Date(Math.max(fromYear, 1900), 0, 31)
const end = new Date(toYear, 11, 31)

let checked = 0
const badLunar = []
const badTerm = []

for (let cursor = start; cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)) {
  const y = cursor.getFullYear()
  const m = cursor.getMonth() + 1
  const d = cursor.getDate()

  const ref = Solar.fromYmd(y, m, d).getLunar()
  const mine = lunar.solarToLunar(cursor)

  if (!mine) {
    badLunar.push(`${y}-${m}-${d} 运行时返回 null`)
  } else {
    const refMonth = ref.getMonth()
    const refIsLeap = refMonth < 0
    const same =
      mine.year === ref.getYear() &&
      mine.month === Math.abs(refMonth) &&
      mine.day === ref.getDay() &&
      mine.isLeap === refIsLeap
    if (!same) {
      badLunar.push(
        `${y}-${m}-${d} 参考=${ref.getYear()}/${refMonth}/${ref.getDay()} 实际=${mine.year}/${mine.isLeap ? -mine.month : mine.month}/${mine.day}`
      )
    }
  }

  const refTerm = ref.getJieQi() || ''
  const myTerm = lunar.solarTermOn(cursor) || ''
  if (refTerm !== myTerm) badTerm.push(`${y}-${m}-${d} 参考=${refTerm || '无'} 实际=${myTerm || '无'}`)

  checked += 1
}

console.log(`[verify] 逐日对拍 ${checked} 天（${fromYear}-${toYear}）`)

if (badLunar.length || badTerm.length) {
  if (badLunar.length) {
    console.error(`[verify] 农历不一致 ${badLunar.length} 处，前 10 条：`)
    badLunar.slice(0, 10).forEach((line) => console.error('  ' + line))
  }
  if (badTerm.length) {
    console.error(`[verify] 节气不一致 ${badTerm.length} 处，前 10 条：`)
    badTerm.slice(0, 10).forEach((line) => console.error('  ' + line))
  }
  process.exit(1)
}

console.log('[verify] 全部一致 ✓')
