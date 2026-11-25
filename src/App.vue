<script setup lang="ts">
/**
 * App.vue —— 页面骨架 + 全局数据装配
 * 这里只做三件事：拉起初始数据、把主进程的推送接到对应 store、拼布局。
 * 具体的计算在 composables/，视觉在 components/。
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { COPY } from '@shared/constants'
import type { AppMeta } from '@shared/types'
import { bridge, hasBridge } from '@/api/bridge'
import { useClock } from '@/composables/useClock'
import { useSettings } from '@/composables/useSettings'
import { useSit } from '@/composables/useSit'
import { useTodayLine } from '@/composables/useTodayLine'
import { useStageFit } from '@/composables/useStageFit'
import { playChime } from '@/utils/chime'
import AppTitleBar from '@/components/layout/AppTitleBar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import WorkCountdownCard from '@/components/work/WorkCountdownCard.vue'
import LifeCard from '@/components/life/LifeCard.vue'
import HolidaySection from '@/components/holiday/HolidaySection.vue'
import SitCard from '@/components/sit/SitCard.vue'
import ProgressCard from '@/components/progress/ProgressCard.vue'
import SitAlertToasts from '@/components/sit/SitAlertToasts.vue'
import SettingsDialog from '@/components/settings/SettingsDialog.vue'
import CalendarDialog from '@/components/calendar/CalendarDialog.vue'
import TrendingDialog from '@/components/trending/TrendingDialog.vue'

const now = useClock()
const { settings, load: loadSettings, applyRemote } = useSettings()
const { load: loadSit, apply: applySit } = useSit()

const meta = ref<AppMeta | null>(null)
const settingsOpen = ref(false)
const calendarOpen = ref(false)
const trendingOpen = ref(false)
const toastRef = ref<InstanceType<typeof SitAlertToasts> | null>(null)

const stageRef = ref<HTMLElement | null>(null)
const appRef = ref<HTMLElement | null>(null)
const { fit } = useStageFit(stageRef, appRef)

const todayLine = useTodayLine(now)

const unsubscribers: Array<() => void> = []

/**
 * 窗口不可见（最小化 / 收进托盘 / 被完全遮挡）时给根节点挂一个标记，
 * CSS 里据此暂停水位球、光晕这类无限动画 —— 它们每秒都要重新合成一层，
 * 长时间开着不动也会一点点吃掉内存和显存。
 */
function syncIdle(): void {
  document.documentElement.classList.toggle('app-idle', document.hidden)
}

onMounted(async () => {
  const api = bridge
  if (!api) return

  document.addEventListener('visibilitychange', syncIdle)
  unsubscribers.push(() => document.removeEventListener('visibilitychange', syncIdle))

  await loadSettings()
  await loadSit()
  meta.value = await api.appMeta()

  // 内容高度依赖设置（工作日 / 假期表），数据到位后重新量一次
  await nextTick()
  fit()

  unsubscribers.push(
    // 主进程推来的久坐状态（跨天清零 / 间隔调整 / 暂停恢复）
    api.onSitState(applySit),
    api.onSitAlert(({ minutes }) => {
      playChime()
      toastRef.value?.push(minutes)
    }),
    // 「恢复默认设置」后主进程也会广播一次
    api.onSettingsChanged(({ settings: next, sit }) => {
      applyRemote(next)
      applySit(sit)
    })
  )
})

onUnmounted(() => {
  unsubscribers.forEach((off) => off())
})

function openSettings(): void {
  settingsOpen.value = true
}

function openCalendar(): void {
  calendarOpen.value = true
}

/** 收起成迷你胶囊：主进程负责缩小窗口并开胶囊窗 */
async function openMini(): Promise<void> {
  await bridge?.toggleMini()
}

/** 从趋势面板跳去设置：先收起面板，别让两个弹层叠在一起 */
function openSettingsFromTrending(): void {
  trendingOpen.value = false
  settingsOpen.value = true
}

/** 设置里点「打开技术雷达」：反过来走一遍 */
function openTrendingFromSettings(): void {
  settingsOpen.value = false
  trendingOpen.value = true
}
</script>

<template>
  <div v-if="!hasBridge()" class="bridge-error">
    <h2>{{ COPY.preloadError.title }}</h2>
    <p>{{ COPY.preloadError.body }}</p>
  </div>

  <el-config-provider v-else :locale="zhCn" size="small">
    <AppTitleBar
      :today="todayLine"
      @open-settings="openSettings"
      @open-calendar="openCalendar"
      @open-mini="openMini"
      @open-trending="trendingOpen = true"
    />

    <div ref="stageRef" class="stage">
      <main ref="appRef" class="app">
        <section class="hero">
          <WorkCountdownCard :now="now" :settings="settings" />
          <LifeCard :now="now" :settings="settings" />
        </section>

        <HolidaySection :now="now" />

        <section class="bottom">
          <SitCard :now="now" />
          <ProgressCard :now="now" />
        </section>

        <AppFooter :settings-file="meta?.settingsFile" />
      </main>
    </div>

    <SitAlertToasts ref="toastRef" />
    <CalendarDialog v-model="calendarOpen" :now="now" />
    <TrendingDialog v-model="trendingOpen" @open-settings="openSettingsFromTrending" />
    <SettingsDialog
      v-model="settingsOpen"
      :meta="meta"
      @open-trending="openTrendingFromSettings"
    />
  </el-config-provider>
</template>
