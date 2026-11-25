# 倒数日 · Countdown Days

> 一个常驻桌面的倒计时小工具：**还有几天放假、还有多久下班、已经活了多少天、坐了多久该起来动一动** —— 四件事，一屏看完。

Windows 桌面应用，Electron + Vue 3 + TypeScript。深色界面、无边框自绘标题栏，收起后变成贴在屏幕角落的迷你胶囊。

![主界面](docs/screenshots/main.png)

<sub>上图：主界面。标题栏依次是「趋势 / 迷你窗 / 日历 / 设置」，中间是 2027 年放假安排的假期卡片。</sub>

---

## 这个应用解决什么问题

打工人的时间感知是碎的：想知道还有几天到春节，得打开日历数；想知道今天还要熬多久，得心算；一坐三小时腰疼了才想起来该动。

「倒数日」把这几件事拼进一个常驻窗口，打开就能看见，不用点、不用查、不用记。

| 你关心的事 | 应用里的位置 |
| --- | --- |
| 还有几天放假 | 假期倒计时（9 张卡片，含调休补班日） |
| 今天还要熬多久 | 下班倒计时（大号数字 + 工作进度条） |
| 我在这世上待了多少天 | 我已经活了（已活天数 + 距下次生日 + 这一岁的进度） |
| 我坐了多久 | 久坐提醒（水位球 + 系统通知） |
| 这一年又过去多少了 | 时间进度（今天 / 本周 / 今年） |

---

## 功能

### 下班倒计时

- 大号数字显示距下班还有多久，下面一条进度条表示今天的工作进度
- 上下班时间可在卡片上直接改，工作日（周一到周日）可勾选
- 非工作时间自动切换到「已下班」「休息中」等状态，不会一直跳 `00:00:00`
- 「今天算不算上班」的判断考虑了周末、法定假日和调休补班日

### 假期倒计时

- 9 张卡片覆盖元旦、春节、清明、劳动节、端午、中秋、国庆（2027 全年 + 2028 元旦 / 春节）
- 每张卡片标注：倒计时天数、起止日期、放假天数、**调休补班日**
- 数据来源：国务院办公厅《关于 2027 年部分节假日安排的通知》（国办发明电〔2026〕10 号），写死在 `shared/constants.ts` 的 `HOLIDAY_TABLE`
- 过期假期自动收进历史，最近的一个标「下一个」
- 点标题栏「日历」打开全年月历，可看假期、补班日（右上角金色「班」）、农历日期、二十四节气和传统节日

### 我已经活了

- 填一次出生日期，算出已经在这个世界上待了多少天
- 同时显示距下次生日还有几天、这一岁过了多少

### 久坐提醒

- 默认每 45 分钟提醒一次，间隔可调，可限定只在工作时段计时
- 中间的**水位球**显示本轮坐下的占比，越接近满越该起来
- 提醒方式：应用内浮层 + 系统通知 + 任务栏图标闪烁（窗口在后台也不会漏）
- 两个按钮：`我起来活动了`（清零重算）、`稍后 10 分钟`
- 计时跑在**主进程**，窗口最小化、收进托盘、收起成胶囊都照常计时

### 时间进度

今天 / 本周 / 今年三条进度条，右侧写清「还剩多久」。

### 迷你胶囊窗

![迷你胶囊](docs/screenshots/mini.png)

- 快捷键 `Ctrl + Alt + D` 随时收起 / 展开（被其他程序占用时可用标题栏「迷你窗」按钮）
- 透明置顶小窗，只显示下班倒计时和久坐圆环
- 可拖到任意位置，位置会记住，下次打开还在原地
- 独立入口打包，**故意不引 Element Plus**，自身产物只有几 KB

### 趋势（技术雷达）

- 定时抓取 GitHub 上「最近 30 天创建、star ≥ 100」的新项目，按 star 排序
- 可配置任意 OpenAI 兼容接口（`baseUrl` + `model` + API Key），让模型用中文总结这些项目在做什么
- 调度在主进程，`powerMonitor` 处理睡眠唤醒后的补抓；提示词版本变更会让旧解读自动重跑

---

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 桌面容器 | Electron 45（窗口、托盘、通知、全局快捷键、safeStorage、powerMonitor） |
| 界面框架 | Vue 3.5，全部 `<script setup>` + Composition API + TypeScript 严格模式 |
| 组件库 | Element Plus 2.14，**按需引入**（`src/plugins/element.ts`），深色主题 |
| 构建 | Vite 8（渲染进程）+ esbuild（主进程 / preload，打成 CJS） |
| 打包 | electron-builder 26（NSIS 安装包 + portable） |
| 农历 | 构建期用 lunar-javascript 生成紧凑数据表，运行时零依赖自研换算 |
| 包管理 | npm（`package.json` 里也保留了 pnpm 的 `onlyBuiltDependencies`） |

---

## 快速开始

环境要求：**Node.js 20+**，Windows 10 / 11。

