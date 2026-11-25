/**
 * src/plugins/element.ts —— Element Plus 按需注册
 * ------------------------------------------------------------------
 * 之前是 `app.use(ElementPlus)` + 全量 CSS，等于把 80 多个组件（约 1 MB JS、
 * 390 KB CSS）全部塞进渲染进程，页面从来没用到它们，却要一直占着内存。
 * 这里只引真正用到的 8 个组件和各组件的样式，构建体积和运行时堆都能降下来。
 *
 * 新增 Element 组件时，两件事都要做：
 *   1. 在下面 import 组件，并加进 COMPONENTS
 *   2. import 对应的 style/css
 */

import type { App } from 'vue'
import { ElButton } from 'element-plus/es/components/button/index.mjs'
import { ElSwitch } from 'element-plus/es/components/switch/index.mjs'
import { ElInput } from 'element-plus/es/components/input/index.mjs'
import { ElSelect } from 'element-plus/es/components/select/index.mjs'
import { ElTimePicker } from 'element-plus/es/components/time-picker/index.mjs'
import { ElDatePicker } from 'element-plus/es/components/date-picker/index.mjs'
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs'
import { ElConfigProvider } from 'element-plus/es/components/config-provider/index.mjs'

// 组件样式（每个文件只会带上自己和依赖组件的样式）
import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/time-picker/style/css'
import 'element-plus/es/components/date-picker/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/message/style/css'
// 深色主题的 CSS 变量（很小，但必须有）
import 'element-plus/theme-chalk/dark/css-vars.css'

const COMPONENTS = [
  ElButton,
  ElSwitch,
  ElInput,
  // ElSelect 的 install 会顺带注册 ElOption / ElOptionGroup
  ElSelect,
  ElTimePicker,
  ElDatePicker,
  ElDialog,
  ElConfigProvider
] as const

export function installElement(app: App): void {
  for (const component of COMPONENTS) app.use(component)
}
