/**
 * src/api/bridge.ts —— 对 preload 暴露的 window.api 做一层类型化封装
 * 页面里所有系统能力都必须经过这里，组件不直接碰 window.api。
 */

import type { DesktopApi } from '@shared/types'

/** preload 未加载时为 null，App.vue 会显示一段排错提示 */
export const bridge: DesktopApi | null = window.api ?? null

export const hasBridge = (): boolean => bridge !== null

/** 在确定 preload 已就绪的地方取值，免去到处判空 */
export function requireBridge(): DesktopApi {
  if (!bridge) throw new Error('preload bridge is not available')
  return bridge
}
