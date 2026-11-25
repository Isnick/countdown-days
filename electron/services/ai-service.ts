/**
 * electron/services/ai-service.ts —— 模型调用（OpenAI 兼容协议）
 * ------------------------------------------------------------------
 * 三件事：拼提示词、发 /chat/completions、把结果校验成结构化解读。
 *
 * 网络层用 Electron 的 net.fetch，不是 Node 的全局 fetch：
 *   主进程里的 fetch 走 Node 的网络栈，**不读系统代理 / PAC**；
 *   而 net.fetch 和渲染进程共用 Chromium 的网络栈，公司代理、Clash 这类
 *   靠系统代理才能出网的环境才不会「GitHub 能抓、模型连不上」。
 *
 * 兼容性上的现实处理：
 *   · 地址填到 /v1 也行、直接填 .../chat/completions 也行
 *   · 有的服务不认 response_format / max_tokens，400 时去掉再试一次
 *   · 有的模型会带 ```json 代码块，解析前先剥掉
 *   · 分批请求，每批结束回调一次进度（界面上的进度条靠它）
 *   · 一批失败不影响其它批：返回已成功的部分 + 一条错误信息
 */

import { net } from 'electron'
import { TRENDING } from '../../shared/constants'
import type { AiTestResult, TrendingInsight, TrendingRepo } from '../../shared/types'

export interface AiConfig {
  baseUrl: string
  model: string
  apiKey: string
}

export interface AnalyzeResult {
  insights: TrendingInsight[]
  /** 有失败时给页面看的一句话；全成功则为空 */
  error: string
}

/** 每处理完一批回调一次：已处理条数 / 总条数 */
export type AiProgress = (done: number, total: number) => void

/**
 * 每读懂一批就回调这一批的结果。
 * 调用方在这里落盘 + 推送给界面，列表项才能一条条从「解读中」变成「已解读」，
 * 而不是等整轮跑完才一起出现。
 */
export type AiBatchDone = (insights: TrendingInsight[]) => void | Promise<void>

const SYSTEM_PROMPT = [
  '你是给中文开发者写项目推荐的技术编辑。读者是有基础的工程师，但没时间读 README。',
  '说话像同事聊天：短句、具体、不用「赋能」「优雅」「强大」这类空话。',
  '不确定的事实不要编，尤其是命令、配置项、功能边界。',
  '只输出 JSON，不要 Markdown 代码块，不要任何解释性文字。'
].join('\n')

export function aiReady(cfg: AiConfig): boolean {
  return Boolean(cfg.apiKey.trim() && cfg.baseUrl.trim() && cfg.model.trim())
}

/** 没就绪时告诉用户到底缺哪一项，别只显示一句「未配置」 */
export function aiMissingReason(cfg: AiConfig): string {
  if (!cfg.baseUrl.trim()) return '还没填模型接口地址'
  if (!cfg.model.trim()) return '还没填模型名'
  if (!cfg.apiKey.trim()) return '还没填 API Key'
  return ''
}

/** 允许用户把地址填到 /v1，也允许直接填完整的 /chat/completions */
function endpointOf(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (/\/chat\/completions$/i.test(base)) return base
  return `${base}/chat/completions`
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}

class AiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string
      /** 推理模型（kimi / o 系列）会先把思考过程放这儿 */
      reasoning_content?: string
    }
    finish_reason?: string
  }>
}

