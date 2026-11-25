/**
 * electron/main.ts —— 主进程入口
 * ------------------------------------------------------------------
 * 主进程是 Node.js 环境，拥有完整的系统能力。这里只负责三件「必须碰系统」的事：
 *   1. 开窗口 + 处理关闭按钮（询问 / 收进托盘 / 退出，见 services/tray.ts）
 *   2. 把用户设置落到磁盘（services/settings-store.ts）
 *   3. 跑久坐计时器并弹系统通知（services/sit-service.ts，窗口最小化时也要能提醒）
 * 纯展示的倒计时逻辑全部在渲染进程（src/），职责边界很干净。
 */

import { app, BrowserWindow, globalShortcut, Menu, Notification, powerMonitor, dialog } from 'electron'
import { APP, COPY, IPC } from '../shared/constants'
import { getSettings, loadSettings, peekLowMemoryMode, updateSettings } from './services/settings-store'
import { SitService } from './services/sit-service'
import { TrendingService } from './services/trending-service'
import { loadSecrets } from './services/secrets-store'
import { createMainWindow, registerShortcuts } from './services/window-manager'
import { createMini, destroyMini, isMiniOpen } from './services/mini-window'
import { destroyTray, ensureTray } from './services/tray'
import { registerIpc } from './ipc/register-ipc'
import type { CloseAction } from '../shared/types'

// Windows 通知必须设置 AppUserModelID，否则通知标题会显示成 electron.app.xxx
app.setAppUserModelId(APP.id)

// 省内存模式：关掉硬件加速后 GPU 进程的常驻内存能降一百多 MB。
// 这个开关必须在 ready 之前决定，所以用同步读盘偷看一眼（见 settings-store）。
if (peekLowMemoryMode()) app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null
/** 用户确认过要退出：之后不再拦截 close 事件 */
let quitting = false
/** 询问框已经弹出来了，避免连点关闭按钮堆出多个对话框 */
let asking = false
/** 本次运行是否已经提示过「已收进托盘」 */
let trayHintShown = false

/** 安全地向窗口推送，窗口已销毁时静默忽略 */
function send(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

/**
 * 推给所有窗口。
 * 久坐状态是「所有窗口都该知道」的东西：主界面画水位球，胶囊画那个小圆环，
 * 只发给主窗口的话，胶囊会一直停在打开那一刻的读数上。
 */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

const sit = new SitService({
  onState: (state) => broadcast(IPC.sitState, state),
  onAlert: ({ minutes }) => {
    if (getSettings().sitNotify && Notification.isSupported()) {
      new Notification({
        title: COPY.sitAlert.title,
        body: COPY.sitAlert.body(minutes),
        silent: false
      }).show()
    }
    send(IPC.sitAlert, { minutes, alertsToday: sit.getState().alertsToday })
    // 任务栏图标闪烁，窗口不在前台也能注意到
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) mainWindow.flashFrame(true)
  }
})

/**
 * 技术雷达：定时抓 GitHub 热门 → 快照入库 → AI 解读 → 推给所有窗口。
 */
const trending = new TrendingService((state) => broadcast(IPC.trendingChanged, state))

/** 把窗口叫回前台（托盘点击 / 重复启动 / 从托盘菜单显示） */
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    openWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** 胶囊 → 主界面：先收胶囊再把窗口叫回来，避免两个窗口同时闪一下 */
function expandMini(): void {
  destroyMini()
  showMainWindow()
}

/**
 * 主界面 ⇄ 迷你胶囊（Ctrl+Alt+D 和标题栏按钮都走这里）。
 * 显示胶囊时顺手把主窗口收起来 —— 这才叫「收起」；
 * 从一个已经躲进托盘的主窗口唤出胶囊时，主窗口保持原样。
 * @returns 切换之后胶囊是否可见
 */
function toggleMini(): boolean {
  if (isMiniOpen()) {
    expandMini()
    return false
  }

  createMini()
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.hide()
  return true
}

/** 真正退出：先解除 close 拦截，再交给 Electron 关窗口 */
function quitApp(): void {
  quitting = true
  app.quit()
}

/** 收进托盘。托盘创建失败时退回普通最小化，至少窗口还能从任务栏找回 */
function hideToTray(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    ensureTray(() => mainWindow, quitApp)
  } catch (err) {
    console.error('[tray] 创建失败：', (err as Error).message)
    mainWindow.minimize()
    return
  }

  mainWindow.hide()
  // 只提示一次，之后用户就知道去哪儿找了
  if (!trayHintShown && Notification.isSupported()) {
    trayHintShown = true
    new Notification({ title: COPY.tray.hintTitle, body: COPY.tray.hintBody, silent: true }).show()
  }
}

/**
 * 关闭按钮的三种走向。
 * 「记住我的选择」勾上后把这次的选项写进设置，下次直接照做，不再打扰。
 */
async function requestClose(win: BrowserWindow): Promise<void> {
  if (asking) return
  asking = true
  try {
    const action = getSettings().closeAction

    if (action === 'tray') {
      hideToTray()
      return
    }
    if (action === 'quit') {
      quitApp()
      return
    }

    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: 'question',
      noLink: true,
      title: COPY.closePrompt.title,
      message: COPY.closePrompt.message,
      detail: COPY.closePrompt.detail,
      buttons: [...COPY.closePrompt.buttons],
      defaultId: 0, // 默认落在「最小化到托盘」，误触也不会把程序关掉
      cancelId: 2,
      checkboxLabel: COPY.closePrompt.remember,
      checkboxChecked: false
    })

    // 取消：什么都不做，窗口留着
    if (response === 2) return

    const picked: CloseAction = response === 0 ? 'tray' : 'quit'
    if (checkboxChecked) await updateSettings({ closeAction: picked })

    if (picked === 'tray') hideToTray()
    else quitApp()
  } catch (err) {
    console.error('[close] 处理失败：', (err as Error).message)
  } finally {
    asking = false
  }
}

function openWindow(): void {
  const win = createMainWindow()
  mainWindow = win
  registerShortcuts(win)

  // 关闭按钮不再直接销毁窗口：先按用户的选择决定「收进托盘」还是「退出」
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    void requestClose(win)
  })

  win.on('closed', () => {
    mainWindow = null
  })
}

registerIpc({
  getWindow: () => mainWindow,
  sit,
  hideToTray,
  mini: { toggle: toggleMini, expand: expandMini },
  trending
})

// ---------- 单实例：重复启动时聚焦已有窗口 ----------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  void app.whenReady().then(async () => {
    await loadSettings()
    await loadSecrets()
    Menu.setApplicationMenu(null) // 原生菜单栏由自绘标题栏替代

    openWindow()
    sit.start()
    void trending.start()

    // 睡眠期间定时器会停摆，醒来后如果已经错过一轮就补抓
    powerMonitor.on('resume', () => trending.onResume())

    // 全局快捷键：窗口收进托盘、主界面不在前台时也能一把切出胶囊。
    // 注册失败通常是别的程序占了这组键，那就只能从标题栏按钮进，不影响使用。
    if (!globalShortcut.register(APP.miniShortcut, () => toggleMini())) {
      console.warn(`[shortcut] ${APP.miniShortcutLabel} 已被其它程序占用，迷你胶囊只能用按钮打开`)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    })
  })
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  sit.stop()
  trending.stop()
  destroyMini()
  destroyTray()
  if (process.platform !== 'darwin') app.quit()
})

// 全局快捷键是系统级注册，进程退出前必须还回去，否则下一次启动会抢不到
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
