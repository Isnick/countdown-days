/**
 * src/utils/chime.ts —— 久坐提醒的提示音
 * 两个柔和的短音，不吵；系统不允许播放时静默失败。
 */

import { CHIME } from '@shared/constants'

let audioCtx: AudioContext | null = null

export function playChime(): void {
  try {
    audioCtx = audioCtx ?? new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()

    const t0 = audioCtx.currentTime
    CHIME.frequencies.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator()
      const gain = audioCtx!.createGain()
      const at = t0 + i * CHIME.noteGapSec

      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.linearRampToValueAtTime(CHIME.volume, at + CHIME.attackSec)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + CHIME.decaySec)

      osc.connect(gain).connect(audioCtx!.destination)
      osc.start(at)
      osc.stop(at + CHIME.noteGapSec)
    })
  } catch {
    /* 忽略：无音频设备或被自动播放策略拦截 */
  }
}
