/**
 * electron/services/mini-window.ts —— 迷你悬浮胶囊
 * ------------------------------------------------------------------
 * 一个无边框、透明、置顶、不进任务栏的小窗，只显示「还有多久下班」和久坐进度。
 * 三个设计取舍写在最前面，改之前先读一遍：
 *
 *   1. 用完就销毁，而不是 hide()。一个空转的渲染进程要占几十 MB，
 *      而这个 app 的调性就是能省则省（见「省内存模式」和 app-idle 降载）；
 *      小页面重新加载也就百来毫秒，比常驻一个进程划算。
 *   2. 位置记在 settings.json 里。不然每次收起再打开，胶囊都会自己蹦回右下角。
 *   3. 显示用 showInactive()：正在打字时按快捷键，不该把光标抢走。
 */

import { BrowserWindow, screen } from 'electron'
import { APP, TIMING } from '../../shared/constants'
import type { WindowPosition } from '../../shared/types'
import { getSettings, updateSettings } from './settings-store'
import { loadPage, logRendererErrors, rendererPreferences } from './window-manager'

const SIZE = APP.window.mini

let mini: BrowserWindow | null = null
/** 拖动时 moved 会连发，攒一下再写盘 */
let moveTimer: ReturnType<typeof setTimeout> | null = null

/** 右下角停靠点 */
function cornerPosition(): WindowPosition {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: Math.round(area.x + area.width - SIZE.width - SIZE.margin),
    y: Math.round(area.y + area.height - SIZE.height - SIZE.margin)
  }
}

/**
 * 上次拖到哪儿就还在哪儿；要是那块屏幕已经拔了 / 分辨率变了，
 * 就回右下角 —— 否则胶囊会出现在看不见的地方，用户以为程序坏了。
 */
function resolvePosition(): WindowPosition {
  const saved = getSettings().miniPosition
  if (!saved) return cornerPosition()

  // 拿标题栏那一条的中点去探：只要它落在某块屏幕的工作区里，就算可见
  const probeX = saved.x + SIZE.width / 2
  const probeY = saved.y + 12
  const visible = screen.getAllDisplays().some(({ workArea: area }) => {
    return (
      probeX >= area.x &&
      probeX <= area.x + area.width &&
      probeY >= area.y &&
      probeY <= area.y + area.height
    )
  })

  return visible ? saved : cornerPosition()
}

/** 拖完记一下位置。只写 miniPosition，不动别的设置 */
function rememberPosition(win: BrowserWindow): void {
  if (moveTimer) clearTimeout(moveTimer)
  moveTimer = setTimeout(() => {
    moveTimer = null
    if (win.isDestroyed()) return
    const [x, y] = win.getPosition()
    void updateSettings({ miniPosition: { x, y } })
  }, TIMING.miniPosSaveMs)
}

export function createMini(): BrowserWindow {
  if (mini && !mini.isDestroyed()) return mini

  const { x, y } = resolvePosition()
  const win = new BrowserWindow({
    width: SIZE.width,
    height: SIZE.height,
    x,
    y,
    frame: false,
    transparent: true,
    // 透明窗口必须给全透明底色，否则圆角外面会露出一块方角
    backgroundColor: '#00000000',
    // 阴影由页面自己画（CSS 阴影才能跟着圆角走），窗口自带的会切出直角
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: APP.title,
    webPreferences: rendererPreferences()
  })

  // 'floating' 只压在普通窗口之上；用更高层级会盖住全屏视频和游戏，招人烦
  win.setAlwaysOnTop(true, 'floating')
  win.on('moved', () => rememberPosition(win))

  /*
   * 透明窗口的 ready-to-show 在个别显卡驱动下不触发（会白等一个永远不来的事件），
   * 所以再挂一道 did-finish-load 兜底。谁先到用谁，只显示一次。
   */
  let revealed = false
  const reveal = (): void => {
    if (revealed || win.isDestroyed()) return
    revealed = true
    win.showInactive()
  }
  win.once('ready-to-show', reveal)
  win.webContents.once('did-finish-load', reveal)

  win.on('closed', () => {
    if (mini === win) mini = null
    if (moveTimer) {
      clearTimeout(moveTimer)
      moveTimer = null
    }
  })

  logRendererErrors(win, 'mini')
  loadPage(win, 'mini.html')

  mini = win
  return win
}

/**
 * 胶囊是否已经开着。
 * 故意不看 isVisible()：刚 createMini 完、还没 showInactive 的那一瞬间也是 false，
 * 这时再按一次快捷键就会重复走一遍「创建」，逻辑上说不通。
 */
export function isMiniOpen(): boolean {
  return Boolean(mini && !mini.isDestroyed())
}

/** 收起胶囊。用 destroy 而不是 hide，见文件头的第 1 条取舍 */
export function destroyMini(): void {
  if (!mini || mini.isDestroyed()) {
    mini = null
    return
  }
  mini.destroy()
  mini = null
}
