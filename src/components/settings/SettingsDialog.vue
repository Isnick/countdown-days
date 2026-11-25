<script setup lang="ts">
/**
 * 设置弹层
 * 上下班时间 / 出生日期 / 久坐提醒的三个开关、关闭窗口的行为、运行内存都在这里。
 * 主页卡片上的输入框改的是同一份数据，两边永远同步。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { APP, CLOSE_ACTION_OPTIONS, PATTERNS, TRENDING } from '@shared/constants'
import type {
  AiTestResult,
  AppMeta,
  CloseAction,
  MemoryStats,
  SecretField,
  SecretStatus,
  Settings
} from '@shared/types'
import { MS_PER_DAY, pad2, parseDate } from '@shared/date'
import { bridge } from '@/api/bridge'
import { useSettings } from '@/composables/useSettings'
import { useSit } from '@/composables/useSit'
import { thousands } from '@/utils/format'
import WorkdayChips from '../common/WorkdayChips.vue'

const props = defineProps<{ modelValue: boolean; meta: AppMeta | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; 'open-trending': [] }>()

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const { settings, save, toggleWorkday, applyRemote } = useSettings()
const { apply: applySit } = useSit()

const workStart = computed<string>({
  get: () => settings.workStart,
  set: (value) => {
    if (value && PATTERNS.time.test(value)) save({ workStart: value }, true)
  }
})

const workEnd = computed<string>({
  get: () => settings.workEnd,
  set: (value) => {
    if (value && PATTERNS.time.test(value)) save({ workEnd: value }, true)
  }
})

const birthday = computed<string>({
  get: () => settings.birthday,
  set: (value) => save({ birthday: typeof value === 'string' ? value : '' }, true)
})

const disableFuture = (date: Date): boolean => date.getTime() > Date.now()

const daysLived = computed<number | null>(() => {
  if (!PATTERNS.date.test(settings.birthday)) return null
  const birth = parseDate(settings.birthday)
  if (birth > new Date()) return null
  return Math.floor((Date.now() - birth.getTime()) / MS_PER_DAY)
})

const sitEnabled = computed<boolean>({
  get: () => settings.sitEnabled,
  set: (value) => save({ sitEnabled: value }, true)
})

const sitNotify = computed<boolean>({
  get: () => settings.sitNotify,
  set: (value) => save({ sitNotify: value }, true)
})

const sitWorkHoursOnly = computed<boolean>({
  get: () => settings.sitWorkHoursOnly,
  set: (value) => save({ sitWorkHoursOnly: value }, true)
})

/* ---------------- 关闭窗口的行为 ---------------- */
const closeAction = computed<CloseAction>({
  get: () => settings.closeAction,
  set: (value) => save({ closeAction: value }, true)
})

const closeActionHint = computed(
  () => CLOSE_ACTION_OPTIONS.find((option) => option.value === settings.closeAction)?.hint ?? ''
)

/** 演示用：立刻把窗口收进托盘，不必真的点关闭按钮 */
function hideNow(): void {
  void bridge?.appAction('hide')
}

/* ---------------- 省内存模式 ---------------- */
const lowMemoryMode = computed<boolean>({
  get: () => settings.lowMemoryMode,
  set: (value) => save({ lowMemoryMode: value }, true)
})

/** 这个开关在启动时就定死了，改完得重启一次 */
async function restartApp(): Promise<void> {
  await bridge?.appAction('relaunch')
}

/** 收起成胶囊：先关掉弹层，否则展开回来时它还开着，像没离开过 */
async function toMini(): Promise<void> {
  open.value = false
  await bridge?.toggleMini()
}

/* ---------------- 技术雷达 ---------------- */
const POLL_OPTIONS = [1, 3, 6, 12]
/** 模板里直接引 TRENDING 会被类型推导当成 ref，取出来存成普通字符串更省事 */
const aiModelHint = TRENDING.defaultModel
const appTitle = APP.title

const trendingEnabled = computed<boolean>({
  get: () => settings.trendingEnabled,
  set: (value) => save({ trendingEnabled: value }, true)
})

const pollHours = computed<number>({
  get: () => settings.trendingPollHours,
  set: (value) => save({ trendingPollHours: value }, true)
})

/**
 * 地址 / 模型名 / 密钥用本地草稿 + 失焦提交。
 * 边打字边落盘会被消毒逻辑打回默认值（`https://api.` 还不是合法 URL），
 * 光标会莫名其妙跳走，所以这三项不在每次按键时写设置。
 */
