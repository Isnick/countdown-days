# AGENTS.md —— 倒数日（Countdown Days）

> 写给 AI 编码代理的项目说明。读完本文件即可上手改代码，无需先通读全仓库。
> 项目文档与代码注释均使用中文，本文件同样使用中文。

## 1. 项目概览

「倒数日」是一个 Windows 桌面倒计时工具（Electron 应用），把四件事拼在一个常驻窗口里：

- **下班倒计时**：大号数字 + 工作进度条，支持自定义上下班时间、工作日、调休补班日判断
- **假期倒计时**：9 张卡片覆盖 2027 全年 + 2028 元旦/春节（含调休补班日），数据来自国务院办公厅通知，写死在 `shared/constants.ts` 的 `HOLIDAY_TABLE`
- **我已经活了**：出生天数 + 距下次生日
- **久坐提醒**：水位球 + 系统通知 + 任务栏闪烁，计时跑在主进程（窗口最小化/收托盘/收成胶囊都照常计时）
- 附属功能：时间进度（今天/本周/今年）、迷你胶囊窗（置顶小窗，快捷键 `Ctrl+Alt+D`）、全年日历（农历/节气）、技术雷达（抓 GitHub 新项目 + OpenAI 兼容接口 AI 解读，可选）

- 包名 `countdown-days`，版本 2.0.0，productName `CountdownDays`，AppId `com.demo.countdown`
- 仓库：https://github.com/Isnick/countdown-days ，License MIT
- 仅面向 Windows 10/11 打包（NSIS 安装包 + portable 免安装版）；macOS/Linux 未配置

## 2. 技术栈

| 层次 | 选型 |
| --- | --- |
| 桌面容器 | Electron 45（窗口、托盘、通知、全局快捷键、safeStorage、powerMonitor） |
| 界面框架 | Vue 3.5，全部 `<script setup>` + Composition API + TypeScript 严格模式 |
| 组件库 | Element Plus 2.14，**按需引入**（见 `src/plugins/element.ts`），深色主题 |
| 构建 | Vite 8（渲染进程）+ esbuild（主进程/preload，打成 CJS） |
| 打包 | electron-builder 26 |
| 农历 | 构建期用 lunar-javascript 生成紧凑数据表，运行时零依赖自研换算（`src/utils/lunar.ts`） |
| 包管理 | npm（有 `package-lock.json`；`package.json` 里也保留了 pnpm 的 `onlyBuiltDependencies` 配置） |

运行环境要求：Node.js 20+。

## 3. 目录结构与模块划分

```
├─ electron/                 主进程（Node 环境，只做必须碰系统的事）
│  ├─ main.ts                入口：单实例锁、窗口/托盘/快捷键装配、久坐与技术雷达服务启动
│  ├─ preload.ts             安全桥：contextBridge 暴露白名单 API（window.api）
│  ├─ ipc/register-ipc.ts    所有 ipcMain.handle 的注册处
│  └─ services/
│     ├─ window-manager.ts   主窗口创建、尺寸自适应、渲染进程安全配置、快捷键
│     ├─ mini-window.ts      迷你胶囊窗（透明、置顶、记住拖动位置）
│     ├─ tray.ts             托盘与关闭行为（询问 / 收进托盘 / 退出）
│     ├─ sit-service.ts      久坐计时器（10 秒粒度 tick）
│     ├─ settings-store.ts   设置读写、落盘前统一消毒（normalizeSettings）
│     ├─ secrets-store.ts    API Key 加密存储（safeStorage / DPAPI）
│     ├─ trending-service.ts 技术雷达抓取调度（含睡眠唤醒补抓）
│     ├─ trending-store.ts   技术雷达快照持久化
│     ├─ ai-service.ts       OpenAI 兼容接口调用
│     └─ tray-icon.ts        托盘图标
│
├─ src/                      渲染进程（Vue 3）
│  ├─ main.ts / App.vue      主界面入口与骨架（App.vue 只做数据装配和布局）
│  ├─ mini/main.ts + MiniCapsule.vue  迷你胶囊独立入口（不引 Element Plus）
│  ├─ index.html / mini.html 两个页面入口（CSP 占位符 <!--CSP--> 在这里）
│  ├─ api/bridge.ts          window.api 的类型化封装，组件不直接碰 window.api
│  ├─ components/            按功能分目录：work/ holiday/ life/ sit/ progress/
│  │                         calendar/ trending/ settings/ layout/ common/
│  ├─ composables/           可复用响应式逻辑：useClock / useSettings / useSit /
│  │                         useWorkCountdown / useHolidays / useLifeStats /
│  │                         useTimeProgress / useStageFit / useTodayLine / useTrending …
│  ├─ plugins/element.ts     Element Plus 按需注册（组件 + 样式都要手动加）
│  ├─ styles/                tokens.css（设计变量）/ base.css / widgets.css /
│  │                         element.css（EP 覆写）/ mini.css
│  └─ utils/                 纯函数：format / holidays / lunar / calendar-data（生成物）/
│                            festivals / chime
│
├─ shared/                   主进程与渲染进程共享（唯一真相来源）
│  ├─ constants.ts           所有写死的配置：APP / DEFAULTS / LIMITS / OPTIONS /
│  │                         TIMING / TRENDING / PATTERNS / HOLIDAY_TABLE /
│  │                         MAKEUP_WORKDAYS / IPC 通道名 / COPY 文案
│  ├─ types.ts               跨进程类型（Settings / SitState / Trending* / DesktopApi …）
│  └─ date.ts                共用日期工具
│
├─ scripts/                  构建 / 开发 / 打包 / 数据脚本（Node ESM .mjs）
├─ docs/screenshots/         README 用截图
└─ dist/ dist-electron/ release*/   构建产物（已 gitignore）
```

