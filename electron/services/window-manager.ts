/**
 * electron/services/window-manager.ts —— 窗口创建 / 快捷键 / 外链策略
 */

import { BrowserWindow, screen, shell, type WebPreferences } from 'electron'
import path from 'node:path'
import { APP } from '../../shared/constants'

/** vite dev server 地址（由 scripts/dev.mjs 注入）；为空表示生产模式 */
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

export const isDev = Boolean(DEV_SERVER_URL) || process.argv.includes('--dev')

/**
 * 渲染进程共用的安全配置。
 * 主界面和迷你胶囊是两个窗口，但都只跑本地页面、都只需要 preload 给的那点能力，
 * 配置写在一处，免得哪天给新窗口开权限时忘掉某一条。
 */
export function rendererPreferences(): WebPreferences {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true, // 渲染进程与 preload 的 JS 上下文隔离
    nodeIntegration: false, // 页面里不能直接 require('fs')
    sandbox: true, // 渲染进程跑在沙箱里
    // 关掉拼写检查：它会在渲染进程里常驻一份词典，纯展示界面用不上
    spellcheck: false,
    // 窗口最小化 / 被遮挡时让 Chromium 把定时器降频，省 CPU 也省内存；
    // 秒针恢复靠窗口重新获得焦点时立刻校准（见 src/composables/useClock.ts）
    backgroundThrottling: true
  }
}

/** 开发态连 vite dev server，生产态读 dist 下的静态文件（多页面构建，见 vite.config.mts） */
export function loadPage(win: BrowserWindow, page: 'index.html' | 'mini.html'): void {
  if (DEV_SERVER_URL) {
    void win.loadURL(new URL(page, DEV_SERVER_URL).toString())
    return
  }
  void win.loadFile(path.join(__dirname, '../dist', page))
}

/** 把页面里的报错打到终端，`npm run dev` 时不用开 DevTools 也能看到问题 */
export function logRendererErrors(win: BrowserWindow, tag: string): void {
  win.webContents.on('console-message', ((details: {
    level?: string
    severity?: string
    message?: string
  }) => {
    const level = details.level ?? details.severity
    if (level !== 'error') return
    console.error(tag ? `[renderer:${tag}]` : '[renderer]', details.message)
  }) as never)
}

/** 按屏幕可用区域定初始尺寸：小屏（1366×768 / 缩放 125%）也不会超出屏幕 */
function resolveWindowSize() {
  const area = screen.getPrimaryDisplay().workAreaSize
  const w = APP.window
  const width = Math.max(w.minWidth, Math.min(w.maxWidth, area.width - w.marginX))
  const height = Math.max(w.minHeight, Math.min(w.maxHeight, area.height - w.marginY))
  return { width, height }
}

export function createMainWindow(): BrowserWindow {
  const w = APP.window
  const { width, height } = resolveWindowSize()

  const win = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(w.minWidth, width),
    minHeight: Math.min(w.minHeight, height),
    show: false,
    backgroundColor: w.backgroundColor,
    title: APP.title,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...w.titleBarOverlay },
    webPreferences: rendererPreferences()
  })

  loadPage(win, 'index.html')

  logRendererErrors(win, '')

  win.once('ready-to-show', () => {
    win.show()
    if (isDev) win.webContents.openDevTools({ mode: 'detach' })
  })

  // 页面里的外链一律交给系统浏览器，不在应用内开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('focus', () => win.flashFrame(false))
  return win
}

/**
 * 自绘标题栏之后，Ctrl+R / F11 / 缩放这些快捷键要自己补回来。
 */
export function registerShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const ctrl = input.control || input.meta
    const key = input.key.toLowerCase()
    let handled = true

    if (input.key === 'F12') win.webContents.toggleDevTools()
    else if (input.key === 'F11') win.setFullScreen(!win.isFullScreen())
    else if (ctrl && key === 'r') input.shift ? win.webContents.reloadIgnoringCache() : win.reload()
    else if (ctrl && (input.key === '=' || input.key === '+')) {
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5)
    } else if (ctrl && input.key === '-') {
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5)
    } else if (ctrl && input.key === '0') win.webContents.setZoomLevel(0)
    else handled = false

    if (handled) event.preventDefault()
  })
}
