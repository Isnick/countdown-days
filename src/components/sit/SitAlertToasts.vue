<script setup lang="ts">
/**
 * 久坐提醒气泡（应用内提醒）
 * 系统通知可能被系统设置拦掉，所以窗口里再兜一层：有声音 + 两个可点的动作。
 * 外部通过 ref.push(minutes) 塞入一条提醒。
 */
import { ref } from 'vue'
import { COPY, LIMITS, TIMING } from '@shared/constants'
import { useSit } from '@/composables/useSit'

interface ToastItem {
  id: number
  minutes: number
  leaving: boolean
}

const items = ref<ToastItem[]>([])
let seq = 0

const { standUp, snooze } = useSit()
const snoozeMinutes = LIMITS.snooze.defaultValue

function dismiss(id: number): void {
  const item = items.value.find((entry) => entry.id === id)
  if (!item || item.leaving) return
  item.leaving = true
  // 等退场动画结束再移除，避免列表瞬间跳动
  window.setTimeout(() => {
    items.value = items.value.filter((entry) => entry.id !== id)
  }, TIMING.toastLeaveMs)
}

function push(minutes: number): void {
  seq += 1
  const item: ToastItem = { id: seq, minutes, leaving: false }
  items.value.push(item)
  window.setTimeout(() => dismiss(item.id), TIMING.toastDurationMs)
}

async function act(id: number, action: 'stand' | 'snooze'): Promise<void> {
  if (action === 'stand') await standUp()
  else await snooze(snoozeMinutes)
  dismiss(id)
}

defineExpose({ push })
</script>

<template>
  <div class="toasts">
    <div
      v-for="item in items"
      :key="item.id"
      class="toast"
      :class="{ leaving: item.leaving }"
    >
      <h4><i>🪑</i>{{ COPY.sitAlert.title }}</h4>
      <p>{{ COPY.sitAlert.toastBody(item.minutes) }}</p>
      <div class="toast-actions">
        <el-button type="primary" size="small" @click="act(item.id, 'stand')">我起来活动了</el-button>
        <el-button size="small" @click="act(item.id, 'snooze')">{{ snoozeMinutes }} 分钟后再提醒</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 22px;
  bottom: 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 90;
}

.toast {
  width: 296px;
  padding: 14px 15px 13px;
  border-radius: 14px;
  border: 1px solid rgba(245, 194, 107, 0.34);
  background: linear-gradient(180deg, #20222b, #171a22);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
  animation: toast-in 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}

.toast.leaving {
  animation: toast-out 0.25s ease forwards;
}

.toast h4 {
  margin: 0 0 5px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 7px;
}

.toast h4 i {
  font-style: normal;
}

.toast p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: #a7b2c6;
}

.toast-actions {
  display: flex;
  gap: 8px;
  margin-top: 11px;
}

.toast-actions :deep(.el-button) {
  padding: 5px 10px;
  font-size: 11.5px;
  height: 26px;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes toast-out {
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
</style>
