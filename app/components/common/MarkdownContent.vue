<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  content: string
  compact?: boolean
}>(), {
  compact: false,
})

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(value, language) {
    if (language === 'diff') {
      return `<pre class="language-diff"><code>${renderDiff(value)}</code></pre>`
    }
    return ''
  },
})

const rendered = computed(() => markdown.render(props.content || ''))

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderDiff(value: string) {
  return value.split('\n').map((line) => {
    const className = diffLineClass(line)
    return `<span class="${className}">${escapeHtml(line || ' ')}</span>`
  }).join('\n')
}

function diffLineClass(line: string) {
  if (line.startsWith('@@')) {
    return 'diff-line diff-line-hunk'
  }
  if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
    return 'diff-line diff-line-meta'
  }
  if (line.startsWith('+')) {
    return 'diff-line diff-line-add'
  }
  if (line.startsWith('-')) {
    return 'diff-line diff-line-remove'
  }
  return 'diff-line'
}
</script>

<template>
  <div
    class="markdown-content"
    :class="{ 'markdown-content-compact': compact }"
    v-html="rendered"
  />
</template>
