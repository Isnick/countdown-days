/**
 * scripts/compile-electron.mjs —— 用 esbuild 编译主进程 / preload
 * 主进程是 Node 环境，直接打成 CJS，`require('electron')` 保持外部依赖。
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(rootDir, 'dist-electron')

const sharedOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
  absWorkingDir: rootDir
}

const entries = [
  { entryPoints: [path.join(rootDir, 'electron/main.ts')], outfile: path.join(outDir, 'main.js') },
  { entryPoints: [path.join(rootDir, 'electron/preload.ts')], outfile: path.join(outDir, 'preload.js') }
]

/** 一次性编译 */
export async function buildElectron() {
  await Promise.all(entries.map((entry) => esbuild.build({ ...sharedOptions, ...entry })))
}

/** 监听编译：任一侧重新产出后回调（回调里请自行防抖） */
export async function watchElectron(onRebuild) {
  const contexts = await Promise.all(
    entries.map((entry) =>
      esbuild.context({
        ...sharedOptions,
        logLevel: 'silent',
        ...entry,
        plugins: [
          {
            name: 'countdown:on-rebuild',
            setup(build) {
              // context.watch() 会先跑一次初始构建，那次不该重启 Electron
              let initialBuild = true
              build.onEnd((result) => {
                if (initialBuild) {
                  initialBuild = false
                  return
                }
                if (result.errors.length === 0) onRebuild?.()
              })
            }
          }
        ]
      })
    )
  )
  await Promise.all(contexts.map((ctx) => ctx.watch()))
  return contexts
}
