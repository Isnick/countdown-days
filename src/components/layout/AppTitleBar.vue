<script setup lang="ts">
/**
 * 自绘标题栏：整条可拖动，右侧留出系统的最小化 / 最大化 / 关闭按钮（由 titleBarOverlay 提供）。
 * 日历 / 设置两个按钮放在系统按钮左边。
 */
import { APP, COPY } from '@shared/constants'
import type { RichPart } from '@shared/types'
import RichLine from '../common/RichLine.vue'

defineProps<{ today: RichPart[] }>()
const emit = defineEmits<{
  'open-settings': []
  'open-calendar': []
  'open-mini': []
  'open-trending': []
}>()
</script>

<template>
  <header class="titlebar">
    <div class="brand">
      <span class="logo">{{ APP.brandMark }}</span>
      <span class="brand-name">{{ APP.title }}</span>
      <span class="brand-sub">{{ APP.brandSub }}</span>
    </div>

    <div class="titlebar-hint">
      <RichLine :parts="today" />
    </div>

    <el-button class="ghost-btn" text size="small" @click="emit('open-trending')">趋势</el-button>
    <el-button class="ghost-btn" text size="small" :title="COPY.mini.shortcutHint" @click="emit('open-mini')">
      迷你窗
    </el-button>
    <el-button class="ghost-btn" text size="small" @click="emit('open-calendar')">
      <span class="btn-icon">📅</span>日历
    </el-button>
    <el-button class="ghost-btn" text size="small" @click="emit('open-settings')">设置</el-button>
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-h);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 150px 0 16px; /* 右侧 150px 让开系统按钮区 */
  /* 标题栏下面是自己的渐变底，不需要 backdrop-filter：
     毛玻璃会额外锁一层整条背景的合成层，长期运行白占显存 */
  background: rgba(11, 14, 19, 0.94);
  border-bottom: 1px solid #1b212c;
  flex: none;
  z-index: 40;
  -webkit-app-region: drag;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand .logo {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: linear-gradient(150deg, var(--teal), #2bbfa6);
  color: #062a24;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 0 14px rgba(94, 234, 212, 0.35);
}

.brand-name {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: #dfe7f4;
}

.brand-sub {
  font-size: 10.5px;
  color: var(--dim);
  letter-spacing: 1.4px;
  text-transform: uppercase;
}

.titlebar-hint {
  flex: 1;
  font-size: 11.5px;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 6px;
}

.titlebar-hint :deep(b) {
  color: #a9b4c7;
  font-weight: 500;
}

.ghost-btn {
  -webkit-app-region: no-drag;
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
  border-radius: 7px;
  color: #c2cbdb;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #262e3d;
  margin-left: 0;
}

.btn-icon {
  margin-right: 5px;
  font-size: 11.5px;
}

.ghost-btn + .ghost-btn {
  margin-left: 6px;
}

.ghost-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  color: #fff;
  border-color: #3a455c;
}
</style>
