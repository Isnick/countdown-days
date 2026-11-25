/**
 * src/composables/useSettings.ts —— 设置的响应式镜像
 * 主进程是唯一事实来源；这里保存一份副本，改动先本地生效再防抖落盘，
 * 因此界面永远是「立刻响应」而不是等 IPC 往返。
 */

import { reactive, ref } from 'vue'
import { DEFAULTS, TIMING } from '@shared/constants'
import type { Settings } from '@shared/types'
import { bridge } from '@/api/bridge'

const settings = reactive<Settings>({
  ...DEFAULTS,
  workDays: [...DEFAULTS.workDays]
})
const ready = ref(false)

let pending: Partial<Settings> = {}
let saveTimer: ReturnType<typeof setTimeout> | null = null

function apply(next: Settings): void {
  Object.assign(settings, { ...next, workDays: [...next.workDays] })
}

/** 从主进程拉一次初始值 */
async function load(): Promise<void> {
  if (!bridge) return
  apply(await bridge.getSettings())
  ready.value = true
}

async function flush(): Promise<void> {
  if (!bridge) return
  const patch = pending
  pending = {}
  try {
    // 主进程会消毒（时间格式、工作日兜底等），以返回值回填界面
    apply(await bridge.saveSettings(patch))
  } catch (err) {
    console.error('[settings] 保存失败', err)
  }
}

/** 改设置：先本地生效，再合并防抖写盘 */
function save(patch: Partial<Settings>, immediate = false): void {
  Object.assign(settings, patch)
  Object.assign(pending, patch)

  if (saveTimer) clearTimeout(saveTimer)
  if (immediate) {
    void flush()
    return
  }
  saveTimer = setTimeout(() => {
    void flush()
  }, TIMING.settingsSaveDebounceMs)
}

/** 切换工作日芯片：至少保留一天，否则倒计时无解 */
function toggleWorkday(day: number): void {
  const set = new Set(settings.workDays)
  if (set.has(day)) set.delete(day)
  else set.add(day)
  if (!set.size) return
  save({ workDays: [...set].sort((a, b) => a - b) })
}

/** 主进程恢复默认设置后把结果推回来 */
function applyRemote(next: Settings): void {
  pending = {}
  apply(next)
}

export function useSettings() {
  return { settings, ready, load, save, toggleWorkday, applyRemote }
}