async function postChat(
  cfg: AiConfig,
  messages: ChatMessage[],
  body: Record<string, unknown>,
  timeoutMs: number,
  /** 测试连接时不苛求正文：推理模型可能先返回思考过程 */
  strict = true
): Promise<string> {
  const endpoint = endpointOf(cfg.baseUrl)

  let response: Response
  try {
    // net.fetch：走 Chromium 网络栈，跟随系统代理
    response = await net.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`
      },
      body: JSON.stringify({ model: cfg.model.trim(), messages, ...body }),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (err) {
    const name = (err as Error).name
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new AiError(`等了 ${Math.round(timeoutMs / 1000)} 秒没有响应，模型服务可能太慢或网络不通`, 0)
    }
    throw new AiError(`连不上 ${hostOf(endpoint)}：${(err as Error).message}`, 0)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const text = await response.text()
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } }
        detail = parsed.error?.message ?? text.slice(0, 200)
      } catch {
        detail = text.slice(0, 200)
      }
    } catch {
      detail = ''
    }

    const friendly =
      response.status === 401
        ? 'API Key 无效，或这个服务不认这种 Key'
        : response.status === 403
          ? '这个 Key 没有调用权限'
          : response.status === 404
            ? '接口地址不对：确认填的是 .../v1 这种形式'
            : response.status === 429
              ? '模型服务限流或额度用尽'
              : response.status >= 500
                ? '模型服务暂时不可用'
                : `模型返回 ${response.status}`
    throw new AiError(detail ? `${friendly}（${detail}）` : friendly, response.status)
  }

  const data = (await response.json()) as ChatResponse
  const choice = data.choices?.[0]
  const content = (choice?.message?.content ?? '').trim()
  if (content) return content

  /*
   * 推理模型的两种脾气：
   *   · 答案有时候只落在 reasoning_content 里
   *   · 思考过程把输出预算吃光，content 是空的、finish_reason=length
   * 前者还能把 JSON 从思考里抠出来，后者只能让用户知道「不是配置错了，是模型话太多」。
   */
  const reasoning = (choice?.message?.reasoning_content ?? '').trim()
  if (!strict) return reasoning || '(空)'
  if (reasoning.includes('{')) return reasoning
  if (choice?.finish_reason === 'length') {
    throw new AiError('模型把输出额度都用在思考上了，没给出结果；换个小一点的批量或模型试试', 0)
  }
  throw new AiError('模型返回了空内容，换个模型名试试', 0)
}

/** 从可能带代码块 / 前后废话的文本里把 JSON 抠出来 */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.search(/[[{]/)
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (start < 0 || end <= start) throw new Error('返回内容不是 JSON')
    return JSON.parse(cleaned.slice(start, end + 1))
  }
}

function cut(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function toInsight(raw: unknown, repo: TrendingRepo, cfg: AiConfig, at: number): TrendingInsight | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>

  const intro = cut(item.intro, 64)
  const detail = cut(item.detail, 420)
  // 一句话介绍和详细介绍至少要有一个，否则这条解读没意义
  if (!intro && !detail) return null

  const score = Math.round(Number(item.score))
  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag) => cut(tag, 12)).filter(Boolean).slice(0, 4)
    : []
  const howto = Array.isArray(item.howto)
    ? item.howto.map((step) => cut(step, 70)).filter(Boolean).slice(0, 4)
    : []

  return {
    repoKey: repo.fullName,
    intro: intro || detail,
    why: cut(item.why, 90),
    forWho: cut(item.forWho, 36),
    detail: detail || intro,
    howto,
    tags,
    score: Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 60,
    model: cfg.model.trim(),
    promptVersion: TRENDING.promptVersion,
    at
  }
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function buildUserPrompt(repos: TrendingRepo[]): string {
  const brief = repos.map((repo) => ({
    fullName: repo.fullName,
    description: cut(repo.description, TRENDING.maxDescriptionChars),
    language: repo.language,
    stars: repo.stars,
    topics: repo.topics.slice(0, 6),
    createdAt: repo.createdAt
  }))

  return [
    '下面是 GitHub 上最近新建、star 涨得快的项目。逐个用大白话写一份介绍。',
    '',
    '要求：',
    'intro：一句话说清它是干嘛的，≤40 字。写给完全没听过的人看，不要术语堆砌。',
    'detail：80-150 字大白话。它解决什么问题、大致怎么做、和同类比特别在哪。不要复述 intro。',
    'howto：2-4 步怎么开始用。只写能从描述 / 语言 / 常见做法安全推断的步骤；',
    '       拿不准具体命令就写「按 README 的 Quick Start 跑一遍」，不要编造命令或参数。',
    'why：为什么最近火，≤40 字。',
    'forWho：最适合谁用，≤20 字。',
    'tags：2-3 个中文技术标签。',
    'score：0-100 的「值得看」评分，按新颖度 × 实用性打分，不要都给高分。',
    '',
    '输出格式：',
    '{"items":[{"fullName":"owner/name","intro":"…","detail":"…","howto":["…","…"],"why":"…","forWho":"…","tags":["…"],"score":78}]}',
    '',
    `项目列表：${JSON.stringify(brief)}`
  ].join('\n')
}

/**
 * 批量解读。任何一批失败都只跳过这一批，已成功的照常返回。
 */
export async function analyzeRepos(
  repos: TrendingRepo[],
  cfg: AiConfig,
  onProgress?: AiProgress,
  onBatch?: AiBatchDone
): Promise<AnalyzeResult> {
  if (!aiReady(cfg) || !repos.length) return { insights: [], error: '' }

  const total = repos.length
  const insights: TrendingInsight[] = []
  let error = ''
  let processed = 0

  for (const batch of chunk(repos, TRENDING.aiBatch)) {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(batch) }
    ]

    let content = ''
    try {
      /*
       * 刻意不传 temperature：部分模型（kimi-for-coding 等）只接受 1，
       * 传别的直接 400。也不传 max_tokens：推理模型会先把预算花在思考上，
       * 卡太小反而拿不到正文。输出长度靠提示词约束就够了。
       */
      content = await postChat(
        cfg,
        messages,
        { response_format: { type: 'json_object' } },
        TRENDING.aiTimeoutMs
      )
    } catch (err) {
      const failure = err as AiError
      if (failure.status === 400) {
        // 不认 response_format 的服务：退回最朴素的一次请求
        try {
          content = await postChat(cfg, messages, {}, TRENDING.aiTimeoutMs)
        } catch (retryErr) {
          error = (retryErr as Error).message
          processed += batch.length
          onProgress?.(processed, total)
          continue
        }
      } else {
        // 认证 / 网络这类错误后面每批都一样，没必要继续烧请求
        error = failure.message
        processed += batch.length
        onProgress?.(processed, total)
        break
      }
    }

    try {
      const parsed = extractJson(content) as { items?: unknown[] }
      const list = Array.isArray(parsed) ? parsed : (parsed.items ?? [])
      const byName = new Map(batch.map((repo) => [repo.fullName.toLowerCase(), repo]))
      const at = Date.now()

      const fresh: TrendingInsight[] = []
      for (const raw of list) {
        const key = String((raw as Record<string, unknown>)?.fullName ?? '').toLowerCase()
        const repo = byName.get(key)
        if (!repo) continue
        const insight = toInsight(raw, repo, cfg, at)
        if (insight) fresh.push(insight)
      }

      if (fresh.length) {
        insights.push(...fresh)
        // 这一批立刻交出去：界面可以马上把这几条标成「已解读」
        await onBatch?.(fresh)
      }
    } catch {
      error = '模型返回的不是合法 JSON，这一批跳过了'
    }

    processed += batch.length
    onProgress?.(processed, total)
  }

  return { insights, error }
}

/**
 * 设置页的「测试连接」：发一个最小请求，验证地址 / Key / 模型名三件事。
 */
export async function testAi(cfg: AiConfig): Promise<AiTestResult> {
  const missing = aiMissingReason(cfg)
  if (missing) return { ok: false, message: missing }

  const started = Date.now()
  try {
    // strict=false：推理模型可能只回思考过程，能拿到 200 就说明地址 / Key / 模型都对
    await postChat(cfg, [{ role: 'user', content: '回复 ok' }], { max_tokens: 64 }, 25_000, false)
    return {
      ok: true,
      message: `连接正常，${cfg.model.trim()} 已响应`,
      latencyMs: Date.now() - started
    }
  } catch (err) {
    return { ok: false, message: (err as Error).message, latencyMs: Date.now() - started }
  }
}
