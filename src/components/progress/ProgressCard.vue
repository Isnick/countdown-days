<script setup lang="ts">
/**
 * 时间进度卡片：今天 / 本周 / 今年 各走了多少
 */
import { toRef } from 'vue'
import { useTimeProgress } from '@/composables/useTimeProgress'
import { percent } from '@/utils/format'

const props = defineProps<{ now: Date }>()
const view = useTimeProgress(toRef(props, 'now'))
</script>

<template>
  <article class="card card-progress">
    <div class="card-head">
      <div class="label-wrap">
        <span class="dot dot-blue"></span>
        <span class="card-label">时间进度</span>
      </div>
      <span class="pill pill-muted">{{ view.year }}</span>
    </div>

    <div class="prog">
      <div v-for="row in view.rows" :key="row.key" class="prog-row">
        <div class="prog-top">
          <span>{{ row.label }}</span>
          <b>{{ row.pctText }}</b>
        </div>
        <div class="bar bar-thin">
          <i :class="row.tone" :style="{ width: percent(row.pct) }"></i>
        </div>
        <div class="prog-foot">{{ row.footText }}</div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.prog {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.5vh, 13px);
  margin-top: clamp(8px, 1.5vh, 14px);
}

.prog-row .prog-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12px;
  color: #c3cddd;
}

.prog-row .prog-top b {
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 600;
  color: #e9f0fb;
  font-variant-numeric: tabular-nums;
}

.prog-row .prog-foot {
  font-size: 10.5px;
  color: var(--dim);
  margin-top: 5px;
  text-align: right;
}

.prog-row .bar {
  margin-top: 6px;
}
</style>
