<script setup lang="ts">
/**
 * 工作日芯片：一 ~ 日 七个可切换的小方块。
 * 主页卡片和设置弹层共用，选项来自 shared/constants.ts 的 WEEKDAYS。
 */
import { WEEKDAYS } from '@shared/constants'

defineProps<{ active: number[] }>()
const emit = defineEmits<{ toggle: [day: number] }>()
</script>

<template>
  <div class="workdays">
    <button
      v-for="day in WEEKDAYS"
      :key="day.value"
      type="button"
      class="wd"
      :class="{ on: active.includes(day.value) }"
      @click="emit('toggle', day.value)"
    >
      {{ day.label }}
    </button>
  </div>
</template>
