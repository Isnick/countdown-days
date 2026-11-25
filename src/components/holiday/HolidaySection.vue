<script setup lang="ts">
/** 假期倒计时区块：标题 + 卡片网格 */
import { computed } from 'vue'
import { HOLIDAY_SOURCE } from '@shared/constants'
import { keyOf, parseDate } from '@shared/date'
import { useHolidays } from '@/composables/useHolidays'
import HolidayCard from './HolidayCard.vue'

const props = defineProps<{ now: Date }>()

/**
 * 假期列表只跟「哪一天」有关，跟「几点几分」无关。
 * 这里把秒级的 now 收窄成日级的 today：日历列表只在跨天时重算一次，
 * 不会再每秒重渲染九个卡片 —— 界面一直挂着的时候能省不少无谓开销。
 */
const today = computed(() => parseDate(keyOf(props.now)))
const cards = useHolidays(today)
</script>

<template>
  <section class="section">
    <div class="sec-head">
      <h2>假期倒计时</h2>
      <span class="sec-note">{{ HOLIDAY_SOURCE }}</span>
    </div>

    <div v-if="cards.length" class="holiday-grid">
      <HolidayCard v-for="card in cards" :key="card.key" :card="card" />
    </div>
    <div v-else class="h-empty">假期表已经用完了，去 shared/constants.ts 里补上新一年的安排。</div>
  </section>
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
}

.sec-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 2px clamp(6px, 1vh, 10px);
}

.sec-head h2 {
  margin: 0;
  font-size: 13px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: #cfd8e6;
  font-weight: 600;
}

.sec-note {
  font-size: 11px;
  color: var(--dim);
}

.holiday-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(186px, 100%), 1fr));
  gap: clamp(7px, 1.1vh, 10px);
}

.h-empty {
  padding: 8px 2px;
  font-size: 11.5px;
  color: var(--dim);
}
</style>
