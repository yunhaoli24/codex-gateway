import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdownLanguage from 'highlight.js/lib/languages/markdown'
import scss from 'highlight.js/lib/languages/scss'
import stylus from 'highlight.js/lib/languages/stylus'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { LanguageFn } from 'highlight.js'

let languagesRegistered = false

// Based on highlightjs/highlightjs-vue's Vue SFC language definition.
const vueLanguage: LanguageFn = (hljs) => ({
  subLanguage: 'xml',
  contains: [
    hljs.COMMENT('<!--', '-->', {
      relevance: 10,
    }),
    {
      begin: /^( *)(<script>)/m,
      end: /^( *)(<\/script>)/m,
      subLanguage: 'javascript',
      excludeBegin: true,
      excludeEnd: true,
    },
    {
      begin: /^( *)(<script lang=["']ts["']>)/m,
      end: /^( *)(<\/script>)/m,
      subLanguage: 'typescript',
      excludeBegin: true,
      excludeEnd: true,
    },
    {
      begin: /^( *)(<style( scoped)?>)/m,
      end: /^( *)(<\/style>)/m,
      subLanguage: 'css',
      excludeBegin: true,
      excludeEnd: true,
    },
    {
      begin: /^( *)(<style lang=["'](scss|sass)["']( scoped)?>)/m,
      end: /^( *)(<\/style>)/m,
      subLanguage: 'scss',
      excludeBegin: true,
      excludeEnd: true,
    },
    {
      begin: /^( *)(<style lang=["']stylus["']( scoped)?>)/m,
      end: /^( *)(<\/style>)/m,
      subLanguage: 'stylus',
      excludeBegin: true,
      excludeEnd: true,
    },
  ],
})

export function ensureHighlightLanguages() {
  if (languagesRegistered) {
    return
  }

  hljs.registerLanguage('bash', bash)
  hljs.registerLanguage('css', css)
  hljs.registerLanguage('html', xml)
  hljs.registerLanguage('javascript', javascript)
  hljs.registerLanguage('js', javascript)
  hljs.registerLanguage('json', json)
  hljs.registerLanguage('markdown', markdownLanguage)
  hljs.registerLanguage('md', markdownLanguage)
  hljs.registerLanguage('scss', scss)
  hljs.registerLanguage('sh', bash)
  hljs.registerLanguage('shell', bash)
  hljs.registerLanguage('stylus', stylus)
  hljs.registerLanguage('typescript', typescript)
  hljs.registerLanguage('ts', typescript)
  hljs.registerLanguage('tsx', typescript)
  hljs.registerLanguage('vue', vueLanguage)
  hljs.registerLanguage('xml', xml)
  hljs.registerLanguage('yaml', yaml)
  hljs.registerLanguage('yml', yaml)

  languagesRegistered = true
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

export function normalizeLanguage(value: string) {
  return (value || '').trim().toLowerCase()
}

export function highlightCode(value: string, language = '') {
  ensureHighlightLanguages()
  const normalizedLanguage = normalizeLanguage(language)
  if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
    return hljs.highlight(value, { language: normalizedLanguage, ignoreIllegals: true }).value
  }
  return hljs.highlightAuto(value).value
}

export function languageFromPath(path: string) {
  const extension = path.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() || ''
  const byExtension: Record<string, string> = {
    bash: 'bash',
    cjs: 'javascript',
    css: 'css',
    html: 'html',
    js: 'javascript',
    json: 'json',
    jsx: 'javascript',
    md: 'markdown',
    mjs: 'javascript',
    scss: 'scss',
    sh: 'bash',
    styl: 'stylus',
    stylus: 'stylus',
    ts: 'typescript',
    tsx: 'typescript',
    vue: 'vue',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
  }
  return byExtension[extension] || ''
}
