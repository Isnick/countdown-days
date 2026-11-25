<script setup lang="ts">
/**
 * 项目详情弹窗
 * ------------------------------------------------------------------
 * 列表里只放「一句话介绍」，点进来才展开：这东西到底干嘛的、怎么开始用、适合谁。
 * 内容是 AI 写的，所以刻意标注了「AI 解读」+ 模型名，别让人误以为是官方说明。
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import type { TrendingItem } from '@shared/types'
import { bridge } from '@/api/bridge'
import { thousands } from '@/utils/format'

const props = defineProps<{
  modelValue: boolean
  item: TrendingItem | null
  /** 后台是否正在给这个项目生成解读 */
  aiRunning?: boolean
  /** 模型是否已配置（决定空状态该说什么） */
  aiReady?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const insight = computed(() => props.item?.insight ?? null)

const createdText = computed(() => {
  const raw = props.item?.createdAt ?? ''
  return raw ? raw.slice(5) : ''
})

async function openOnGitHub(): Promise<void> {
  if (!props.item) return
  try {
    await bridge?.trendingOpen(props.item.url)
  } catch (err) {
    ElMessage.warning((err as Error).message || '打不开这个链接')
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    width="580px"
    align-center
    append-to-body
    class="settings-dialog trending-detail"
  >
    <template #header>
      <div class="td-head">
        <div class="td-title">
          <b>{{ item?.fullName ?? '' }}</b>
          <span v-if="item?.language" class="td-lang">{{ item.language }}</span>
        </div>
        <span v-if="insight" class="td-score" :class="insight.score >= 80 ? 'hot' : insight.score >= 60 ? 'good' : ''">
          {{ insight.score }}
        </span>
      </div>
    </template>

    <div v-if="item" class="td-body">
      <!-- 一句话：列表里已经看过，这里放大，作为「到底是什么」的答案 -->
      <p v-if="insight?.intro" class="td-intro">{{ insight.intro }}</p>
      <p v-else class="td-intro is-raw">{{ item.description || '这个项目还没写描述。' }}</p>

      <div class="td-meta">
        <span>★ {{ thousands(item.stars) }}</span>
        <span>Fork {{ thousands(item.forks) }}</span>
        <span v-if="createdText">创建于 {{ createdText }}</span>
        <span v-if="item.days > 1">{{ item.days }} 天上榜</span>
        <span v-if="insight" class="td-state">已解读</span>
      </div>

      <template v-if="insight">
        <section class="td-section">
          <h4>它是干嘛的</h4>
          <p>{{ insight.detail }}</p>
        </section>

        <section v-if="insight.howto.length" class="td-section">
          <h4>怎么开始用</h4>
          <ol class="td-steps">
            <li v-for="(step, i) in insight.howto" :key="i">{{ step }}</li>
          </ol>
        </section>

        <section class="td-section td-two">
          <div>
            <h4>适合谁</h4>
            <p>{{ insight.forWho || '—' }}</p>
          </div>
          <div>
            <h4>为什么最近火</h4>
            <p>{{ insight.why || '—' }}</p>
          </div>
        </section>

        <div v-if="insight.tags.length" class="td-tags">
          <span v-for="tag in insight.tags" :key="tag">{{ tag }}</span>
        </div>

        <p class="td-note">
          AI 解读（{{ insight.model }}）· 仅供参考，安装和用法以仓库 README 为准
        </p>
      </template>

      <p v-else class="td-empty">
        <template v-if="aiRunning">正在解读这个项目，内容出来这里会自动补上，不用重新点开。</template>
        <template v-else-if="!aiReady">AI 解读还没启用。到设置里填好模型地址和 Key，面板会自动补上介绍。</template>
        <template v-else>这个项目排在后面，还没轮到解读。稍等一会儿，或者关掉面板再打开，会自动补一批。</template>
      </p>
    </div>

    <template #footer>
      <div class="td-foot">
        <button class="td-btn" @click="open = false">关闭</button>
        <button class="td-btn primary" @click="openOnGitHub">在浏览器打开 GitHub</button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
:global(.trending-detail) {
  max-width: 92vw;
}

.td-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 32px;
}

.td-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.td-title b {
  font-size: 14px;
  font-weight: 600;
  color: #eef4ff;
  letter-spacing: 0.2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.td-lang {
  flex: none;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid #2b3444;
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted);
}

.td-score {
  flex: none;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  border: 1px solid #262e3d;
  background: rgba(255, 255, 255, 0.04);
  font-family: var(--mono);
  font-size: 12.5px;
  color: #7d8a9e;
}

.td-score.hot {
  color: #062a24;
  background: linear-gradient(160deg, #6ff0da, #2bbfa6);
  border-color: #4fdec4;
  font-weight: 700;
}

.td-score.good {
  color: var(--gold);
  background: rgba(245, 194, 107, 0.12);
  border-color: rgba(245, 194, 107, 0.3);
}

.td-body {
  padding: 2px 0 0;
}

.td-intro {
  margin: 0 0 9px;
  font-size: 13px;
  line-height: 1.7;
  color: #dfe9f6;
}

.td-intro.is-raw {
  color: var(--muted);
  font-size: 12px;
}

.td-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding-bottom: 11px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 10.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}

.td-state {
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid rgba(94, 234, 212, 0.3);
  background: rgba(94, 234, 212, 0.1);
  color: var(--teal);
  font-size: 9.5px;
  line-height: 1.7;
}

.td-section {
  margin-top: 13px;
}

.td-section h4 {
  margin: 0 0 5px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: var(--dim);
}

.td-section p {
  margin: 0;
  font-size: 12px;
  line-height: 1.75;
  color: #c3cddd;
}

.td-steps {
  margin: 0;
  padding-left: 17px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.td-steps li {
  font-size: 12px;
  line-height: 1.65;
  color: #c3cddd;
}

.td-steps li::marker {
  color: var(--teal);
  font-family: var(--mono);
  font-size: 10px;
}

.td-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.td-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 13px;
}

.td-tags span {
  padding: 1px 7px;
  border-radius: 5px;
  border: 1px solid rgba(122, 162, 255, 0.2);
  background: rgba(122, 162, 255, 0.09);
  color: #9db6f5;
  font-size: 9.5px;
}

.td-note {
  margin: 11px 0 0;
  font-size: 9.5px;
  color: #4d5769;
}

.td-empty {
  margin: 14px 0 4px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--dim);
}

.td-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.td-btn {
  height: 28px;
  padding: 0 13px;
  border-radius: 8px;
  border: 1px solid #2b3444;
  background: rgba(255, 255, 255, 0.045);
  color: #c2cbdb;
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.td-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: #3d4a61;
  color: #fff;
}

.td-btn.primary {
  background-image: linear-gradient(180deg, #6ff0da, #38c9b0);
  border-color: #4bdec5;
  color: #052a23;
  font-weight: 700;
}

.td-btn.primary:hover {
  filter: brightness(1.06);
  color: #052a23;
}
</style>