```bash
git clone https://github.com/Isnick/countdown-days.git
cd countdown-days
npm install

npm run dev      # Vite dev server(5273) + esbuild + 拉起 Electron
```

`npm run dev` 下改 `.vue` 是热更新；改主进程 / preload 会自动重启 Electron。

### 命令一览

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式：Vite dev server（端口 5273，strictPort）+ 编译主进程 + 启动 Electron |
| `npm run typecheck` | `vue-tsc --noEmit` 全量类型检查，改完代码必跑 |
| `npm run build:renderer` | 只构建渲染进程 → `dist/`（两个 HTML 入口） |
| `npm run build:electron` | 只用 esbuild 编译主进程 / preload → `dist-electron/` |
| `npm run build` | 完整打包：NSIS 安装包 + portable → `release/` |
| `npm run build:dir` | 构建 + 只出解包目录（调试用，快很多） |
| `node scripts/gen-calendar-data.mjs` | 重新生成农历 / 节气数据表（1900–2100） |
| `node scripts/verify-calendar.mjs [起] [止]` | 用 lunar-javascript 逐日对拍运行时农历实现 |

国内网络下 Electron 本体和 electron-builder 工具包容易下载中断，`.npmrc` 和 `scripts/package.mjs` 已经默认走 npmmirror；设环境变量 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 可覆盖。

---

## 项目结构

```
├─ electron/                 主进程（Node 环境，只做必须碰系统的事）
│  ├─ main.ts                入口：单实例锁、窗口/托盘/快捷键装配、服务启动
│  ├─ preload.ts             contextBridge 暴露白名单 API（window.api）
│  ├─ ipc/register-ipc.ts    所有 ipcMain.handle 注册于此
│  └─ services/              window-manager / mini-window / tray / tray-icon /
│                            sit-service / settings-store / secrets-store /
│                            trending-service / trending-store / ai-service
│
├─ src/                      渲染进程（Vue 3）
│  ├─ main.ts / App.vue      入口与骨架（App.vue 只做数据装配和布局）
│  ├─ index.html / mini.html 两个页面入口，CSP 占位符 <!--CSP--> 在这里
│  ├─ api/bridge.ts          window.api 的类型化封装，组件不直接碰 window.api
│  ├─ mini/                  迷你胶囊独立入口（不引 Element Plus）
│  ├─ components/            work / holiday / life / sit / progress /
│  │                         calendar / trending / settings / layout / common
│  ├─ composables/           useClock / useSettings / useSit / useWorkCountdown /
│  │                         useHolidays / useLifeStats / useTimeProgress /
│  │                         useStageFit / useTodayLine / useTrending …
│  ├─ plugins/element.ts     Element Plus 按需注册（组件和样式都要手动加）
│  ├─ styles/                tokens（设计变量）/ base / widgets / element 覆写 / mini
│  └─ utils/                 format / holidays / lunar / calendar-data(生成物) /
│                            festivals / chime
│
├─ shared/                   主进程与渲染进程共享（唯一真相来源）
│  ├─ constants.ts           APP / DEFAULTS / LIMITS / OPTIONS / TIMING / TRENDING /
│  │                         PATTERNS / HOLIDAY_TABLE / MAKEUP_WORKDAYS / IPC / COPY
│  ├─ types.ts               跨进程类型（Settings / SitState / DesktopApi …）
│  └─ date.ts                共用日期工具
│
├─ scripts/                  构建 / 开发 / 打包 / 数据脚本（Node ESM）
├─ docs/screenshots/         README 截图
└─ dist/ dist-electron/ release*/   构建产物（已 gitignore）
```

---

## 架构要点

改代码前值得先知道这几条，更细的见 [AGENTS.md](AGENTS.md)。

1. **`shared/` 是唯一真相来源。** IPC 通道名、设置结构与默认值、假期表、共用文案都只定义一次，两端引用同一份。改行为先改 `shared/constants.ts` / `shared/types.ts`，别在某一端另造一份。

2. **主进程只管「必须碰系统」的事**：开窗口、写磁盘、发通知、托盘、全局快捷键、久坐计时、技术雷达抓取。倒计时等纯展示计算全在渲染进程。

3. **设置流**：主进程是事实来源，渲染进程 `useSettings` 持有响应式镜像；改动先本地生效、再防抖落盘；主进程落盘前用 `normalizeSettings()` 统一消毒（时间格式、数值边界、URL / 模型名校验），以返回值回填界面。

4. **IPC 白名单**：preload 只暴露 `DesktopApi` 里声明的方法，渲染进程一律经 `src/api/bridge.ts`。新增一个 IPC 能力要同时改四处 —— `shared/constants.ts`(IPC)、`shared/types.ts`(DesktopApi)、`electron/preload.ts`、`electron/ipc/register-ipc.ts`。

5. **两个页面两个入口**：`index.html` 引 Element Plus，构建后 JS + CSS 约 600 KB；`mini.html` 故意不引组件库，只能依赖 Vue + composables + `styles/mini.css`。胶囊要长期挂在桌面上，多背一份组件库不值得。

