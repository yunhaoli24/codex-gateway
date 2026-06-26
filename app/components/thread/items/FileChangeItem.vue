<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, FilePenIcon } from '@lucide/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import MarkdownContent from '@/components/common/MarkdownContent.vue'

const props = defineProps<{ item: Record<string, any> }>()
const { t } = useI18n()
const title = computed(() => t('app.filesChanged', { count: props.item.changes?.length || 0 }))
const fileChanges = computed(() => Array.isArray(props.item.changes) ? props.item.changes : [])

function changePath(change: Record<string, any>) {
  return change.path || change.filePath || change.pathAfter || change.pathBefore || 'unknown'
}

function changeKind(change: Record<string, any>) {
  const kind = change.kind
  if (typeof kind === 'string') return kind
  if (kind && typeof kind === 'object') return kind.type || kind.kind || 'update'
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
  <div class="max-w-[840px] text-[#5f6970]">
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
          <div v-if="changeDiff(change)" class="diff-markdown max-h-[420px] overflow-auto border-t border-black/10 bg-white">
            <MarkdownContent :content="diffMarkdown(change)" compact />
          </div>
          <div v-else class="border-t border-black/10 px-3 py-2 text-sm text-[#9aa1a6]">
            {{ t('app.noDiff') }}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </div>
</template>
