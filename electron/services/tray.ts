/**
 * electron/services/tray.ts —— 托盘图标
 * ------------------------------------------------------------------
 * 「最小化到图标栏」靠的就是它：窗口 hide() 之后，托盘是唯一的入口，
 * 所以菜单里必须有「显示主界面」和「退出」，否则用户就找不回来了。
 * 图标由 tray-icon.ts 在运行时画出来，不依赖打包资源。
 */

import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import { COPY } from '../../shared/constants'
import { trayIconDataUrl } from './tray-icon'

let tray: Tray | null = null

export function hasTray(): boolean {
  return tray !== null
}

/** 把窗口从托盘里叫出来 */
function reveal(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * 创建或复用托盘图标。
 * @param getWindow 延迟取窗口，避免窗口重建后托盘指向旧的 BrowserWindow
 * @param onQuit    真正退出（要先解除窗口的关闭拦截）
 */
export function ensureTray(getWindow: () => BrowserWindow | null, onQuit: () => void): Tray {
  if (tray) return tray

  // 32×32 的图交给系统按 DPI 缩放；4× 超采样后边缘足够干净
  const image = nativeImage.createFromDataURL(trayIconDataUrl(32))
  if (image.isEmpty()) console.warn('[tray] 图标生成失败，托盘可能显示为空白')

  tray = new Tray(image)
  tray.setToolTip(COPY.tray.tooltip)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: COPY.tray.show, click: () => reveal(getWindow()) },
      { type: 'separator' },
      { label: COPY.tray.quit, click: onQuit }
    ])
  )

  // 单击 / 双击都直接回到主界面（Windows 上习惯就不折腾了）
  tray.on('click', () => reveal(getWindow()))
  tray.on('double-click', () => reveal(getWindow()))

  return tray
}

export function destroyTray(): void {
  if (!tray) return
  tray.destroy()
  tray = null
}
