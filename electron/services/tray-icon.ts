/**
 * electron/services/tray-icon.ts —— 运行时生成托盘图标
 * ------------------------------------------------------------------
 * 为什么不放一个 .ico 文件：打包配置里要多一份资源、还要区分多套尺寸，
 * 而图标本身就是一个「青色表盘」，用代码画出来更省事，也不用担心丢文件。
 * 做法是先在 4×4 的超采样网格上判断每个点落在哪个形状里，再把 16 个采样
 * 平均成 1 个像素（相当于 4× 抗锯齿），最后手写一段最小 PNG 编码输出 RGBA。
 */

import zlib from 'node:zlib'

/** 表盘几何按 32×32 设计，实际渲染时整体缩放 */
const DESIGN = 32
/** 每个像素的超采样倍数 */
const SS = 4

interface Sample {
  /** 0-255 */
  r: number
  g: number
  b: number
  a: number
}

/** 托盘图标的主色（和应用里的青色强调一致） */
const TEAL: Sample = { r: 94, g: 234, b: 212, a: 255 }
const CLEAR: Sample = { r: 0, g: 0, b: 0, a: 0 }

/** 点到线段的距离，用来画指针 */
function segmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (!len2) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/**
 * 一个采样点的颜色：外圈圆环 + 两根指针 + 中心小圆点，都是实色，
 * 这样在浅色和深色任务栏上都能看清轮廓。
 */
function sampleAt(x: number, y: number): Sample {
  const c = DESIGN / 2
  const d = Math.hypot(x - c, y - c)
  const hand = 0.95
  const isHand =
    segmentDistance(x, y, c, c, c, c - 7.4) <= hand || segmentDistance(x, y, c, c, c + 5.6, c) <= hand
  if (isHand) return TEAL
  if (d <= 2.1) return TEAL
  if (Math.abs(d - 11.4) <= 1.5) return TEAL
  return CLEAR
}

/** 按目标尺寸渲染出 RGBA 像素（size × size × 4） */
function renderRgba(size: number): Buffer {
  const out = Buffer.alloc(size * size * 4)
  const scale = size / DESIGN
  const samples = SS * SS

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let sumA = 0
      let sumR = 0
      let sumG = 0
      let sumB = 0

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) / scale
          const y = (py + (sy + 0.5) / SS) / scale
          const s = sampleAt(x, y)
          const a = s.a / 255
          sumA += a
          sumR += s.r * a
          sumG += s.g * a
          sumB += s.b * a
        }
      }

      const offset = (py * size + px) * 4
      if (sumA <= 0) continue
      // 先按透明度加权求平均再还原，避免边缘发黑
      out[offset] = Math.round(sumR / sumA)
      out[offset + 1] = Math.round(sumG / sumA)
      out[offset + 2] = Math.round(sumB / sumA)
      out[offset + 3] = Math.round((sumA / samples) * 255)
    }
  }

  return out
}

/* ---------------- 最小 PNG 编码（8 位 RGBA，无滤波） ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePng(size: number, rgba: Buffer): Buffer {
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0 // 滤波类型：None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // 颜色类型：真彩 + Alpha
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** 托盘图标：32×32 的青色表盘，返回 data URL（Tray 直接吃） */
export function trayIconDataUrl(size = 32): string {
  const png = encodePng(size, renderRgba(size))
  return `data:image/png;base64,${png.toString('base64')}`
}
