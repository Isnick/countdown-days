<script setup lang="ts">
/**
 * 日历面板
 * ------------------------------------------------------------------
 * 一个月一屏的月历，每个格子里是「公历日 + 一行小字」：
 *   小字优先级 —— 法定假期名 > 传统节日（腊八 / 小年 / 除夕…）> 节气 > 国际节日 > 农历日期
 * 视觉分档：法定假期是玫红色块，传统节日暖金色，节气青绿色，国际节日灰蓝，农历日期最淡；
 * 调休上班日右上角另挂一个「班」角标。点任意一天，底部列出这天的全部条目。
 */
import { computed, ref, watch } from 'vue'
import { HOLIDAY_SOURCE, WEEK_CN } from '@shared/constants'
import { keyOf, parseDate } from '@shared/date'
import { dayInfo, HOLIDAY_YEARS, type CaptionKind, type FestivalItem } from '@/utils/festivals'

const props = defineProps<{ modelValue: boolean; now: Date }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

/** 周一打头，符合国内日历习惯 */
const WEEK_HEAD = [1, 2, 3, 4, 5, 6, 0].map((index) => WEEK_CN[index])

interface Cell {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  isWeekend: boolean
  items: FestivalItem[]
  /** 格子下面那行小字 */
  caption: { text: string; kind: CaptionKind } | null
  /** 农历正月初一 · 丁未年 */
  lunarText: string
  isHoliday: boolean
  isMakeup: boolean
}

const cursorYear = ref(props.now.getFullYear())
const cursorMonth = ref(props.now.getMonth() + 1)
const selectedKey = ref(keyOf(props.now))

const todayKey = computed(() => keyOf(props.now))

/** 每次打开都回到「今天所在月 + 选中今天」，避免上次翻到别处 */
watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) return
    cursorYear.value = props.now.getFullYear()
    cursorMonth.value = props.now.getMonth() + 1
    selectedKey.value = keyOf(props.now)
  }
)

/** 把一天打包成格子数据（格子、选中项都用同一份，避免重复计算） */
function cellOf(date: Date, inMonth: boolean): Cell {
  const info = dayInfo(date)
  return {
    key: keyOf(date),
    day: date.getDate(),
    inMonth,
    isToday: keyOf(date) === todayKey.value,
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
    items: info.items,
    caption: info.caption,
    lunarText: info.lunar
      ? `农历${info.lunar.text} · ${info.lunar.ganZhiYear}`
      : '农历数据只覆盖 1900 - 2100 年',
    isHoliday: info.items.some((item) => item.kind === 'holiday'),
    isMakeup: info.items.some((item) => item.kind === 'makeup')
  }
}

/** 6×7 固定网格：月初前面补上个月的尾巴，月末后面补下个月的头 */
const cells = computed<Cell[]>(() => {
  const first = new Date(cursorYear.value, cursorMonth.value - 1, 1)
  const offset = (first.getDay() + 6) % 7 // 周一为 0
  const list: Cell[] = []

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(cursorYear.value, cursorMonth.value - 1, 1 - offset + i)
    const inMonth =
      date.getMonth() + 1 === cursorMonth.value && date.getFullYear() === cursorYear.value
    list.push(cellOf(date, inMonth))
  }
  return list
})

/** 选中的那一天（默认今天） */
const selected = computed<Cell>(() => {
  for (const cell of cells.value) {
    if (cell.key === selectedKey.value) return cell
  }
  return cellOf(parseDate(selectedKey.value), true)
})

