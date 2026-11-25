/**
 * src/composables/useSit.ts —— 久坐状态的响应式镜像
 * 计时本身在主进程（窗口最小化也不受影响），这里只负责展示和发起动作。
 */

import { ref } from 'vue'
import { LIMITS } from '@shared/constants'
import type { SitState } from '@shared/types'
import { bridge } from '@/api/bridge'

const state = ref<SitState | null>(null)

async function load(): Promise<void> {
  if (!bridge) return
  state.value = await bridge.getSitState()
}

/** 主进程推送 / 主动拉取后的统一入口 */
function apply(next: SitState): void {
  state.value = next
}

/** 我起来活动了 */
async function standUp(): Promise<void> {
  if (!bridge) return
  state.value = await bridge.resetSit()
}

/** 稍后提醒（默认 10 分钟） */
async function snooze(minutes: number = LIMITS.snooze.defaultValue): Promise<void> {
  if (!bridge) return
  state.value = await bridge.snoozeSit(minutes)
}

export function useSit() {
  return { state, load, apply, standUp, snooze }
}
