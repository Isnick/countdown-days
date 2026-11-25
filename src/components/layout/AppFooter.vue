<script setup lang="ts">
/** 页脚：数据来源 / 隐私说明 / 配置文件路径 */
import { COPY } from '@shared/constants'

defineProps<{ settingsFile?: string }>()
</script>

<template>
  <footer>
    {{ COPY.footer.holiday }} · {{ COPY.footer.privacy }}
    <span>{{ settingsFile ?? 'settings.json' }}</span>
    · {{ COPY.footer.shortcut }}
  </footer>
</template>

<style scoped>
footer {
  flex: none;
  margin: clamp(5px, 1vh, 11px) 0 2px;
  text-align: center;
  font-size: 10.5px;
  color: #4d5769;
  line-height: 1.6;
}

footer span {
  color: #6b7688;
  word-break: break-all;
}
</style>
