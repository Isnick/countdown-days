<script setup lang="ts">
/**
 * 一行带局部加粗的说明文字。
 * 用它代替 v-html：既保留了原来 <b> 的视觉层次，又不会把字符串当 HTML 解析。
 */
import type { RichPart } from '@shared/types'

defineProps<{ parts: RichPart[] }>()
</script>

<template>
  <span>
    <template v-for="(part, index) in parts" :key="index">
      <b v-if="part.strong">{{ part.text }}</b>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
