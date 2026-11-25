/**
 * src/composables/useClock.ts —— 全局秒针
 * 整个界面只有一个定时器，所有卡片共用同一个 now。
 *
 * 窗口最小化 / 被遮挡时 Chromium 会把定时器降频（省 CPU 也省内存），
 * 所以回到前台必须立刻校准一次，否则秒针会停在「几十秒前」。
 */

import { onUnmounted, ref } from 'vue'
import { TIMING } from '@shared/constants'

export function useClock() {
  const now = ref(new Date())

  const sync = (): void => {
    now.value = new Date()
  }

  const timer = window.setInterval(sync, TIMING.clockTickMs)

  // 标签页重新可见（窗口从托盘恢复、被遮挡后回到前台）
  document.addEventListener('visibilitychange', sync)
  // 窗口重新拿到焦点时也校准一次（有些系统不触发 visibilitychange）
  window.addEventListener('focus', sync)

  onUnmounted(() => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', sync)
    window.removeEventListener('focus', sync)
  })

  return now
}
