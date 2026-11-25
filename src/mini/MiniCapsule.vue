<script setup lang="ts">
/**
 * 迷你悬浮胶囊
 * ------------------------------------------------------------------
 * 只干一件事：让你在桌面上随时看见「还有多久下班」，顺带一眼久坐进度。
 * 倒计时逻辑直接复用 useWorkCountdown（和主界面同一份计算，不会哪天走偏）；
 * 久坐计时本来就在主进程跑，这里只是读状态。
 *
 * 两个隐藏手势：拖顶部移动、双击回到主界面。悬停时会浮出一个「展开」按钮兜底。
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { COPY } from '@shared/constants'
import { bridge } from '@/api/bridge'
import { useClock } from '@/composables/useClock'
import { useSettings } from '@/composables/useSettings'
import { useSit } from '@/composables/useSit'
import { useWorkCountdown } from '@/composables/useWorkCountdown'

const now = useClock()
const { settings, load: loadSettings, applyRemote } = useSettings()
const { state: sit, load: loadSit, apply: applySit } = useSit()

const view = useWorkCountdown(now, settings)

/** 卡片只有 320px 宽，主界面那套「下班倒计时」的标签在这里太长 */
const SHORT_LABEL: Record<string, string> = {
  下班倒计时: '距下班',
  今天已下班: '已下班',
  距离上班: '距上班'
}
const label = computed(() => SHORT_LABEL[view.value.label] ?? view.value.label)

/** 出现「3 天 05:12:33」这种长串时收一档字号 */
const isLong = computed(() => view.value.text.length > 13)
const barWidth = computed(() => `${Math.min(100, Math.max(0, view.value.pct * 100))}%`)

/** 久坐环：半径 15，周长用来算 dashoffset */
const RING_R = 15
const RING_LEN = 2 * Math.PI * RING_R

const sitView = computed(() => {
  const state = sit.value
  const elapsed = state ? Math.max(0, now.value.getTime() - state.since) : 0
  const minutes = Math.floor(elapsed / 60_000)

  if (!state || !state.enabled) {
    return { minutes, ratio: 0, tone: 'off', text: '—', tip: '久坐提醒已关闭' }
  }
  if (!state.tracking) {
    return { minutes, ratio: 0, tone: 'idle', text: '—', tip: '当前不在久坐计时段' }
  }

  const ratio = Math.min(1, elapsed / (state.intervalMin * 60_000))
  const over = ratio >= 1
  return {
    minutes,
    ratio,
    tone: over ? 'over' : 'ok',
    text: String(minutes),
    tip: over
      ? `已坐 ${minutes} 分钟，该起来活动一下了`
      : `已坐 ${minutes} 分钟 · 每 ${state.intervalMin} 分钟提醒一次`
  }
})

function expand(): void {
  // 展开时这扇窗会被销毁，IPC 的回包可能来不及回来，这个 reject 是正常的
  bridge?.expandMini().catch(() => {})
}

const offs: Array<() => void> = []

onMounted(async () => {
  if (!bridge) return
  await Promise.all([loadSettings(), loadSit()])
  offs.push(
    // 久坐状态由主进程广播（跨天清零 / 间隔调整 / 起来活动了）
    bridge.onSitState(applySit),
    // 主界面里改了上下班时间、久坐间隔，胶囊立刻跟上
    bridge.onSettingsChanged(({ settings: next }) => applyRemote(next))
  )
})

onUnmounted(() => {
  offs.forEach((off) => off())
})
</script>

<template>
  <div class="stage">
    <div class="capsule" :class="`tone-${view.tone}`" @dblclick="expand">
      <!-- 只有顶部这条能拖：整块都设成 drag 的话，双击事件根本收不到 -->
      <div class="drag-strip"></div>

      <div class="main" :title="COPY.mini.hint">
        <div class="head">
          <span class="dot"></span>
          <span class="label">{{ label }}</span>
        </div>

        <div class="timer" :class="{ 'is-long': isLong }">{{ view.text }}</div>

        <div class="bar">
          <i :style="{ width: barWidth }"></i>
        </div>
      </div>

      <div class="ring-wrap" :class="`is-${sitView.tone}`" :title="sitView.tip">
        <svg class="ring" viewBox="0 0 40 40">
          <circle class="ring-track" cx="20" cy="20" :r="RING_R" />
          <circle
            class="ring-fill"
            cx="20"
            cy="20"
            :r="RING_R"
            :stroke-dasharray="RING_LEN"
            :stroke-dashoffset="RING_LEN * (1 - sitView.ratio)"
          />
        </svg>
        <span class="ring-text">{{ sitView.text }}<em v-if="sitView.text !== '—'">′</em></span>
      </div>

      <button class="expand" type="button" :title="COPY.mini.expand" @click="expand">⤢</button>
    </div>
  </div>