const baseUrl = ref(settings.aiBaseUrl)
const modelName = ref(settings.aiModel)
const keyInput = ref('')
const tokenInput = ref('')
const secrets = ref<SecretStatus | null>(null)
const testingAi = ref(false)
const savedAt = ref(0)
const testResult = ref<AiTestResult | null>(null)

/** 「已保存 16:20」——落盘成功要有明确痕迹，不能只靠一闪而过的 toast */
const savedText = computed(() => {
  if (!savedAt.value) return ''
  const d = new Date(savedAt.value)
  return `已保存 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
})

/**
 * 状态卡：就绪 / 缺什么 / 连不上，一眼能看出来。
 * 测试结果也并进这张卡，避免「上方绿色已就绪、下方红色连接失败」自相矛盾。
 */
const aiStatus = computed(() => {
  const hint = secrets.value?.aiKeyHint ?? ''
  if (!settings.aiBaseUrl) {
    return { tone: 'warn', title: 'AI 未就绪', detail: '还差模型接口地址' }
  }
  if (!settings.aiModel) {
    return { tone: 'warn', title: 'AI 未就绪', detail: '还差模型名' }
  }
  if (!secrets.value?.aiApiKey) {
    return { tone: 'warn', title: 'AI 未就绪', detail: '还差 API Key，保存后才会生成一句话介绍' }
  }

  const test = testResult.value
  if (test && !test.ok) {
    return { tone: 'bad', title: '配置完整，但连不上模型', detail: test.message }
  }
  if (test?.ok) {
    return {
      tone: 'ok',
      title: 'AI 已就绪',
      detail: `连接正常 ${test.latencyMs ?? 0} ms · 模型 ${settings.aiModel}`
    }
  }
  return {
    tone: 'ok',
    title: 'AI 已就绪',
    detail: `模型 ${settings.aiModel} · Key ${hint} · 抓取后自动生成解读`
  }
})

async function refreshSecrets(): Promise<void> {
  secrets.value = (await bridge?.getSecrets()) ?? null
}

async function commitAiConfig(): Promise<boolean> {
  if (!bridge) return false
  let changed = false

  const url = baseUrl.value.trim().replace(/\/+$/, '')
  const model = modelName.value.trim()
  const patch: Partial<Settings> = {}

  if (url && !PATTERNS.url.test(url)) {
    ElMessage.warning('接口地址要以 http(s):// 开头')
    baseUrl.value = settings.aiBaseUrl
  } else if (url && url !== settings.aiBaseUrl) {
    patch.aiBaseUrl = url
  }

  if (model && !/^[\w.:/\-]{1,80}$/.test(model)) {
    ElMessage.warning('模型名只能包含字母、数字和 . : / -')
    modelName.value = settings.aiModel
  } else if (model && model !== settings.aiModel) {
    patch.aiModel = model
  }

  if (Object.keys(patch).length) {
    // 直接 await 落盘，避免「测试连接」抢在保存之前读到旧配置
    applyRemote(await bridge.saveSettings(patch))
    changed = true
  }

  const key = keyInput.value.trim()
  if (key) {
    secrets.value = await bridge.saveSecrets({ aiApiKey: key })
    keyInput.value = ''
    changed = true
  }

  const token = tokenInput.value.trim()
  if (token) {
    secrets.value = await bridge.saveSecrets({ githubToken: token })
    tokenInput.value = ''
    changed = true
  }

  if (changed) {
    savedAt.value = Date.now()
    // 配置变了，上一次的测试结论就不作数了
    testResult.value = null
  }
  return changed
}

/** 「保存配置」按钮：明确告诉用户存没存 */
async function saveAiConfig(): Promise<void> {
  const changed = await commitAiConfig()
  if (changed) ElMessage.success('配置已保存')
  else ElMessage.info('没有改动')
}

async function clearSecret(field: SecretField): Promise<void> {
  if (!bridge) return
  secrets.value = await bridge.saveSecrets({ [field]: '' })
  testResult.value = null
  savedAt.value = Date.now()
  ElMessage.success(field === 'aiApiKey' ? 'API Key 已清除' : 'GitHub Token 已清除')
}

async function testAi(): Promise<void> {
  if (!bridge) return
  await commitAiConfig()
  testingAi.value = true
  testResult.value = null
  try {
    // 结论同时留在界面上（不只是 toast），关掉弹窗再打开才需要重测
    testResult.value = await bridge.testAi()
  } finally {
    testingAi.value = false
  }
}

function openTrending(): void {
  open.value = false
  emit('open-trending')
}

/* ---------------- 运行内存 ---------------- */
const memory = ref<MemoryStats | null>(null)
let memoryTimer: number | null = null

async function refreshMemory(): Promise<void> {
  memory.value = (await bridge?.memoryStats()) ?? null
}

/** 只在弹层打开时采样，关掉就停，避免又多一个常驻定时器 */
watch(open, (visible) => {
  if (visible) {
    void refreshMemory()
    memoryTimer = window.setInterval(() => void refreshMemory(), 5000)

    // 每次打开都把 AI 配置的草稿对齐到当前设置，别留着上次没提交的输入
    baseUrl.value = settings.aiBaseUrl
    modelName.value = settings.aiModel
    keyInput.value = ''
    tokenInput.value = ''
    savedAt.value = 0
    testResult.value = null
    void refreshSecrets()
  } else if (memoryTimer !== null) {
    window.clearInterval(memoryTimer)
    memoryTimer = null
  }
})

onUnmounted(() => {
  if (memoryTimer !== null) window.clearInterval(memoryTimer)
})

const memoryParts = computed(() => {
  const stats = memory.value
  if (!stats) return []
  return [
    { label: '主进程', value: stats.mainMb },
    { label: '页面', value: stats.rendererMb },
    { label: 'GPU', value: stats.gpuMb },
    { label: '其他', value: stats.otherMb }
  ].filter((part) => part.value > 0)
})

const uptimeText = computed(() => {
  const minutes = memory.value?.uptimeMin ?? 0
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
})

async function testNotify(): Promise<void> {
  if (!bridge) return
  const result = await bridge.testNotify()
  if (result.ok) ElMessage.success('测试通知已发出')
  else ElMessage.warning(`${result.reason ?? '系统不支持通知'}。界面内的提醒气泡仍然有效。`)
}

async function resetAll(): Promise<void> {
  if (!bridge) return
  const payload = await bridge.resetSettings()
  applyRemote(payload.settings)
  applySit(payload.sit)
  ElMessage.success('已恢复默认设置')
}
</script>

<template>
  <el-dialog
    v-model="open"
    title="设置"
    width="440px"
    align-center
    append-to-body
    class="settings-dialog"
  >
    <div class="sheet-body">
      <!-- 工作时间：和主页卡片上的输入框是同一份数据 -->
      <div class="sheet-section">
        <div class="sheet-section-title">上下班时间</div>
        <div class="row-2">
          <label class="field">
            <span>上班</span>
            <el-time-picker
              v-model="workStart"
              format="HH:mm"
              value-format="HH:mm"
              :clearable="false"
              :editable="false"
              size="small"
            />
          </label>
          <label class="field">
            <span>下班</span>
            <el-time-picker
              v-model="workEnd"
              format="HH:mm"
              value-format="HH:mm"
              :clearable="false"
              :editable="false"
              size="small"
            />
          </label>
        </div>

        <div class="sheet-section-label">工作日</div>
        <WorkdayChips :active="settings.workDays" @toggle="toggleWorkday" />
      </div>

      <!-- 个人资料 -->
      <div class="sheet-section">
        <div class="sheet-section-title">个人</div>
        <div class="row-2">
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

          <div class="sheet-fact">
            <span>已经活了</span>
            <b v-if="daysLived !== null">{{ thousands(daysLived) }} <small>天</small></b>
            <b v-else>—</b>
          </div>
        </div>
      </div>

      <!-- 提醒 -->
      <div class="sheet-section-title with-gap">提醒</div>

      <label class="switch-row">
        <div>
          <b>久坐提醒</b>
          <span>连续坐着达到设定时长时提醒</span>
        </div>
        <el-switch v-model="sitEnabled" />
      </label>

      <label class="switch-row">
        <div>
          <b>系统通知</b>
          <span>窗口最小化或被遮挡时也能收到</span>
        </div>
        <el-switch v-model="sitNotify" />
      </label>

      <label class="switch-row">
        <div>
          <b>只在工作时段提醒</b>
          <span>下班后和周末不打扰你</span>
        </div>
        <el-switch v-model="sitWorkHoursOnly" />
      </label>

      <!-- 窗口行为 -->
      <div class="sheet-section-title with-gap">窗口</div>

      <div class="switch-row">
        <div>
          <b>关闭窗口时</b>
          <span>{{ closeActionHint }}</span>
        </div>
        <el-select v-model="closeAction" size="small" class="close-select">
          <el-option
            v-for="option in CLOSE_ACTION_OPTIONS"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </el-select>
      </div>

      <label class="switch-row">
        <div>
          <b>省内存模式</b>
          <span>关掉硬件加速：GPU 常驻内存少一百多 MB，动画改由 CPU 画</span>
        </div>
        <el-switch v-model="lowMemoryMode" />
      </label>

      <div class="switch-row">
        <div>
          <b>迷你悬浮窗</b>
          <span>把窗口收成桌面右下角的一条胶囊 · 快捷键 {{ APP.miniShortcutLabel }}</span>
        </div>
        <el-button size="small" @click="toMini">收成胶囊</el-button>
      </div>

      <div class="sheet-actions">
        <el-button size="small" @click="hideNow">现在最小化到托盘</el-button>
        <el-button size="small" @click="testNotify">发送测试通知</el-button>
        <el-button size="small" @click="restartApp">重启应用</el-button>
      </div>

      <!-- 技术雷达：GitHub 抓取 + 模型配置 -->
      <div class="sheet-section-title with-gap">技术雷达</div>

      <div class="ai-status" :class="aiStatus.tone">
        <i class="ai-dot"></i>
        <div>
          <b>{{ aiStatus.title }}</b>
          <span>{{ aiStatus.detail }}</span>
        </div>
      </div>

      <label class="switch-row">
        <div>
          <b>自动抓取 GitHub 热门</b>
          <span>每 {{ settings.trendingPollHours }} 小时抓一次，窗口收起后也在后台跑</span>
        </div>
        <el-switch v-model="trendingEnabled" />
      </label>

      <div class="row-2">
        <label class="field">
          <span>轮询间隔</span>
          <el-select v-model="pollHours" size="small">
            <el-option v-for="hours in POLL_OPTIONS" :key="hours" :value="hours" :label="`每 ${hours} 小时`" />
          </el-select>
        </label>

        <label class="field">
          <span>GitHub Token（可选）</span>
          <el-input
            v-model="tokenInput"
            size="small"
            type="password"
            show-password
            :placeholder="secrets?.githubToken ? `已保存 ${secrets.ghTokenHint}` : '填了额度更高'"
            @change="commitAiConfig"
          />
        </label>
      </div>

      <div class="field ai-field">
        <span>模型接口地址</span>
        <el-input
          v-model="baseUrl"
          size="small"
          placeholder="https://api.openai.com/v1"
          @change="commitAiConfig"
        />
      </div>

      <div class="row-2 ai-field">
        <label class="field">
          <span>模型名</span>
          <el-input
            v-model="modelName"
            size="small"
            :placeholder="aiModelHint"
            @change="commitAiConfig"
          />
        </label>

        <label class="field">
          <span>API Key</span>
          <el-input
            v-model="keyInput"
            size="small"
            type="password"
            show-password
            :placeholder="secrets?.aiApiKey ? `已保存 ${secrets.aiKeyHint}` : '不填只有基础榜单'"
            @change="commitAiConfig"
          />
        </label>
      </div>

      <div class="ai-foot">
        <span v-if="secrets && !secrets.encrypted" class="ai-warn">
          当前系统不支持加密存储，密钥会明文落盘
        </span>
        <span v-else>密钥加密保存在本机；解读时项目名称和描述会发给你配置的模型服务</span>
        <button v-if="secrets?.aiApiKey" class="reset-link" @click="clearSecret('aiApiKey')">清除 Key</button>
        <button v-if="secrets?.githubToken" class="reset-link" @click="clearSecret('githubToken')">清除 Token</button>
      </div>

      <div class="sheet-actions">
        <el-button size="small" @click="saveAiConfig">保存配置</el-button>
        <el-button size="small" :loading="testingAi" @click="testAi">测试连接</el-button>
        <el-button size="small" @click="openTrending">打开技术雷达</el-button>
        <span v-if="savedText" class="ai-saved">{{ savedText }}</span>
      </div>

      <!-- 运行状态：内存占用，方便确认「长时间运行」到底吃了多少 -->
      <div class="sheet-section-title with-gap">运行状态</div>

      <div class="mem-row">
        <div class="mem-total">
          <b>{{ memory ? memory.totalMb : '—' }}<small>MB</small></b>
          <span>已运行 {{ uptimeText }}</span>
        </div>
        <div class="mem-parts">
          <span v-for="part in memoryParts" :key="part.label">{{ part.label }} {{ part.value }} MB</span>
        </div>
      </div>

      <div class="sheet-meta">
        <div class="meta-line">
          <template v-if="meta">
            {{ appTitle }} v{{ meta.version }} · Electron {{ meta.electron }}
          </template>
          <template v-else>读取中…</template>
          <button class="reset-link" @click="resetAll">恢复默认设置</button>
        </div>
        <div v-if="meta" class="meta-path" :title="meta.settingsFile">{{ meta.settingsFile }}</div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.sheet-body {
  padding: 2px 0 0;
}

.sheet-section {
  padding: 2px 0 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.sheet-section-title {
  font-size: 10.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 2px 0 7px;
  font-weight: 600;
}

.sheet-section-title.with-gap {
  margin-top: 12px;
}

.sheet-section-label {
  font-size: 10.5px;
  letter-spacing: 0.9px;
  color: var(--dim);
  text-transform: uppercase;
  margin: 12px 0 7px;
}

.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.row-2 :deep(.el-date-editor),
.row-2 :deep(.el-date-editor.el-input) {
  width: 100%;
}

.sheet-fact {
  display: flex;
  flex-direction: column;
  gap: 5px;
  justify-content: flex-end;
}

.sheet-fact > span {
  font-size: 10.5px;
  letter-spacing: 0.9px;
  color: var(--dim);
  text-transform: uppercase;
}

.sheet-fact > b {
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 600;
  color: #e6ddff;
  font-variant-numeric: tabular-nums;
}

.sheet-fact > b small {
  font-size: 11px;
  color: var(--violet);
  margin-left: 3px;
  opacity: 0.85;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.switch-row b {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: #dfe7f4;
}

.switch-row span {
  display: block;
  font-size: 11px;
  color: var(--dim);
  margin-top: 3px;
}

.sheet-actions {
  display: flex;
  gap: 9px;
  margin-top: 12px;
  flex-wrap: wrap;
}

/* ---------- 技术雷达 ---------- */
/* 默认「未就绪」是琥珀色；通了变青，测通但连不上变红 */
.ai-status {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 2px 0 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(245, 194, 107, 0.24);
  background: rgba(245, 194, 107, 0.07);
}

.ai-status.ok {
  border-color: rgba(94, 234, 212, 0.26);
  background: rgba(94, 234, 212, 0.07);
}

.ai-status.bad {
  border-color: rgba(248, 113, 113, 0.26);
  background: rgba(248, 113, 113, 0.07);
}

.ai-dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--gold);
}

.ai-status.ok .ai-dot {
  background: var(--teal);
  box-shadow: 0 0 8px rgba(94, 234, 212, 0.5);
}

.ai-status.bad .ai-dot {
  background: #f87171;
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.45);
}

.ai-status > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-status b {
  font-size: 11.5px;
  font-weight: 600;
  color: #e3c48f;
}

.ai-status.ok b {
  color: var(--teal);
}

.ai-status.bad b {
  color: #ffb4b4;
}

.ai-status span {
  font-size: 10px;
  line-height: 1.5;
  color: var(--dim);
  word-break: break-all;
}

.ai-saved {
  margin-left: auto;
  align-self: center;
  font-size: 9.5px;
  color: var(--dim);
}

.ai-field {
  margin-top: 9px;
}

.ai-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 10px;
  line-height: 1.5;
  color: #4d5769;
}

.ai-foot > span {
  flex: 1;
  min-width: 0;
}

.ai-warn {
  color: var(--gold);
}

.ai-foot .reset-link {
  flex: none;
}

/* 关闭行为的下拉：固定宽度，别把行撑变形 */
.close-select {
  width: 132px;
  flex: none;
}

.close-select :deep(.el-select__wrapper) {
  min-height: 26px;
}

/* 内存占用 */
.mem-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  padding: 2px 0 0;
}

.mem-total {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mem-total b {
  font-family: var(--mono);
  font-size: 19px;
  font-weight: 600;
  color: var(--teal);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.mem-total b small {
  font-size: 10.5px;
  margin-left: 3px;
  color: var(--muted);
  letter-spacing: 0.6px;
}

.mem-total span {
  font-size: 10.5px;
  color: var(--dim);
}

.mem-parts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 10px;
  font-size: 10.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}


.sheet-meta {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.06);
  font-size: 10.5px;
  color: var(--dim);
  line-height: 1.7;
  word-break: break-all;
}

.meta-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.reset-link {
  border: none;
  background: none;
  padding: 0;
  font-size: 10.5px;
  color: #7a5c5c;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  flex: none;
}

.reset-link:hover {
  color: #ff9a9a;
}

.meta-path {
  margin-top: 2px;
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
