<script setup lang="ts">
/** 单个假期卡片：倒计时数字 / 日期区间 / 调休说明 */
import type { HolidayCardModel } from '@/composables/useHolidays'

defineProps<{ card: HolidayCardModel }>()
</script>

<template>
  <article
    class="hcard"
    :data-tone="card.rule.tone"
    :class="{ 'is-next': card.isNext, 'is-today': card.isToday }"
  >
    <div class="h-top">
      <span class="h-emoji">{{ card.rule.emoji }}</span>
      <span class="h-name">{{ card.rule.name }}</span>
      <span v-if="card.isNext" class="h-tag">下一个</span>
    </div>

    <div class="h-days">
      <b :class="{ 'is-text': card.isText }">{{ card.daysText }}</b>
      <span v-if="card.showUnit">天</span>
    </div>

    <div class="h-when">{{ card.rangeText }}</div>
    <div class="h-note">{{ card.noteText }}</div>
  </article>
</template>

<style scoped>
.hcard {
  --tone: #7aa2ff;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(9px, 1.3vh, 12px) clamp(11px, 1.1vw, 15px) clamp(9px, 1.3vh, 13px);
  border-radius: 14px;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, #141922, #10141b);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
  overflow: hidden;
}

.hcard::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(240px 120px at 8% -30%, color-mix(in srgb, var(--tone) 22%, transparent), transparent 70%);
  opacity: 0.55;
  pointer-events: none;
}

.hcard > * {
  position: relative;
}

.hcard:hover {
  transform: translateY(-2px);
  border-color: #33405a;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.34);
}

.hcard.is-next {
  border-color: color-mix(in srgb, var(--tone) 46%, #232a38);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tone) 14%, transparent),
    0 14px 32px rgba(0, 0, 0, 0.35);
}

.hcard.is-next::before {
  opacity: 0.95;
}

.hcard.is-today {
  border-color: color-mix(in srgb, var(--tone) 70%, #232a38);
  background: linear-gradient(180deg, color-mix(in srgb, var(--tone) 16%, #141922), #10141b);
}

.hcard[data-tone='blue'] {
  --tone: #7aa2ff;
}
.hcard[data-tone='rose'] {
  --tone: #ff8f8f;
}
.hcard[data-tone='mint'] {
  --tone: #5eead4;
}
.hcard[data-tone='gold'] {
  --tone: #f5c26b;
}
.hcard[data-tone='green'] {
  --tone: #86efac;
}
.hcard[data-tone='violet'] {
  --tone: #b8a0ff;
}
.hcard[data-tone='red'] {
  --tone: #ff9a8a;
}

.h-top {
  display: flex;
  align-items: center;
  gap: 7px;
}

.h-emoji {
  font-size: 14px;
  line-height: 1;
}

.h-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #dbe4f2;
  letter-spacing: 0.3px;
}

.h-tag {
  margin-left: auto;
  font-size: 9.5px;
  letter-spacing: 0.6px;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent);
}

.h-days {
  margin-top: clamp(6px, 1vh, 10px);
  display: flex;
  align-items: baseline;
  gap: 3px;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.h-days b {
  font-size: clamp(22px, 3.1vh, 32px);
  font-weight: 600;
  color: var(--tone);
  letter-spacing: 0.5px;
}

.h-days b.is-text {
  font-size: clamp(14px, 1.8vh, 17px);
  line-height: 1.5;
}

.h-days span {
  font-size: 11.5px;
  color: var(--dim);
  letter-spacing: 1px;
}

.h-when {
  margin-top: clamp(4px, 0.8vh, 8px);
  font-size: 11px;
  color: #a6b1c6;
  font-variant-numeric: tabular-nums;
}

.h-note {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--dim);
  line-height: 1.45;
}

@media (max-width: 1080px) {
  .h-when {
    font-size: 10.5px;
  }
  .h-note {
    font-size: 10px;
  }
}
</style>