</template>

<style scoped>
.stage {
  height: 100%;
  /* 必须与 shared/constants.ts 里 APP.window.mini.inset 一致：给阴影留的位置 */
  padding: 10px;
  box-sizing: border-box;
}

.capsule {
  --accent: var(--teal);
  --glow: rgba(94, 234, 212, 0.15);

  position: relative;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 10px;
  padding: 11px 13px;
  border: 1px solid #2b3444;
  border-radius: 16px;
  background: linear-gradient(180deg, #1a202c, #11151d);
  /* 阴影范围要落在 stage 的留白里：偏移 4 + 模糊半径的一半 5.5 < 10，
     否则会被窗口边缘切出一条硬边，反而比没有阴影更难看 */
  box-shadow:
    0 4px 11px rgba(0, 0, 0, 0.46),
    0 1px 2px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

/* 左上角的一抹光，和主界面的卡片是同一套语言 */
.capsule::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(200px 80px at 10% -40%, var(--glow), transparent 72%);
}

.tone-gold {
  --accent: var(--gold);
  --glow: rgba(245, 194, 107, 0.16);
}

.tone-idle {
  --accent: #93a2b8;
  --glow: rgba(147, 162, 184, 0.1);
}

.main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 7px var(--accent);
}

.label {
  font-size: 10.5px;
  letter-spacing: 1px;
  color: var(--muted);
}

.timer {
  font-family: var(--mono);
  font-size: 27px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
  color: #eef6f4;
  text-shadow: 0 0 18px rgba(94, 234, 212, 0.18);
  white-space: nowrap;
}

.tone-gold .timer {
  color: var(--gold);
  text-shadow: 0 0 18px rgba(245, 194, 107, 0.16);
}

.tone-idle .timer {
  color: #9fb0c6;
  text-shadow: none;
}

.timer.is-long {
  font-size: 20px;
  letter-spacing: 0;
}

.bar {
  height: 3px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}

.bar > i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--accent);
  opacity: 0.85;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ---------- 久坐环 ---------- */
.ring-wrap {
  position: relative;
  z-index: 1;
  align-self: center;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
}

.ring {
  position: absolute;
  inset: 0;
  width: 40px;
  height: 40px;
}

.ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 3;
}

.ring-fill {
  fill: none;
  stroke: var(--teal);
  stroke-width: 3;
  stroke-linecap: round;
  /* 从 12 点方向开始，和常规进度环一致 */
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  transition:
    stroke-dashoffset 0.45s linear,
    stroke 0.3s ease;
}

.ring-wrap.is-over .ring-fill {
  stroke: var(--gold);
}

.ring-wrap.is-idle .ring-fill,
.ring-wrap.is-off .ring-fill {
  stroke: #3b4557;
}

.ring-text {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: #dfe7f4;
}

.ring-text em {
  font-style: normal;
  font-size: 9px;
  opacity: 0.55;
  margin-left: 1px;
}

.ring-wrap.is-idle .ring-text,
.ring-wrap.is-off .ring-text {
  color: #6f7c90;
}

/* 已经坐超时了，轻轻跳一下 —— 用余光就能注意到，又不至于烦人 */
@media (prefers-reduced-motion: no-preference) {
  .ring-wrap.is-over {
    animation: ring-pulse 1.9s ease-in-out infinite;
  }
}

@keyframes ring-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.7;
  }
}

/* ---------- 拖动条 / 展开按钮 ---------- */
.drag-strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 26px;
  -webkit-app-region: drag;
  z-index: 2;
}

.expand {
  position: absolute;
  top: 6px;
  right: 7px;
  z-index: 3;
  -webkit-app-region: no-drag;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid #323c4d;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.07);
  color: #cbd5e6;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.16s ease,
    background 0.16s ease;
}

.capsule:hover .expand {
  opacity: 1;
}

.expand:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}
</style>
