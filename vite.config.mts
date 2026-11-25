import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * CSP 由这里注入：开发态要放行 vite 的 ws / eval，打包后收紧到只允许本地文件。
 */
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws: http://localhost:* http://127.0.0.1:*"
].join('; ')

const PROD_CSP = [
  "default-src 'self' file:",
  "script-src 'self' file:",
  "style-src 'self' file: 'unsafe-inline'",
  "img-src 'self' file: data:",
  "font-src 'self' file: data:"
].join('; ')

function cspPlugin(): Plugin {
  let isDev = false
  return {
    name: 'countdown:inject-csp',
    configResolved(config) {
      isDev = config.command === 'serve'
    },
    transformIndexHtml(html) {
      const content = isDev ? DEV_CSP : PROD_CSP
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${content}" />`
      )
    }
  }
}

export default defineConfig({
  root: 'src',
  // 打包后由 Electron 以 file:// 加载，必须用相对路径
  base: './',
  plugins: [vue(), cspPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url))
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'chrome124',
    chunkSizeWarningLimit: 1500,
    // 两个页面：主界面和迷你胶囊各自一个入口。
    // 胶囊不能复用 index.html —— 它不引 Element Plus，只打几十 KB，
    // 因为它要一直挂在桌面上，多背一份组件库不值得。
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./src/index.html', import.meta.url)),
        mini: fileURLToPath(new URL('./src/mini.html', import.meta.url))
      }
    }
  },
  server: {
    port: 5273,
    strictPort: true
  }
})
