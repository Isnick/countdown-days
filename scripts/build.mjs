/**
 * scripts/build.mjs —— 生产构建
 * 先编译主进程 / preload（dist-electron），再打包渲染进程（dist）。
 * 安装包由 electron-builder 在 npm run build 的第二段完成。
 */

import path from 'node:path'
import { build as viteBuild } from 'vite'
import { buildElectron, rootDir } from './compile-electron.mjs'

console.log('\n[1/2] 编译主进程与 preload …')
await buildElectron()

console.log('\n[2/2] 打包渲染进程 …')
await viteBuild({ configFile: path.join(rootDir, 'vite.config.mts') })

console.log('\n构建完成：dist-electron/（主进程）+ dist/（页面）\n')
