<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'
import { escapeAttribute, escapeHtml, highlightCode, normalizeLanguage } from '@/utils/code-highlight'

const props = withDefaults(defineProps<{
  content: string
  compact?: boolean
  diffLanguage?: string
}>(), {
  compact: false,
  diffLanguage: '',
})

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(value, language) {
    const normalizedLanguage = normalizeLanguage(language)
    if (normalizedLanguage === 'diff') {
      return `<pre class="syntax-highlight language-diff"><code>${renderDiff(value, props.diffLanguage)}</code></pre>`
    }
    const highlighted = highlightCode(value, normalizedLanguage)
    return `<pre class="hljs syntax-highlight language-${escapeAttribute(normalizedLanguage || 'text')}"><code>${highlighted}</code></pre>`
  },
})

const rendered = computed(() => markdown.render(props.content || ''))

function renderDiff(value: string, language: string) {
  const normalizedLanguage = normalizeLanguage(language)
  return value.split('\n').map((line) => {
    const className = diffLineClass(line)
    return `<span class="${className}">${renderDiffLine(line, normalizedLanguage)}</span>`
  }).join('')
}

function diffCodeLine(line: string) {
  const marker = line[0]
  return marker === '+' || marker === '-' || marker === ' ' ? line.slice(1) : line
}

function renderDiffLine(line: string, language: string) {
  if (!line) {
    return ' '
  }
  if (line.startsWith('@@') || line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
    return escapeHtml(line)
  }
  const marker = line[0]
  if (marker !== '+' && marker !== '-' && marker !== ' ') {
    return highlightCode(line, language)
  }
  const code = diffCodeLine(line)
  return `<span class="diff-line-marker">${escapeHtml(marker)}</span>${highlightCode(code || ' ', language)}`
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
