/**
 * electron/services/secrets-store.ts —— 密钥单独存，且加密
 * ------------------------------------------------------------------
 * 为什么不放 settings.json：
 *   设置文件是明文的、会被「关于」对话框指出路径、也会被用户随手备份到网盘。
 *   API Key / GitHub Token 放进去等于泄题。这里单独一个 secrets.json，
 *   Windows 上走 Electron 的 safeStorage（底层是 DPAPI，绑当前用户），
 *   拿到的密文换台机器 / 换个账户都解不开。
 *
 * 两点妥协，写清楚免得以后误解：
 *   1. safeStorage 在个别 Linux 桌面没有可用的 keyring，这时退回 base64 明文
 *      （文件里带 plain: 前缀）。SecretStatus.encrypted 会如实告诉界面，
 *      设置页据此显示一行提醒。
 *   2. 明文只存在主进程内存里。渲染进程拿到的永远是「有没有 + 掩码」，
 *      所以 devtools 里翻 window.api 也拿不到 Key。
 */

import { app, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { SecretField, SecretStatus } from '../../shared/types'

interface SecretFile {
  /** enc:xxx —— safeStorage 密文；plain:xxx —— base64；空字符串等于没设 */
  aiApiKey?: string
  githubToken?: string
}

const FIELDS: SecretField[] = ['aiApiKey', 'githubToken']

let stored: SecretFile = {}
/** 解密后的明文，只在主进程内存里 */
let plain: Partial<Record<SecretField, string>> = {}
let cachedFile = ''
/** 系统加密是否可用。Electron 45 起这个判断是异步的，启动时算一次缓存下来 */
let encryptionAvailable = false

function secretFile(): string {
  if (!cachedFile) cachedFile = path.join(app.getPath('userData'), 'secrets.json')
  return cachedFile
}

async function refreshEncryption(): Promise<void> {
  try {
    encryptionAvailable = await safeStorage.isAsyncEncryptionAvailable()
  } catch {
    encryptionAvailable = false
  }
}

async function encode(value: string): Promise<string> {
  if (!value) return ''
  if (encryptionAvailable) {
    try {
      const buffer = await safeStorage.encryptStringAsync(value)
      return `enc:${buffer.toString('base64')}`
    } catch (err) {
      console.warn('[secrets] 加密失败，退回明文存储：', (err as Error).message)
    }
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`
}

async function decode(value: string | undefined): Promise<string> {
  if (!value) return ''
  if (value.startsWith('enc:')) {
    try {
      // 系统密钥轮换时会要求再解一次（shouldReEncrypt），这里按提示重试一遍
      let out = await safeStorage.decryptStringAsync(Buffer.from(value.slice(4), 'base64'))
      if (out.shouldReEncrypt) {
        out = await safeStorage.decryptStringAsync(Buffer.from(value.slice(4), 'base64'))
      }
      return out.result
    } catch {
      // 换了系统账户 / 重装系统后 DPAPI 解不开，等同于没配，让用户重填
      console.warn('[secrets] 解密失败，已按未配置处理')
      return ''
    }
  }
  if (value.startsWith('plain:')) {
    return Buffer.from(value.slice(6), 'base64').toString('utf8')
  }
  return ''
}

/** 掩码：sk-xxxx…abcd。太短就全遮掉，别反而泄漏 */
function mask(value: string): string {
  if (!value) return ''
  if (value.length <= 10) return '••••••'
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

async function persist(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(secretFile()), { recursive: true })
    const tmp = `${secretFile()}.tmp`
    await fs.writeFile(tmp, JSON.stringify(stored, null, 2), 'utf8')
    await fs.rename(tmp, secretFile())
  } catch (err) {
    console.error('[secrets] 写入失败：', (err as Error).message)
  }
}

/** 启动时读一次。文件不存在 / 损坏都按「没配」处理，不打扰用户 */
export async function loadSecrets(): Promise<void> {
  await refreshEncryption()
  try {
    const raw = await fs.readFile(secretFile(), 'utf8')
    stored = JSON.parse(raw) as SecretFile
  } catch {
    stored = {}
  }
  plain = {}
  for (const field of FIELDS) plain[field] = await decode(stored[field])
}

/** 主进程内部取明文（调用 AI / GitHub 时用） */
export function getSecret(field: SecretField): string {
  return plain[field] ?? ''
}

/** 给页面的状态：只回掩码，不回明文 */
export function secretStatus(): SecretStatus {
  return {
    aiApiKey: Boolean(getSecret('aiApiKey')),
    githubToken: Boolean(getSecret('githubToken')),
    aiKeyHint: mask(getSecret('aiApiKey')),
    ghTokenHint: mask(getSecret('githubToken')),
    encrypted: encryptionAvailable
  }
}

/**
 * 保存密钥。值为 undefined 表示不动这一项，空字符串表示清除。
 * 返回保存后的状态，界面拿它刷新掩码。
 */
export async function saveSecrets(patch: Partial<Record<SecretField, string>>): Promise<SecretStatus> {
  for (const field of FIELDS) {
    const next = patch[field]
    if (next === undefined) continue
    const value = String(next).trim()
    plain[field] = value
    stored[field] = value ? await encode(value) : ''
  }
  await persist()
  return secretStatus()
}
