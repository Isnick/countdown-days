/// <reference types="vite/client" />

/** preload 通过 contextBridge 暴露的 window.api */
import type { DesktopApi } from '@shared/types'

declare global {
  interface Window {
    api?: DesktopApi
  }
}

/** 让 TypeScript 认识 .vue 单文件组件 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

export {}
