<script setup lang="ts">
/**
 * 久坐水位球：会浮动、会晃、液面有波纹。
 * 水位高度 = 久坐进度，中间显示百分比和「已坐 N 分钟」。
 */
defineProps<{
  pctText: string
  liquidHeight: number
  caption: string
  isPaused: boolean
  isOff: boolean
  isOver: boolean
}>()

/** 液面波形（单位坐标系 100×20，横向平铺两段实现无缝滚动） */
const WAVE_PATH = 'M0 10 C 6 3.5, 19 3.5, 25 10 C 31 16.5, 44 16.5, 50 10 C 56 3.5, 69 3.5, 75 10 C 81 16.5, 94 16.5, 100 10 L100 20 L0 20 Z'
const WAVE_TRACKS = ['wave-a', 'wave-b'] as const
</script>

<template>
  <div class="orb-wrap" :class="{ 'is-paused': isPaused, 'is-off': isOff, 'is-over': isOver }">
    <div class="orb-glow"></div>

    <div class="orb">
      <div class="orb-liquid" :style="{ height: `${liquidHeight}%` }">
        <div class="orb-fill"></div>
        <div v-for="track in WAVE_TRACKS" :key="track" class="orb-wave-track" :class="track">
          <svg
            v-for="n in 2"
            :key="n"
            class="orb-wave"
            viewBox="0 0 100 20"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path :d="WAVE_PATH" />
          </svg>
        </div>
      </div>
    </div>

    <div class="orb-center">
      <b>{{ pctText }}<i>%</i></b>
      <span>{{ caption }}</span>
    </div>
  </div>
</template>

<style scoped>
.orb-wrap {
  --liq: 245, 194, 107;
  --liq-a: #e4b96f;
  --liq-b: #b3813c;
  position: relative;
  width: clamp(84px, 11.4vh, 116px);
  height: clamp(84px, 11.4vh, 116px);
  flex: none;
  animation: orb-float 4.6s ease-in-out infinite;
}

.orb-glow {
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 62%, rgba(var(--liq), 0.3), transparent 70%);
  /* 不再叠 filter: blur()：径向渐变本身已经够柔和，
     少一层离屏滤镜就少一次每帧重绘的成本（长时间运行更明显） */
  animation: orb-breathe 3.2s ease-in-out infinite;
  pointer-events: none;
}

.orb {
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid rgba(var(--liq), 0.32);
  background:
    radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.1), transparent 58%),
    #0e1219;
  box-shadow:
    inset 0 0 26px rgba(0, 0, 0, 0.6),
    0 8px 20px rgba(0, 0, 0, 0.35);
  animation: orb-wobble 5.6s ease-in-out infinite;
  transform-origin: 50% 55%;
}

.orb-liquid {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0%;
  transition: height 1s cubic-bezier(0.3, 0.8, 0.3, 1);
  will-change: height;
}

/* 液面：实色，避免「平线 + 波纹」两层边缘互相打架 */
.orb-fill {
  position: absolute;
  inset: 4px 0 0 0;
  background: linear-gradient(180deg, var(--liq-a), var(--liq-b));
}

/* 球底的内部反光，让液体看起来有点体积感 */
.orb-fill::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -34px;
  width: 150%;
  height: 90px;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(255, 216, 148, 0.38), transparent 68%);
  pointer-events: none;
}

.orb-wave-track {
  position: absolute;
  top: -9px;
  left: 0;
  width: 200%;
  height: 16px;
  display: flex;
  animation: orb-wave-slide 4.6s linear infinite;
}

.orb-wave {
  width: 50%;
  height: 100%;
  display: block;
  fill: var(--liq-a);
}

.wave-a {
  z-index: 2;
}

.wave-a .orb-wave {
  stroke: rgba(255, 238, 200, 0.5);
  stroke-width: 0.8;
  vector-effect: non-scaling-stroke;
}

.wave-b {
  top: -13px;
  z-index: 1;
  animation-duration: 7.2s;
  animation-direction: reverse;
  opacity: 0.8;
}

.wave-b .orb-wave {
  fill: color-mix(in srgb, var(--liq-a) 74%, #fff);
}

.orb-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  pointer-events: none;
  text-shadow:
    0 1px 4px rgba(0, 0, 0, 0.9),
    0 0 12px rgba(0, 0, 0, 0.55);
}

.orb-center::before {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(7, 10, 15, 0.48) 0%, rgba(7, 10, 15, 0.22) 54%, transparent 76%);
}

.orb-center b {
  position: relative;
  font-family: var(--mono);
  font-size: clamp(17px, 2.2vh, 23px);
  font-weight: 700;
  letter-spacing: -0.2px;
  color: #fffaf0;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  animation: pct-bob 3.4s ease-in-out infinite;
}

.orb-center b i {
  font-style: normal;
  font-size: 11px;
  margin-left: 1px;
  opacity: 0.8;
}

.orb-center > span {
  position: relative;
  font-size: 10px;
  letter-spacing: 0.3px;
  color: #fbeed6;
  opacity: 0.95;
}

/* 状态修饰 */
.orb-wrap.is-paused,
.orb-wrap.is-paused .orb,
.orb-wrap.is-paused .orb-wave-track,
.orb-wrap.is-paused .orb-glow {
  animation-play-state: paused;
}

.orb-wrap.is-paused {
  opacity: 0.55;
}

.orb-wrap.is-off {
  --liq: 118, 128, 146;
  --liq-a: #7c8598;
  --liq-b: #4a5263;
}

.orb-wrap.is-over {
  --liq: 248, 113, 113;
  --liq-a: #e2706a;
  --liq-b: #9e3f3c;
  animation-duration: 2.8s;
}

.orb-wrap.is-over .orb {
  animation-duration: 2.4s;
}

.orb-wrap.is-over .orb-glow {
  animation-duration: 1.5s;
}

.orb-wrap.is-over .orb-center b {
  color: #fff0f0;
  text-shadow:
    0 0 14px rgba(248, 113, 113, 0.8),
    0 1px 4px rgba(0, 0, 0, 0.9);
}

@keyframes pct-bob {
  0%,
  100% {
    transform: translateY(1px);
  }
  50% {
    transform: translateY(-2px);
  }
}

@keyframes orb-float {
  0%,
  100% {
    transform: translateY(1px);
  }
  50% {
    transform: translateY(-5px);
  }
}

@keyframes orb-wobble {
  0%,
  100% {
    transform: rotate(-2.4deg) scale(1, 1);
  }
  25% {
    transform: rotate(1.2deg) scale(1.012, 0.99);
  }
  50% {
    transform: rotate(2.2deg) scale(1.005, 1.005);
  }
  75% {
    transform: rotate(-1.4deg) scale(0.99, 1.012);
  }
}

@keyframes orb-breathe {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

@keyframes orb-wave-slide {
  to {
    transform: translateX(-50%);
  }
}
</style>