## 4. 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖（`.npmrc` 已把 Electron 下载源指向 npmmirror） |
| `npm run dev` | 开发模式：Vite dev server（端口 5273，strictPort）+ esbuild 编译主进程 + 拉起 Electron；改 `.vue` 热更新，改主进程/preload 自动重启 Electron |
| `npm run typecheck` | `vue-tsc --noEmit` 全量类型检查（**改完代码必须跑**） |
| `npm run build:renderer` | 只构建渲染进程（vite build → `dist/`，两个 HTML 入口） |
| `npm run build:electron` | 只用 esbuild 编译主进程/preload → `dist-electron/` |
| `npm run build` | 完整打包：构建 + electron-builder 出 NSIS 安装包 + portable 版 → `release/` |
| `npm run build:dir` | 构建 + 只出解包目录（调试用，快很多） |
| `node scripts/gen-calendar-data.mjs` | 重新生成农历/节气数据表 `src/utils/calendar-data.ts`（1900–2100） |
| `node scripts/verify-calendar.mjs [起始年] [结束年]` | 用 lunar-javascript 逐日对拍运行时农历实现，不一致则以非 0 退出 |

打包脚本 `scripts/package.mjs` 默认把 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 指向 npmmirror（国内网络直连 GitHub 容易中断）；设同名环境变量可覆盖。

## 5. 架构要点（改代码前必须知道）

1. **`shared/` 是唯一真相来源。** IPC 通道名（`IPC`）、设置结构与默认值（`Settings` / `DEFAULTS`）、假期表（`HOLIDAY_TABLE`）、共用文案（`COPY`）都只在这一处定义，主进程和渲染进程引用同一份。改行为先改 `shared/constants.ts` / `shared/types.ts`，不要在某一端另造一份。

2. **主进程只管"必须碰系统"的事**：开窗口、写磁盘、发通知、托盘、全局快捷键、久坐计时、技术雷达抓取。倒计时等纯展示计算全在渲染进程。

3. **设置流**：主进程是唯一事实来源。渲染进程 `useSettings` 持有响应式镜像，改动先本地生效、再经 `TIMING.settingsSaveDebounceMs` 防抖落盘；主进程落盘前用 `normalizeSettings()` 统一消毒（时间格式、数值边界、URL/模型名校验），以返回值回填界面。

4. **IPC 白名单**：preload 通过 `contextBridge.exposeInMainWorld('api', …)` 只暴露 `DesktopApi` 接口里声明的方法；渲染进程一律经 `src/api/bridge.ts` 访问，组件不直接碰 `window.api`。新增 IPC 能力要同时动四处：`shared/constants.ts` 的 `IPC`、`shared/types.ts` 的 `DesktopApi`、`electron/preload.ts`、`electron/ipc/register-ipc.ts`。

5. **两个页面两个入口**：`index.html`（主界面，引 Element Plus）和 `mini.html`（迷你胶囊，**故意不引组件库**，要长期挂在桌面）。胶囊页面只能依赖 Vue + composables + `styles/mini.css`。

6. **CSP 按环境注入**：`vite.config.mts` 里的插件在构建时替换 HTML 中的 `<!--CSP-->` 占位符——开发态放行 Vite 的 ws/eval，打包后收紧到 `file:`。新增 HTML 入口要保留该占位符。

7. **久坐计时在主进程**：`SitService` 每 10 秒 tick，状态通过 `IPC.sitState` 广播给**所有**窗口（主界面和胶囊都订阅）；通知、任务栏闪烁也在主进程触发。

8. **省内存模式**：`lowMemoryMode` 关闭硬件加速，必须在 `app.ready` 之前决定，所以 `settings-store.ts` 里有一次破例的同步读盘（`peekLowMemoryMode`）；改动后需重启生效。

9. **窗口不可见时暂停无限动画**：根节点挂 `app-idle` class，CSS 据此停掉水位球/光晕动画。新增无限动画时要遵守同一约定。

