/**
 * src/composables/useStageFit.ts —— 窗口自适应
 * 内容多时整体等比缩小，保证在任何窗口尺寸下都不出现滚动条。
 * 全程直接操作 inline style（不依赖 class 更新时机），测量才是准的。
 */

import { onMounted, onUnmounted, type Ref } from 'vue'
import { TIMING } from '@shared/constants'

export function useStageFit(stageRef: Ref<HTMLElement | null>, appRef: Ref<HTMLElement | null>) {
  let frame = 0
  let observer: ResizeObserver | null = null

  function resetStyles(el: HTMLElement): void {
    el.style.zoom = '1'
    el.style.width = '100%'
    el.style.maxWidth = ''
    el.style.height = ''
    el.style.justifyContent = ''
  }

  function measure(el: HTMLElement, scale: number, availWidth: number): DOMRect {
    el.style.zoom = String(scale)
    el.style.width = `${availWidth / scale}px`
    return el.getBoundingClientRect()
  }

  function fit(): void {
    const stage = stageRef.value
    const app = appRef.value
    if (!stage || !app) return

    const availWidth = stage.clientWidth
    const availHeight = stage.clientHeight
    if (!availWidth || !availHeight) return

    // 1:1 先量一次
    resetStyles(app)
    const natural = app.getBoundingClientRect()
    const fits = (rect: DOMRect) =>
      rect.height <= availHeight + TIMING.fitTolerance && rect.width <= availWidth + TIMING.fitTolerance

    if (fits(natural)) {
      // 放得下就上下居中，避免底部一大块空白
      app.style.height = '100%'
      app.style.justifyContent = 'center'
      return
    }

    // 需要缩小时解除最大宽度限制，再二分找「刚好放得下」的最大缩放比
    app.style.maxWidth = 'none'
    let lo: number = TIMING.fitMinScale
    let hi = 1
    for (let i = 0; i < TIMING.fitIterations; i += 1) {
      const mid = (lo + hi) / 2
      if (fits(measure(app, mid, availWidth))) lo = mid
      else hi = mid
    }
    measure(app, lo, availWidth)
  }

  function schedule(): void {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(fit)
  }

  onMounted(() => {
    fit()
    window.addEventListener('resize', schedule)
    if (stageRef.value && 'ResizeObserver' in window) {
      observer = new ResizeObserver(schedule)
      observer.observe(stageRef.value)
    }
  })

  onUnmounted(() => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', schedule)
    observer?.disconnect()
    observer = null
  })

  return { fit: schedule }
}
