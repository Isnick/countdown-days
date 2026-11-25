/**
 * src/mini/main.ts —— 迷你胶囊页面入口
 * ------------------------------------------------------------------
 * 故意不引 Element Plus：这个页面要一直挂在桌面上，
 * 为了一条倒计时去背一份组件库不值当。需要的只是 Vue 和几个 composable。
 */

import { createApp } from 'vue'

import '../styles/tokens.css'
import '../styles/mini.css'

import MiniCapsule from './MiniCapsule.vue'

createApp(MiniCapsule).mount('#app')