6. **CSP 按环境注入**：`vite.config.mts` 的插件在构建时替换 `<!--CSP-->` 占位符 —— 开发态放行 Vite 的 ws / eval，打包后收紧到 `file:`。新增 HTML 入口要保留该占位符。

7. **久坐计时在主进程**：`SitService` 每 10 秒 tick，状态广播给所有窗口（主界面画水位球，胶囊画圆环），通知和任务栏闪烁也在主进程触发。

8. **窗口不可见时暂停无限动画**：根节点挂 `app-idle` class，CSS 据此停掉水位球和光晕。新增无限动画请遵守同一约定。

9. **省内存模式**：`lowMemoryMode` 关闭硬件加速，GPU 进程常驻内存能降一百多 MB，代价是动画交给 CPU 画。必须在 `app.ready` 之前决定，所以有一次破例的同步读盘（`peekLowMemoryMode`）；改完需重启生效。

---

## 开发约定

- **语言**：注释、文档、提交信息、界面文案全用中文；文件头用块注释写清职责。
- **Vue**：一律 `<script setup lang="ts">`，组件只负责渲染，逻辑下沉到 composables；跨组件共享状态的 composable 用模块级单例。
- **TypeScript**：严格模式 + `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`；别名 `@/` → `src/`、`@shared/` → `shared/`。
- **样式**：颜色、圆角、字体只引用 `src/styles/tokens.css` 的 CSS 变量，不写死色值；Element Plus 主题覆写集中在 `src/styles/element.css`。
- **Element Plus 按需引入**：新增组件必须同时在 `src/plugins/element.ts` 加组件和对应 `style/css`，否则样式缺失。
- **消毒优先**：从 IPC / 磁盘读到的用户数据，落盘前一律过白名单校验（`PATTERNS` / `LIMITS`）。
- **注释克制**：只在「为什么这么做」不直观时写，不复述代码行为。

## 测试与验证

项目**没有单元测试框架**（无 vitest / jest，也没有 `*.test.*`）。验证靠这几步，改代码后按需执行：

1. `npm run typecheck` —— 最基本的回归门槛
2. `node scripts/verify-calendar.mjs` —— 改了 `lunar.ts` 或重新生成日历数据后必跑
3. `npm run dev` 手动验证；渲染进程错误会转发到终端（`logRendererErrors`）
4. `npm run build` —— 交付前确认能完整出包

---

## 数据与隐私

- **设置只存本机**：`%APPDATA%\countdown-days\settings.json`
- API Key 单独存 `secrets.json`，走 Electron `safeStorage`（Windows 底层是 DPAPI，绑定当前用户）；没有可用 keyring 的环境退回 base64 并给出警告 —— 那只是编码，不是加密
- **密钥明文永远不出主进程**，渲染进程只能拿到掩码（`SecretStatus`）
- 渲染进程安全配置集中在 `window-manager.ts`：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- 页面内外链一律拒绝并交给系统浏览器；`trendingOpen` 只接受 `https://github.com/` 开头的地址
- 除 GitHub 搜索请求和你自配的 AI 接口外，应用不发起任何网络请求，无埋点上报

## 常见改动点

| 想改什么 | 改哪里 |
| --- | --- |
| 默认上下班时间、工作日、久坐默认值 | `shared/constants.ts` → `DEFAULTS` |
| 窗口尺寸、标题栏配色、胶囊尺寸 | `shared/constants.ts` → `APP.window` |
| 假期与调休安排（每年国办发文后追加） | `shared/constants.ts` → `HOLIDAY_TABLE` / `MAKEUP_WORKDAYS` |
| 久坐间隔上限、稍后提醒时长 | `shared/constants.ts` → `LIMITS` / `OPTIONS` |
| 技术雷达抓取口径、AI 批次与成本控制 | `shared/constants.ts` → `TRENDING` |
| 主题色、间距、字体 | `src/styles/tokens.css` |
| 某张卡片的布局 | `src/components/<功能>/` 下对应组件 |
| 新增 IPC 能力 | `IPC` + `DesktopApi` + `preload.ts` + `register-ipc.ts` 四处同改 |
| 安装包名称、图标、目标平台 | `package.json` → `build` 段 |

## 已知限制

- 假期表是**静态数据**，每年国办发文后手动追加；2028 元旦 / 春节目前标注「调休待公布」
- 打包只配置了 Windows（NSIS + portable），macOS / Linux 需自行补 `build.mac` / `build.linux`
- 趋势功能受 GitHub 搜索 API 速率限制，未配 Token 时额度较低，可能抓不全
- 农历换算依赖生成的数据表（1900–2100），超出范围返回 `null`，日历自动降级为只显示公历

---

## 给 AI 编码代理

仓库根目录的 [AGENTS.md](AGENTS.md) 是写给 AI 代理的项目说明：模块划分、常用命令、架构约束、代码风格、验证方式都在里面。读完即可上手改代码，不必先通读全仓库。

## License

MIT
