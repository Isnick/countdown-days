/**
 * scripts/package.mjs —— 调 electron-builder 出安装包
 * ------------------------------------------------------------------
 * electron-builder 在打包 Windows 安装包时还要额外下载一批工具
 * （winCodeSign / nsis / nsis-resources），默认从 GitHub releases 拉，
 * 国内网络经常是下到一半被掐断：
 *     ⨯ The server aborted pending request  (got: ReadError)
 * 结果就是 release/ 里只有一份 builder-effective-config.yaml，没有安装包。
 *
 * 这里默认把「Electron 本体」和「builder 工具包」的下载源指向 npmmirror，
 * 想换回官方源或私有源，设环境变量覆盖即可：
 *     ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { rootDir } from './compile-electron.mjs'

const MIRRORS = {
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/'
}

const env = { ...process.env }
for (const [key, value] of Object.entries(MIRRORS)) {
  if (!env[key]) env[key] = value
}

const cli = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js')
if (!fs.existsSync(cli)) {
  console.error('没找到 electron-builder，先跑一次依赖安装（npm install / pnpm install）。')
  process.exit(1)
}

// 默认出 Windows 包；额外参数透传（例如 --dir 只解包、--publish never）
const extra = process.argv.slice(2)
const args = [cli, ...(extra.length ? [] : ['--win']), ...extra]

console.log(`\n[package] electron-builder ${extra.length ? extra.join(' ') : '--win'}`)
console.log(`[package] 工具包镜像：${env.ELECTRON_BUILDER_BINARIES_MIRROR}\n`)

const child = spawn(process.execPath, args, { cwd: rootDir, stdio: 'inherit', env })

child.on('close', (code) => {
  if (code !== 0) {
    console.error(
      '\n[package] 打包失败。如果是下载超时 / aborted，' +
        '多半是网络问题，重跑一次通常能续上；也可以临时关掉代理再试。\n'
    )
    process.exit(code ?? 1)
  }
  report()
})

/** 打包成功后把产物路径打出来，省得去猜在哪个目录 */
function report() {
  // 允许用 -c.directories.output=xxx 临时改输出目录，报告要跟着走
  const override = process.argv
    .slice(2)
    .map((arg) => /^--?c(onfig)?\.directories\.output=(.+)$/.exec(arg)?.[2])
    .find(Boolean)
  const outDir = path.join(rootDir, override ?? 'release')
  if (!fs.existsSync(outDir)) return

  const artifacts = fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(exe|msi|zip|7z|dmg|AppImage|deb)$/i.test(entry.name))
    .map((entry) => {
      const full = path.join(outDir, entry.name)
      const mb = (fs.statSync(full).size / 1024 / 1024).toFixed(1)
      return `  ${entry.name}  (${mb} MB)`
    })

  if (artifacts.length) {
    console.log(`\n[package] 安装包已生成 → ${outDir}`)
    console.log(artifacts.join('\n'))
    console.log('')
  } else {
    console.log(`\n[package] 打包完成，但 ${outDir} 下没有安装包，看看上面的日志。\n`)
  }
}
