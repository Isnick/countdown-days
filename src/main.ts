/**
 * src/main.ts —— 渲染进程入口
 * Vue 3 + TypeScript + Element Plus（按需引入，见 plugins/element.ts）。
 */

import { createApp } from 'vue'

// 先让 Element Plus 的组件样式进来，后面的 styles/element.css 才能盖住它
import { installElement } from './plugins/element'

import './styles/tokens.css'
import './styles/base.css'
import './styles/widgets.css'
import './styles/element.css'

import App from './App.vue'

document.documentElement.classList.add('dark')

const app = createApp(App)
installElement(app)
app.mount('#app')