const selectedTitle = computed(() => {
  const date = parseDate(selectedKey.value)
  const weekday = `周${WEEK_CN[date.getDay()]}`
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${weekday}`
})

const holidayYearsText = computed(() => (HOLIDAY_YEARS.length ? HOLIDAY_YEARS.join(' / ') : '—'))

/** 详情里每种条目的标签文案 */
const KIND_TAG: Record<FestivalItem['kind'], string> = {
  holiday: '法定假期',
  makeup: '调休',
  lunar: '传统节日',
  term: '节气',
  festival: '节日'
}

function shift(step: number): void {
  const next = new Date(cursorYear.value, cursorMonth.value - 1 + step, 1)
  cursorYear.value = next.getFullYear()
  cursorMonth.value = next.getMonth() + 1

  // 选中日跟着翻月走，否则会出现「看着 2 月、详情写着 11 月」的错位
  const current = parseDate(selectedKey.value)
  if (current.getFullYear() !== next.getFullYear() || current.getMonth() !== next.getMonth()) {
    selectedKey.value = keyOf(next)
  }
}

function backToToday(): void {
  cursorYear.value = props.now.getFullYear()
  cursorMonth.value = props.now.getMonth() + 1
  selectedKey.value = keyOf(props.now)
}

function isSelected(key: string): boolean {
  return key === selectedKey.value
}
</script>

<template>
  <el-dialog
    v-model="open"
    width="560px"
    align-center
    append-to-body
    class="settings-dialog calendar-dialog"
  >
    <template #header>
      <div class="cal-head">
        <div class="cal-title">
          <b>{{ cursorYear }} 年</b>
          <span>{{ String(cursorMonth).padStart(2, '0') }} 月</span>
        </div>
        <div class="cal-nav">
          <button class="nav-btn" title="上个月" @click="shift(-1)">‹</button>
          <button class="nav-btn today-btn" @click="backToToday">今天</button>
          <button class="nav-btn" title="下个月" @click="shift(1)">›</button>
        </div>
      </div>
    </template>

    <div class="cal-body">
      <div class="week-row">
        <span v-for="label in WEEK_HEAD" :key="label" class="week-cell">{{ label }}</span>
      </div>

      <div class="day-grid">
        <button
          v-for="cell in cells"
          :key="cell.key"
          class="day-cell"
          :class="{
            'is-out': !cell.inMonth,
            'is-today': cell.isToday,
            'is-weekend': cell.isWeekend,
            'is-holiday': cell.isHoliday,
            'is-selected': isSelected(cell.key)
          }"
          @click="selectedKey = cell.key"
        >
          <span v-if="cell.isMakeup" class="day-makeup">班</span>
          <span class="day-num">{{ cell.day }}</span>
          <span v-if="cell.caption" class="day-caption" :class="`cap-${cell.caption.kind}`">
            {{ cell.caption.text }}
          </span>
        </button>
      </div>

      <div class="legend">
        <span class="legend-item"><i class="sw-holiday"></i>法定假期</span>
        <span class="legend-item"><i class="sw-lunar"></i>传统节日</span>
        <span class="legend-item"><i class="sw-term"></i>节气</span>
        <span class="legend-item"><i class="sw-festival"></i>国际节日</span>
        <span class="legend-item"><i class="sw-makeup">班</i>调休上班</span>
      </div>

      <div class="day-detail">
        <div class="detail-head">
          <b>{{ selectedTitle }}</b>
          <span v-if="selected.isToday" class="today-tag">今天</span>
        </div>
        <div class="detail-lunar">{{ selected.lunarText }}</div>

        <ul v-if="selected.items.length" class="detail-list">
          <li
            v-for="item in selected.items"
            :key="`${item.kind}-${item.name}`"
            :class="`kind-${item.kind}`"
          >
            <span class="d-emoji">{{ item.emoji }}</span>
            <div class="d-text">
              <b>{{ item.name }}</b>
              <span v-if="item.note">{{ item.note }}</span>
            </div>
            <span class="d-tag">{{ KIND_TAG[item.kind] }}</span>
          </li>
        </ul>
        <p v-else class="detail-empty">这天没有节日，普通的一天也是好日子。</p>
      </div>

      <div class="cal-foot">
        {{ HOLIDAY_SOURCE }} · 法定假期数据覆盖 {{ holidayYearsText }} 年；农历与节气按天文算法换算，支持 1900 - 2100 年
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 右边给弹窗自带的关闭按钮留位置，否则翻月箭头会和它叠在一起 */
  padding-right: 32px;
}

.cal-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cal-title b {
  font-size: 15px;
  font-weight: 600;
  color: #e9edf6;
  letter-spacing: 0.4px;
}

.cal-title span {
  font-family: var(--mono);
  font-size: 12.5px;
  color: var(--muted);
  letter-spacing: 1px;
}

.cal-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-btn {
  height: 26px;
  min-width: 26px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid #2b3444;
  background: rgba(255, 255, 255, 0.045);
  color: #c2cbdb;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #3d4a61;
  color: #fff;
}

.nav-btn.today-btn {
  font-size: 11.5px;
  letter-spacing: 0.5px;
  color: var(--teal);
  border-color: rgba(94, 234, 212, 0.3);
  background: rgba(94, 234, 212, 0.08);
}

.cal-body {
  padding: 2px 0 0;
}

.week-row,
.day-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.week-cell {
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 1px;
  color: var(--dim);
  padding-bottom: 6px;
  text-transform: uppercase;
}

.day-cell {
  position: relative;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.022);
  color: #cdd6e4;
  cursor: pointer;
  padding: 4px 2px;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    transform 0.14s ease;
}

.day-cell:hover {
  background: rgba(255, 255, 255, 0.07);
}

.day-cell.is-out {
  color: #4d5769;
  background: transparent;
}

.day-cell.is-weekend:not(.is-holiday) .day-num {
  color: #b9c4d6;
}

.day-num {
  font-family: var(--mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

/* ---------- 格子下面那行小字 ---------- */
.day-caption {
  font-size: 10px;
  line-height: 1.15;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  letter-spacing: 0;
}

.cap-holiday {
  color: #ffb4b4;
}

.cap-lunar {
  color: #e6c58c;
}

.cap-term {
  color: #7fd8c8;
}

.cap-festival {
  color: #9aa6bb;
}

.cap-lunarDay {
  color: #6f7a8f;
}

.day-cell.is-out .day-caption {
  opacity: 0.5;
}

/* 法定节假日：醒目的玫红色块 */
.day-cell.is-holiday {
  background: linear-gradient(180deg, rgba(248, 113, 113, 0.26), rgba(248, 113, 113, 0.13));
  border-color: rgba(248, 113, 113, 0.42);
}

.day-cell.is-holiday .day-num {
  color: #ffd9d9;
  font-weight: 700;
}

.day-cell.is-out.is-holiday {
  background: rgba(248, 113, 113, 0.07);
  border-color: rgba(248, 113, 113, 0.14);
}

/* 调休上班：右上角小角标 */
.day-makeup {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 9px;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 4px;
  color: var(--gold);
  background: rgba(245, 194, 107, 0.16);
  border: 1px solid rgba(245, 194, 107, 0.28);
}

.day-cell.is-selected {
  border-color: rgba(94, 234, 212, 0.75);
  box-shadow:
    0 0 0 1px rgba(94, 234, 212, 0.35),
    0 8px 18px rgba(0, 0, 0, 0.32);
}

.day-cell.is-today:not(.is-selected) {
  border-color: rgba(94, 234, 212, 0.38);
}

.day-cell.is-today .day-num {
  color: var(--teal);
  font-weight: 700;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 12px 2px 0;
  font-size: 10.5px;
  color: var(--dim);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sw-holiday {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(248, 113, 113, 0.5), rgba(248, 113, 113, 0.22));
  border: 1px solid rgba(248, 113, 113, 0.5);
}

.sw-lunar {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: #e6c58c;
}

.sw-term {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: #7fd8c8;
}

.sw-festival {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  background: #9aa6bb;
}

.sw-makeup {
  font-style: normal;
  font-size: 9px;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 4px;
  color: var(--gold);
  background: rgba(245, 194, 107, 0.16);
  border: 1px solid rgba(245, 194, 107, 0.28);
}

.day-detail {
  margin-top: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  border: 1px solid #232a38;
  background: rgba(255, 255, 255, 0.026);
  min-height: 78px;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #dfe7f4;
}

.detail-head b {
  font-weight: 600;
}

.today-tag {
  font-size: 9.5px;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--teal);
  background: rgba(94, 234, 212, 0.12);
  border: 1px solid rgba(94, 234, 212, 0.3);
}

.detail-lunar {
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--dim);
  letter-spacing: 0.3px;
}

.detail-list {
  list-style: none;
  margin: 9px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.detail-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
}

.d-emoji {
  font-size: 13px;
  line-height: 1;
}

.d-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.d-text b {
  font-size: 12px;
  font-weight: 600;
  color: #dfe7f4;
}

.d-text span {
  font-size: 10.5px;
  color: var(--dim);
  line-height: 1.4;
}

.d-tag {
  font-size: 9.5px;
  padding: 1px 6px;
  border-radius: 999px;
  white-space: nowrap;
  color: var(--dim);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #2b3444;
}

.kind-holiday .d-tag {
  color: #ffb4b4;
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.3);
}

.kind-lunar .d-tag {
  color: #e6c58c;
  background: rgba(230, 197, 140, 0.12);
  border-color: rgba(230, 197, 140, 0.28);
}

.kind-term .d-tag {
  color: #7fd8c8;
  background: rgba(127, 216, 200, 0.12);
  border-color: rgba(127, 216, 200, 0.28);
}

.kind-makeup .d-tag {
  color: var(--gold);
  background: rgba(245, 194, 107, 0.12);
  border-color: rgba(245, 194, 107, 0.3);
}

.detail-empty {
  margin: 10px 0 2px;
  font-size: 11.5px;
  color: var(--dim);
}

.cal-foot {
  margin-top: 11px;
  font-size: 10px;
  line-height: 1.6;
  color: #4d5769;
}
</style>
