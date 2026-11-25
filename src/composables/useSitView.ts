/**
 * src/composables/useSitView.ts —— 久坐卡片的展示状态
 * 纯计算：把「距上次起身多久」翻译成水位、百分比和各种文案。
 */

import { computed, type Ref } from 'vue'
import type { SitState } from '@shared/types'

export interface SitView {
  /** 状态是否已就绪 */
  ready: boolean
  ratio: number
  /** 百分比数值字符串（可能超过 100） */
  pctText: string
  /** 水位高度 0..100 */
  liquidHeight: number
  minutes: number
  title: string
  sub: string
  caption: string
  pillText: string
  pillClass: string
  isPaused: boolean
  isOff: boolean
  isOver: boolean
}

const placeholder: SitView = {
  ready: false,
  ratio: 0,
  pctText: '0.00',
  liquidHeight: 0,
  minutes: 0,
  title: '久坐提醒',
  sub: '正在读取计时状态…',
  caption: '未计时',
  pillText: '—',
  pillClass: 'pill pill-muted',
  isPaused: false,
  isOff: false,
  isOver: false
}

export function useSitView(now: Ref<Date>, state: Ref<SitState | null>) {
  return computed<SitView>(() => {
    const sit = state.value
    if (!sit) return placeholder

    const elapsed = Math.max(0, now.value.getTime() - sit.since)
    const minutes = Math.floor(elapsed / 60_000)
    const ratio = sit.tracking ? elapsed / (sit.intervalMin * 60_000) : 0
    const pct = ratio * 100

    let pillText = '计时中'
    let pillClass = 'pill pill-warn'
    let sub = ''

    if (!sit.enabled) {
      pillText = '已关闭'
      pillClass = 'pill pill-off'
      sub = '久坐提醒已关闭 · 在右上角「设置」里可以打开'
    } else if (!sit.tracking) {
      pillText = '未计时'
      pillClass = 'pill pill-muted'
      sub = `今天已提醒 ${sit.alertsToday} 次 · 当前不在计时段（${sit.workHoursOnly ? '工作时段外' : '已暂停'}）`
    } else if (ratio >= 1) {
      pillText = '该起来了'
      pillClass = 'pill pill-over'
      sub = `今天已提醒 ${sit.alertsToday} 次 · 已超过 ${minutes - sit.intervalMin} 分钟，站起来走两步吧`
    } else {
      const leftMin = Math.max(0, sit.intervalMin - minutes)
      sub = `今天已提醒 ${sit.alertsToday} 次 · 再坐 ${leftMin} 分钟就提醒你`
    }

    return {
      ready: true,
      ratio,
      pctText: pct.toFixed(2),
      liquidHeight: Math.min(100, pct),
      minutes,
      title: ratio >= 1 ? '已经坐太久了' : `每 ${sit.intervalMin} 分钟提醒一次`,
      sub,
      caption: sit.tracking ? `已坐 ${minutes} 分钟` : '未计时',
      pillText,
      pillClass,
      isPaused: !sit.tracking,
      isOff: !sit.enabled,
      isOver: sit.tracking && ratio >= 1
    }
  })
}
