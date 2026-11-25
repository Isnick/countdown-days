/**
 * electron/preload.ts —— 预加载脚本（守门人）
 * ------------------------------------------------------------------
 * 它运行在渲染进程里，但拥有 Node 能力。作用只有一个：
 * 把明确允许的能力通过 contextBridge 交出去。
 * 页面拿到的 api 对象里没有 require / fs / ipcRenderer 本体。
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/constants'
import type {
  AiTestResult,
  AppAction,
  AppMeta,
  DesktopApi,
  MemoryStats,
  NotifyResult,
  SecretField,
  SecretStatus,
  Settings,
  SettingsPayload,
  SitAlertPayload,
  SitState,
  TrendingRange,
  TrendingState,
  TrendingView
} from '../shared/types'

/** 统一封装「订阅 → 返回取消订阅函数」，组件卸载时不会泄漏监听器 */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: DesktopApi = {
  // ---- 设置 ----
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<Settings>,
  saveSettings: (patch: Partial<Settings>) =>
    ipcRenderer.invoke(IPC.settingsSave, patch) as Promise<Settings>,
  resetSettings: () => ipcRenderer.invoke(IPC.settingsReset) as Promise<SettingsPayload>,

  // ---- 久坐提醒 ----
  getSitState: () => ipcRenderer.invoke(IPC.sitState) as Promise<SitState>,
  resetSit: () => ipcRenderer.invoke(IPC.sitReset) as Promise<SitState>,
  snoozeSit: (minutes?: number) => ipcRenderer.invoke(IPC.sitSnooze, minutes) as Promise<SitState>,
  testNotify: () => ipcRenderer.invoke(IPC.notifyTest) as Promise<NotifyResult>,

  // ---- 应用 / 窗口 ----
  appMeta: () => ipcRenderer.invoke(IPC.appMeta) as Promise<AppMeta>,
  appAction: (action: AppAction) => ipcRenderer.invoke(IPC.appAction, action) as Promise<void>,
  memoryStats: () => ipcRenderer.invoke(IPC.memoryStats) as Promise<MemoryStats>,

  toggleMini: () => ipcRenderer.invoke(IPC.miniToggle) as Promise<boolean>,
  expandMini: () => ipcRenderer.invoke(IPC.miniExpand) as Promise<void>,

  // ---- 技术雷达 ----
  trendingView: (range: TrendingRange) =>
    ipcRenderer.invoke(IPC.trendingView, range) as Promise<TrendingView>,
  trendingRefresh: () => ipcRenderer.invoke(IPC.trendingRefresh) as Promise<TrendingState>,
  trendingEnsure: () => ipcRenderer.invoke(IPC.trendingEnsure) as Promise<void>,
  trendingOpen: (url: string) => ipcRenderer.invoke(IPC.trendingOpen, url) as Promise<void>,
  testAi: () => ipcRenderer.invoke(IPC.aiTest) as Promise<AiTestResult>,
  getSecrets: () => ipcRenderer.invoke(IPC.secretsGet) as Promise<SecretStatus>,
  saveSecrets: (patch: Partial<Record<SecretField, string>>) =>
    ipcRenderer.invoke(IPC.secretsSave, patch) as Promise<SecretStatus>,

  // ---- 主进程推送 ----
  onSitState: (cb) => subscribe<SitState>(IPC.sitState, cb),
  onSitAlert: (cb) => subscribe<SitAlertPayload>(IPC.sitAlert, cb),
  onSettingsChanged: (cb) => subscribe<SettingsPayload>(IPC.settingsChanged, cb),
  onTrendingChanged: (cb) => subscribe<TrendingState>(IPC.trendingChanged, cb)
}

contextBridge.exposeInMainWorld('api', api)
