<script setup lang="ts">
/**
 * 「我已经活了」卡片：已活天数 / 下次生日 / 这一岁的进度
 */
import { computed, toRef } from 'vue'
import type { Settings } from '@shared/types'
import { useSettings } from '@/composables/useSettings'
import { useLifeStats } from '@/composables/useLifeStats'
import { percent, thousands } from '@/utils/format'
import RichLine from '../common/RichLine.vue'

const props = defineProps<{ now: Date; settings: Settings }>()

const { save } = useSettings()
const view = useLifeStats(toRef(props, 'now'), props.settings)

const birthday = computed<string>({
  get: () => props.settings.birthday,
  set: (value) => {
    save({ birthday: typeof value === 'string' ? value : '' }, true)
  }
})

/** 未来的日期没有意义，直接在日历里禁掉 */
const disableFuture = (date: Date): boolean => date.getTime() > Date.now()
</script>

<template>
  <article class="card card-life">
    <div class="card-head">
      <div class="label-wrap">
        <span class="dot dot-violet"></span>
        <span class="card-label">我已经活了</span>
      </div>
      <span class="pill pill-muted">{{ view.pillText }}</span>
    </div>

    <div class="age-num" :class="{ 'is-empty': view.empty }">
      <template v-if="view.daysLived !== null">
        {{ thousands(view.daysLived) }}<em>天</em>
      </template>
      <template v-else>{{ view.future ? '日期在未来' : '还没设置' }}</template>
    </div>

    <div class="card-sub">
      <RichLine :parts="view.sub" />
    </div>

    <div class="life-grid">
      <label class="field">
        <span>出生日期</span>
        <el-date-picker
          v-model="birthday"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          :clearable="false"
          :disabled-date="disableFuture"
          size="small"
          placeholder="选择日期"
        />
      </label>

      <div class="life-stat">
        <span>距下次生日</span>
        <b>
          {{ view.nextMain }}
          <small v-if="view.nextHint">{{ view.nextHint }}</small>
        </b>
      </div>
    </div>

    <div class="bar bar-thin">
      <i class="violet" :style="{ width: percent(view.pct) }"></i>
    </div>

    <div class="bar-caption">
      <span>{{ view.caption }}</span>
      <span>{{ view.pctText }}</span>
    </div>
  </article>
</template>

<style scoped>
.life-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: end;
  margin-top: clamp(10px, 1.6vh, 16px);
}

.life-grid :deep(.el-date-editor) {
  width: 100%;
}

.life-stat {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.life-stat > span {
  font-size: 10.5px;
  letter-spacing: 0.9px;
  color: var(--dim);
  text-transform: uppercase;
}

.life-stat > b {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 600;
  color: #e6ddff;
  font-variant-numeric: tabular-nums;
}

.life-stat > b small {
  font-size: 11px;
  color: var(--violet);
  margin-left: 3px;
  opacity: 0.8;
}

.bar-caption {
  font-size: 10.5px;
  color: var(--dim);
  margin-top: 7px;
  display: flex;
  justify-content: space-between;
}
</style>
