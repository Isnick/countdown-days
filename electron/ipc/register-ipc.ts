/**
 * electron/ipc/register-ipc.ts —— 渲染进程 ↔ 主进程的通道注册
 * 全部通道名集中在 shared/constants.ts 的 IPC 里，preload 用的是同一份。
 */

import { app, dialog, ipcMain, Notification, BrowserWindow } from 'electron'
import { APP, COPY, IPC } from '../../shared/constants'
import { getSettings, resetSettings, settingsFile, updateSettings } from '../services/settings-store'
import type { SitService } from '../services/sit-service'
import type { TrendingService } from '../services/trending-service'
import { saveSecrets } from '../services/secrets-store'
import type {
  AppAction,
  MemoryStats,
  SecretField,
  Settings,
  TrendingRange
} from '../../shared/types'

interface IpcContext {
  getWindow: () => BrowserWindow | null
  sit: SitService
  /** 收进托盘（设置页的「最小化到托盘」按钮会用到） */
  hideToTray: () => void
  /** 迷你胶囊：切换（主界面 ⇄ 胶囊）与展开（胶囊 → 主界面） */
  mini: { toggle: () => boolean; expand: () => void }
  /** 技术雷达：抓取调度 + 聚合视图 */
  trending: TrendingService
}

/**
 * 各进程常驻内存快照。
 * workingSetSize 的单位是 KB；「Tab」就是渲染进程，「Browser」是主进程。
 * 设置页拿它来展示，方便用户自己确认优化有没有生效。
 */
function memorySnapshot(): MemoryStats {
  let mainMb = 0
  let rendererMb = 0
  let gpuMb = 0
  let otherMb = 0

  for (const metric of app.getAppMetrics()) {
    const mb = (metric.memory?.workingSetSize ?? 0) / 1024
    switch (metric.type) {
      case 'Browser':
        mainMb += mb
        break
      case 'Tab':
        rendererMb += mb
        break
      case 'GPU':
        gpuMb += mb
        break
      default:
        otherMb += mb
    }
  }

  const round = (value: number): number => Math.round(value)
  return {
    mainMb: round(mainMb),
    rendererMb: round(rendererMb),
    gpuMb: round(gpuMb),
    otherMb: round(otherMb),
    totalMb: round(mainMb + rendererMb + gpuMb + otherMb),
    uptimeMin: Math.round(process.uptime() / 60),
    at: Date.now()
  }
}

export function registerIpc({ getWindow, sit, hideToTray, mini, trending }: IpcContext): void {
  /* ---------------- 设置 ---------------- */
  ipcMain.handle(IPC.settingsGet, () => getSettings())

  ipcMain.handle(IPC.settingsSave, async (event, patch: Partial<Settings>) => {
    const next = await updateSettings(patch)
    // 间隔 / 开关变了，重新广播一次，界面上的水位球能立刻对齐
    sit.notifySettingsChanged()
    // 轮询间隔 / 开关可能也变了，重排下一次抓取
    trending.reschedule()

    /*
     * 顺手把新设置推给「别的窗口」——现在有主界面和迷你胶囊两个。
     * 发起方自己已经先本地应用过了（useSettings 的即时生效策略），
     * 所以排除掉它，免得把它正在编辑中的落盘防抖覆盖掉。
     */
    const payload = { settings: next, sit: sit.getState() }
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== event.sender.id) win.webContents.send(IPC.settingsChanged, payload)
    }

    return next
  })

  ipcMain.handle(IPC.settingsReset, async (event) => {
    const settings = await resetSettings()
    sit.reset()
    trending.reschedule()
    const payload = { settings, sit: sit.getState() }
    event.sender.send(IPC.settingsChanged, payload)
    return payload
  })

  /* ---------------- 久坐提醒 ---------------- */
  ipcMain.handle(IPC.sitState, () => sit.getState())
  ipcMain.handle(IPC.sitReset, () => sit.reset())
  ipcMain.handle(IPC.sitSnooze, (_event, minutes: number) => sit.snooze(minutes))

  ipcMain.handle(IPC.notifyTest, () => {
    if (!Notification.isSupported()) return { ok: false, reason: '系统不支持通知' }
    new Notification({
      title: COPY.notifyTest.title,
      body: COPY.notifyTest.body(getSettings().sitIntervalMin),
      silent: false
    }).show()
    return { ok: true }
  })

  /* ---------------- 应用 / 窗口 ---------------- */
  ipcMain.handle(IPC.appMeta, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    isPackaged: app.isPackaged,
    settingsFile: settingsFile()
  }))

  ipcMain.handle(IPC.memoryStats, () => memorySnapshot())

  /* ---------------- 迷你胶囊 ---------------- */
  ipcMain.handle(IPC.miniToggle, () => mini.toggle())
  ipcMain.handle(IPC.miniExpand, () => mini.expand())

  /* ---------------- 技术雷达 ---------------- */
  ipcMain.handle(IPC.trendingView, (_event, range: TrendingRange) => trending.view(range))
  ipcMain.handle(IPC.trendingRefresh, () => trending.refresh())
  ipcMain.handle(IPC.trendingEnsure, () => trending.ensureInsights())
  ipcMain.handle(IPC.trendingOpen, (_event, url: string) => trending.open(url))
  ipcMain.handle(IPC.aiTest, () => trending.testAi())

  ipcMain.handle(IPC.secretsGet, () => trending.getSecretStatus())
  ipcMain.handle(IPC.secretsSave, async (_event, patch: Partial<Record<SecretField, string>>) => {
    const status = await saveSecrets(patch ?? {})
    // 密钥变了，AI 可用状态可能跟着变（面板上的提示要刷新）
    trending.secretsChanged()
    return status
  })

  // 窗口 / 系统动作统一走一个白名单通道，比开一堆 handle 好维护
  ipcMain.handle(IPC.appAction, (event, action: AppAction) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow()
    const wc = event.sender

    switch (action) {
      case 'minimize':
        return win?.minimize()
      case 'maximize':
        return win?.isMaximized() ? win.unmaximize() : win?.maximize()
      case 'close':
        return win?.close()
      case 'hide':
        return hideToTray()
      case 'quit':
        return app.quit()
      case 'relaunch':
        // 省内存模式这类启动期开关，改完必须重启才生效。
        // 用 app.exit 直接走人，不触发窗口的关闭询问
        app.relaunch()
        return app.exit(0)
      case 'reload':
        return win?.reload()
      case 'devtools':
        return wc.toggleDevTools()
      case 'about':
        return showAbout(getWindow())
      default:
        console.warn('[app:action] 未定义的动作：', action)
    }
  })
}

function showAbout(win: BrowserWindow | null): void {
  const detail = [...APP.about.detailLines, `• 配置文件：${settingsFile()}`].join('\n')
  const options = {
    type: 'info' as const,
    title: APP.about.title,
    message: `${APP.title} v${app.getVersion()}`,
    detail,
    buttons: [...APP.about.buttons],
    defaultId: 0
  }
  if (win) void dialog.showMessageBox(win, options)
  else void dialog.showMessageBox(options)
}
