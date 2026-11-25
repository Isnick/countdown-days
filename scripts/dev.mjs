/**
 * scripts/dev.mjs —— 开发模式
 * 1. 起 vite dev server（页面热更新，改 .vue 不会重启窗口）
 * 2. esbuild 编译主进程 / preload
 * 3. 用 VITE_DEV_SERVER_URL 拉起 Electron
 * 主进程 / preload 变化时自动重启 Electron。
 */

import path from 'node:path'
import { spawn } from 'node:child_process'
import electronPath from 'electron'
import { createServer } from 'vite'
import { buildElectron, watchElectron, rootDir } from './compile-electron.mjs'

const server = await createServer({
  configFile: path.join(rootDir, 'vite.config.mts'),
  mode: 'development'
})
await server.listen()

const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port}/`
console.log(`\n  倒数日 dev server: ${url}\n`)

await buildElectron()

const env = {
  ...process.env,
  NODE_ENV: 'development',
  VITE_DEV_SERVER_URL: url
}

let child = null
let restartTimer = null
let stopping = false

function startElectron() {
  if (stopping || child) return
  child = spawn(electronPath, ['.', '--dev'], { cwd: rootDir, stdio: 'inherit', env })

  child.on('error', (err) => {
    console.error('[dev] 启动 Electron 失败：', err.message)
    shutdown(1)
  })

  child.on('close', (code) => {
    child = null
    if (stopping) return
    // 正常关窗（code 0）也视为「用户退出开发模式」
    if (code !== 0 && code !== null) console.error(`\n[dev] Electron 已退出（code=${code}）\n`)
    shutdown(0)
  })
}

/** 主进程 / preload 重新编译后：先彻底关掉旧进程，再起新的（否则会撞单实例锁） */
function restartElectron() {
  clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    const previous = child
    child = null

    const startFresh = () => startElectron()

    if (!previous) {
      startFresh()
      return
    }

    previous.removeAllListeners('close')
    previous.once('close', () => setTimeout(startFresh, 150))

    if (process.platform === 'win32') {
      // Windows 下 Electron 会拉起一串子进程，必须整棵树干掉
      spawn('taskkill', ['/pid', String(previous.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      previous.kill()
    }

    // 兜底：2.5 秒还没等到 close 就直接起
    setTimeout(startFresh, 2500)
  }, 400)
}

async function shutdown(code = 0) {
  stopping = true
  clearTimeout(restartTimer)
  try {
    await server.close()
  } catch {
    /* 忽略 */
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const contexts = await watchElectron(restartElectron)
startElectron()

process.on('exit', () => {
  contexts.forEach((ctx) => ctx.dispose())
})
