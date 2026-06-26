<script setup lang="ts">
import {
  BrainIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  FilePenIcon,
  ListChecksIcon,
  TerminalIcon,
  WrenchIcon,
  XCircleIcon,
} from '@lucide/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import MarkdownContent from '@/components/MarkdownContent.vue'

const props = defineProps<{
  item: Record<string, any>
}>()

const { t } = useI18n()
const text = computed(() => itemText(props.item))
const title = computed(() => toolTitle(props.item))
const output = computed(() => truncate(props.item.aggregatedOutput || props.item.result?.text || '', 1200))
const fileChanges = computed(() => Array.isArray(props.item.changes) ? props.item.changes : [])

function itemText(item: Record<string, any>) {
  if (item.type === 'userMessage') {
    return (item.content || [])
      .map((part: any) => part?.text || part?.content || '')
      .filter(Boolean)
      .join('\n')
  }
  if (item.type === 'agentMessage' || item.type === 'plan') {
    return item.text || ''
  }
  if (item.type === 'reasoning') {
    return [...(item.summary || []), ...(item.content || [])].filter(Boolean).join('\n')
  }
  if (item.type === 'hookPrompt') {
    return (item.fragments || []).map((fragment: any) => fragment?.text || '').filter(Boolean).join('\n')
  }
  return ''
}

function toolTitle(item: Record<string, any>) {
  if (item.type === 'commandExecution') return item.command || 'Command'
  if (item.type === 'fileChange') return t('app.filesChanged', { count: item.changes?.length || 0 })
  if (item.type === 'mcpToolCall') return `${item.server || 'MCP'} · ${item.tool || 'tool'}`
  if (item.type === 'dynamicToolCall') return item.name || 'Tool call'
  if (item.type === 'webSearch') return item.query || 'Web search'
  return item.type
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}\n...` : value
}

function changePath(change: Record<string, any>) {
  return change.path || change.filePath || change.pathAfter || change.pathBefore || 'unknown'
}

function changeKind(change: Record<string, any>) {
  const kind = change.kind
  if (typeof kind === 'string') {
    return kind
  }
  if (kind && typeof kind === 'object') {
    return kind.type || kind.kind || 'update'
  }
  return 'update'
}

function changeKindLabel(change: Record<string, any>) {
  const kind = changeKind(change).toLowerCase()
  if (kind.includes('add') || kind === 'create') return t('app.fileAdded')
  if (kind.includes('delete') || kind === 'remove') return t('app.fileDeleted')
  if (kind.includes('move') || kind.includes('rename')) return t('app.fileMoved')
  return t('app.fileUpdated')
}

function changeDiff(change: Record<string, any>) {
  return change.diff || ''
}

function diffMarkdown(change: Record<string, any>) {
  const diff = changeDiff(change)
  return diff ? `\`\`\`diff\n${diff.replaceAll('```', '``\\`')}\n\`\`\`` : ''
}
</script>

<template>
  <div v-if="item.type === 'userMessage'" class="flex justify-end">
    <div class="max-w-[760px] rounded-2xl bg-[#f1f1f1] px-5 py-4 text-[15px] leading-7 text-[#202225]">
      <MarkdownContent :content="text" compact />
    </div>
  </div>

  <div v-else-if="item.type === 'agentMessage'" class="max-w-[840px] text-[15px] leading-8 text-[#202225]">
    <MarkdownContent :content="text" />
  </div>

  <div v-else-if="item.type === 'plan'" class="max-w-[840px] text-[15px] leading-8 text-[#202225]">
    <div class="mb-2 flex items-center gap-2 text-[#9aa1a6]">
      <ListChecksIcon class="size-4" />
      <span>Plan</span>
    </div>
    <MarkdownContent :content="text" />
  </div>

  <div v-else-if="item.type === 'reasoning'" class="max-w-[840px] text-[15px] leading-7 text-[#9aa1a6]">
    <div class="flex items-start gap-2">
      <BrainIcon class="size-4" />
      <MarkdownContent v-if="text" :content="text" compact />
      <span v-else>Thinking</span>
    </div>
  </div>

  <div v-else-if="item.type === 'commandExecution'" class="max-w-[840px] text-[#8d9499]">
    <div class="flex items-center gap-2 text-[15px]">
      <TerminalIcon class="size-4" />
      <span class="truncate">{{ title }}</span>
      <Badge variant="secondary">{{ item.status }}</Badge>
      <CheckCircle2Icon v-if="item.exitCode === 0" class="size-4 text-emerald-600" />
      <XCircleIcon v-else-if="item.exitCode" class="size-4 text-red-600" />
    </div>
    <pre v-if="output" class="mt-2 max-h-56 overflow-auto rounded-lg bg-[#f6f6f6] p-3 text-xs leading-5 text-[#3d4145]">{{ output }}</pre>
  </div>

  <div v-else-if="item.type === 'fileChange'" class="max-w-[840px] text-[#5f6970]">
    <div class="flex items-center gap-2 text-[15px]">
      <FilePenIcon class="size-4" />
      <span>{{ title }}</span>
      <Badge variant="secondary">{{ item.status }}</Badge>
    </div>
    <div v-if="fileChanges.length" class="mt-3 space-y-2">
      <Collapsible
        v-for="change in fileChanges"
        :key="`${changePath(change)}-${changeKind(change)}`"
        v-slot="{ open }"
        class="rounded-lg border border-black/10 bg-[#fbfbfb]"
      >
        <CollapsibleTrigger class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03]">
          <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-[#9aa1a6]" />
          <ChevronRightIcon v-else class="size-4 shrink-0 text-[#9aa1a6]" />
          <span class="min-w-0 flex-1 truncate font-mono text-[13px] text-[#31363a]">{{ changePath(change) }}</span>
          <Badge variant="outline">{{ changeKindLabel(change) }}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            v-if="changeDiff(change)"
            class="diff-markdown max-h-[420px] overflow-auto border-t border-black/10 bg-white"
          >
            <MarkdownContent :content="diffMarkdown(change)" compact />
          </div>
          <div v-else class="border-t border-black/10 px-3 py-2 text-sm text-[#9aa1a6]">
            {{ t('app.noDiff') }}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </div>

  <div v-else-if="['mcpToolCall', 'dynamicToolCall', 'webSearch'].includes(item.type)" class="max-w-[840px] text-[#8d9499]">
    <div class="flex items-center gap-2 text-[15px]">
      <WrenchIcon class="size-4" />
      <span class="truncate">{{ title }}</span>
      <Badge v-if="item.status" variant="secondary">{{ item.status }}</Badge>
    </div>
  </div>
</template>
