<script setup lang="ts">
/**
 * 久坐提醒卡片
 * 计时在主进程跑（窗口最小化也能提醒），这里只负责展示 + 发起动作 + 改间隔。
 */
import { computed, toRef } from 'vue'
import { LIMITS, SIT_INTERVAL_OPTIONS, SIT_SCOPE_OPTIONS } from '@shared/constants'
import { useSettings } from '@/composables/useSettings'
import { useSit } from '@/composables/useSit'
import { useSitView } from '@/composables/useSitView'
import SitOrb from './SitOrb.vue'

const props = defineProps<{ now: Date }>()

const { settings, save } = useSettings()
const { state, standUp, snooze } = useSit()
const view = useSitView(toRef(props, 'now'), state)

const snoozeMinutes = LIMITS.snooze.defaultValue

/** 用户可能在设置文件里存了非预设值，也要能在下拉里选中 */
const intervalOptions = computed(() => {
  const list: number[] = [...SIT_INTERVAL_OPTIONS]
  if (!list.includes(settings.sitIntervalMin)) list.push(settings.sitIntervalMin)
  return list.sort((a, b) => a - b)
})

const interval = computed<number>({
  get: () => settings.sitIntervalMin,
  set: (value) => save({ sitIntervalMin: value }, true)
})

const scope = computed<string>({
  get: () => (settings.sitWorkHoursOnly ? 'work' : 'all'),
  set: (value) => save({ sitWorkHoursOnly: value === 'work' }, true)
})
</script>

<template>
  <article class="card card-sit">
    <div class="card-head">
      <div class="label-wrap">
        <span class="dot dot-gold"></span>
        <span class="card-label">久坐提醒</span>
      </div>
      <span :class="view.pillClass">{{ view.pillText }}</span>
    </div>

    <div class="sit-body">
      <SitOrb
        :pct-text="view.pctText"
        :liquid-height="view.liquidHeight"
        :caption="view.caption"
        :is-paused="view.isPaused"
        :is-off="view.isOff"
        :is-over="view.isOver"
      />

      <div class="sit-info">
        <div class="sit-title">{{ view.title }}</div>
        <div class="sit-sub">{{ view.sub }}</div>

        <div class="sit-actions">
          <el-button type="primary" size="small" @click="standUp()">我起来活动了</el-button>
          <el-button size="small" @click="snooze(snoozeMinutes)">稍后 {{ snoozeMinutes }} 分钟</el-button>
        </div>

        <div class="sit-config">
          <label class="mini-field">
            间隔
            <el-select v-model="interval" size="small" class="mini-select">
              <el-option
                v-for="minutes in intervalOptions"
                :key="minutes"
                :value="minutes"
                :label="`${minutes} 分钟`"
              />
            </el-select>
          </label>

          <label class="mini-field">
            只在
            <el-select v-model="scope" size="small" class="mini-select mini-select-wide">
              <el-option
                v-for="option in SIT_SCOPE_OPTIONS"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </el-select>
          </label>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.sit-body {
  display: flex;
  align-items: center;
  gap: clamp(12px, 1.6vw, 20px);
  margin-top: clamp(8px, 1.2vh, 12px);
}

.sit-info {
  flex: 1;
  min-width: 0;
}

.sit-title {
  font-size: clamp(12px, 1.5vh, 13px);
  color: #dfe7f4;
  font-weight: 600;
}

.sit-sub {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 3px;
  line-height: 1.5;
}

.sit-actions {
  display: flex;
  gap: 8px;
  margin-top: clamp(8px, 1.1vh, 11px);
  flex-wrap: wrap;
}

.sit-config {
  display: flex;
  gap: 10px;
  margin-top: clamp(8px, 1.2vh, 12px);
  flex-wrap: wrap;
}

.mini-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--dim);
}

.mini-select {
  width: 100px;
}

.mini-select-wide {
  width: 132px;
}

@media (max-width: 1080px) {
  .sit-actions :deep(.el-button) {
    padding: 6px 10px;
    font-size: 12px;
  }
}
</style>