10. **技术雷达**（`trending-*`）：主进程定时抓 GitHub Search API（最近 30 天创建、star ≥ 100），快照落盘；AI 解读走用户自配的 OpenAI 兼容接口，提示词版本号 `TRENDING.promptVersion` 变更会让旧解读自动重跑。`powerMonitor` 处理睡眠唤醒补抓。

## 6. 代码风格约定

- **语言**：注释、文档、提交信息、界面文案全部使用中文。文件头部用块注释说明用途（`/** xxx.ts —— 一句话职责 ----… */`），长文件用 `/* ==== 分节 ==== */` 分隔。
- **Vue**：一律 `<script setup lang="ts">`；组件只负责渲染，逻辑下沉到 composables；跨组件共享的响应式状态直接定义在 composable 模块顶层（模块级单例，如 `useSettings` 的 `settings`）。
- **TypeScript**：严格模式 + `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`；路径别名 `@/` → `src/`，`@shared/` → `shared/`（tsconfig 与 vite 都已配置）。
- **样式**：颜色/圆角/字体只引用 `src/styles/tokens.css` 里的 CSS 变量，不写死色值；Element Plus 的主题覆写集中在 `src/styles/element.css`。
- **Element Plus 按需引入**：新增 EP 组件时必须在 `src/plugins/element.ts` 同时 import 组件（加进 `COMPONENTS`）和对应 `style/css`，否则样式缺失。
- **主进程服务**：每个 service 一个文件，构造函数注入回调（如 `SitService({ onState, onAlert })`），由 `main.ts` 装配；推送给窗口前判 `isDestroyed()`。
- **消毒优先**：凡是从 IPC / 磁盘读到的用户数据，落盘前过 `normalizeSettings` 式的白名单校验（`shared/constants.ts` 的 `PATTERNS` / `LIMITS`）。
- **无注释优先**：只在"为什么这么做"不直观时写注释（项目现有注释即此风格），不复述代码行为。

## 7. 测试与验证

项目**没有单元测试框架**（无 vitest/jest，无 `*.test.*` 文件），验证靠以下手段，改代码后按需执行：

1. `npm run typecheck` —— 全量类型检查，最基本的回归门槛。
2. `node scripts/verify-calendar.mjs` —— 改了 `src/utils/lunar.ts` 或重新生成日历数据后必须跑。
3. `npm run dev` 手动验证界面行为；渲染进程报错会转发到终端（`window-manager.ts` 的 `logRendererErrors`），主进程日志直接在终端看。
4. `npm run build` —— 交付前确认能完整出包。

## 8. 安全与隐私注意事项

- 渲染进程安全配置集中在 `window-manager.ts` 的 `rendererPreferences()`：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。新增窗口必须复用这份配置。
- 页面内外链一律 `setWindowOpenHandler` 拒绝并交给系统浏览器；`trendingOpen` 只接受 `https://github.com/` 开头的 URL。
- 设置存 `%APPDATA%\countdown-days\settings.json`；API Key 单独存 `secrets.json`，走 Electron `safeStorage`（Windows 上底层 DPAPI，绑定当前用户）；无可用 keyring 时退回 base64（只是编码不是加密，代码里有警告）。**密钥明文永远不出主进程**，渲染进程只能拿到掩码（`SecretStatus`）。
- 除技术雷达的 GitHub 请求和用户自配的 AI 接口外，应用不发起任何网络请求，无埋点上报。

## 9. 常见改动点速查

| 想改什么 | 改哪里 |
| --- | --- |
| 默认上下班时间、工作日、久坐默认值 | `shared/constants.ts` → `DEFAULTS` |
| 窗口尺寸、标题栏配色、迷你胶囊尺寸 | `shared/constants.ts` → `APP.window` |
| 假期与调休安排（每年国办发文后追加） | `shared/constants.ts` → `HOLIDAY_TABLE` / `MAKEUP_WORKDAYS` |
| 久坐间隔上限、稍后提醒时长 | `shared/constants.ts` → `LIMITS` / `OPTIONS` |
| 技术雷达抓取口径 / AI 批次与成本控制 | `shared/constants.ts` → `TRENDING` |
| 主题色、间距、字体 | `src/styles/tokens.css` |
| 某个卡片的布局 | `src/components/<功能>/` 下对应组件 |
| 新增 IPC 能力 | `shared/constants.ts`(IPC) + `shared/types.ts`(DesktopApi) + `electron/preload.ts` + `electron/ipc/register-ipc.ts` |
| 安装包名称、图标、目标平台 | `package.json` → `build` 段 |

## 10. 已知限制

- 假期表是静态数据，2028 年及以后需等国办发文后手动追加；2028 元旦/春节目前标注"调休待公布"。
- 打包只配置了 Windows（`build.win`：NSIS + portable），其他平台需自行补 `build.mac` / `build.linux`。
- 技术雷达受 GitHub 搜索 API 速率限制，未配 Token 时额度较低。
- 农历换算依赖生成的数据表（1900–2100），超出范围返回 `null`，日历自动降级为只显示公历。
