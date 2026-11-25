<script setup lang="ts">
/**
 * 下班倒计时卡片
 * 展示：还有多久下班 / 距离上班 / 假期剩余 / 今天已下班
 * 交互：直接改上下班时间、勾工作日（改完立即落盘）
 */
import { computed, toRef } from 'vue'
import { PATTERNS } from '@shared/constants'
import type { Settings } from '@shared/types'
import { useSettings } from '@/composables/useSettings'
import { useWorkCountdown } from '@/composables/useWorkCountdown'
import { percent } from '@/utils/format'
import RichLine from '../common/RichLine.vue'
import WorkdayChips from '../common/WorkdayChips.vue'

const props = defineProps<{ now: Date; settings: Settings }>()

const { save, toggleWorkday } = useSettings()
const view = useWorkCountdown(toRef(props, 'now'), props.settings)

const workStart = computed<string>({
  get: () => props.settings.workStart,
  set: (value) => {
    if (value && PATTERNS.time.test(value)) save({ workStart: value }, true)
  }
})

const workEnd = computed<string>({
  get: () => props.settings.workEnd,
  set: (value) => {
    if (value && PATTERNS.time.test(value)) save({ workEnd: value }, true)
  }
})
</script>

<template>
  <article class="card card-work">
    <div class="card-head">
      <div class="label-wrap">
        <span class="dot dot-teal"></span>
        <span class="card-label">{{ view.label }}</span>
      </div>
      <span :class="view.pillClass">{{ view.pillText }}</span>
    </div>

    <div :class="view.timerClass">{{ view.text }}</div>
    <div class="card-sub">
      <RichLine :parts="view.sub" />
    </div>

    <div class="bar">
      <i :style="{ width: percent(view.pct) }"></i>
    </div>

    <div class="work-controls">
      <label class="field">
        <span>上班</span>
        <el-time-picker
          v-model="workStart"
          format="HH:mm"
          value-format="HH:mm"
          :clearable="false"
          :editable="false"
          size="small"
          placeholder="09:00"
        />
      </label>

      <label class="field">
        <span>下班</span>
        <el-time-picker
          v-model="workEnd"
          format="HH:mm"
          value-format="HH:mm"
          :clearable="false"
          :editable="false"
          size="small"
          placeholder="18:00"
        />
      </label>

      <WorkdayChips :active="settings.workDays" @toggle="toggleWorkday" />
    </div>
  </article>
</template>

<style scoped>
.work-controls {
  display: flex;
  align-items: flex-end;
  gap: clamp(8px, 1.1vw, 12px);
  margin-top: clamp(10px, 1.6vh, 16px);
  padding-top: clamp(9px, 1.4vh, 14px);
  border-top: 1px dashed rgba(255, 255, 255, 0.06);
  flex-wrap: wrap;
}

.work-controls .workdays {
  margin-left: auto;
}

.work-controls :deep(.el-date-editor) {
  width: 96px;
}
</style>
