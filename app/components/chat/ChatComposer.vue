<script setup lang="ts">
import {
  CheckIcon,
  CircleIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  XIcon,
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import type { ApprovalPolicy, ReasoningEffort, UploadedFileRecord } from '~~/shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useGatewayStore } from '@/stores/gateway'

const store = useGatewayStore()
const { t } = useI18n()
const {
  selectedHostId,
  selectedThreadId,
  events,
  selectedThreadStatus,
  selectedThreadSettings,
  models,
  loadingModels,
  defaultModel,
} = storeToRefs(store)

const turnText = ref('')
const selectedModel = ref('')
const selectedEffort = ref<ReasoningEffort | 'default'>('default')
const selectedApprovalPolicy = ref<ApprovalPolicy>('on-request')
const attachedFiles = ref<Array<UploadedFileRecord & { id: string, dataUrl?: string }>>([])
const uploadInputRef = ref<HTMLInputElement | null>(null)
const uploadingAttachments = ref(false)

const approvalOptions: Array<{ value: ApprovalPolicy, label: string }> = [
  { value: 'on-request', label: '按需审批' },
  { value: 'untrusted', label: '非信任操作审批' },
  { value: 'never', label: '永不审批' },
]

const defaultEffortOptions: Array<{ value: ReasoningEffort | 'default', label: string }> = [
  { value: 'default', label: '默认推理' },
]
let syncingSettings = false

const visibleEvents = computed(() => events.value.filter((event) => shouldShowEvent(event.method)))
const activeEvents = computed(() => visibleEvents.value.slice(-8))
const isThreadRunning = computed(() => selectedThreadStatus.value === 'running')
const canSendTurn = computed(() => Boolean(selectedThreadId.value && (turnText.value.trim() || attachedFiles.value.length) && !isThreadRunning.value && !uploadingAttachments.value))
const activeModel = computed(() => selectedModel.value || defaultModel.value?.model || defaultModel.value?.id || '')
const activeModelRecord = computed(() => models.value.find((candidate) => candidate.model === activeModel.value || candidate.id === activeModel.value))
const activeModelLabel = computed(() => {
  const model = activeModelRecord.value
  return model?.displayName || model?.model || activeModel.value || '模型'
})
const effortOptions = computed(() => {
  const supportedEfforts = activeModelRecord.value?.supportedReasoningEfforts ?? []
  const options = supportedEfforts.map((option) => ({
    value: option.reasoningEffort,
    label: option.description || option.reasoningEffort,
  }))
  if (selectedEffort.value !== 'default' && !options.some((option) => option.value === selectedEffort.value)) {
    options.unshift({ value: selectedEffort.value, label: selectedEffort.value })
  }
  return [...defaultEffortOptions, ...options]
})
const activeEffortLabel = computed(() => effortOptions.value.find((option) => option.value === selectedEffort.value)?.label || '默认推理')
const activeApprovalLabel = computed(() => approvalOptions.find((option) => option.value === selectedApprovalPolicy.value)?.label || '按需审批')
const sendButtonLabel = computed(() => {
  if (isThreadRunning.value) return '运行中'
  if (turnText.value.trim() || attachedFiles.value.length) return t('app.send')
  if (selectedThreadStatus.value === 'completed') return '已完成'
  if (selectedThreadStatus.value === 'failed') return '失败'
  if (selectedThreadStatus.value === 'interrupted') return '已中断'
  return t('app.send')
})

function eventLabel(method: string) {
  if (method.includes('command') || method.includes('process')) return t('app.runningCommand')
  if (method.includes('file') || method.includes('fs')) return t('app.readingFiles')
  if (method.includes('turn')) return method.replaceAll('/', ' ')
  return method
}

function shouldShowEvent(method: string) {
  return method.includes('command')
    || method.includes('process')
    || method.includes('file')
    || method.includes('fs')
    || method === 'turn/started'
    || method === 'turn/completed'
}

function syncComposerFromThreadSettings() {
  syncingSettings = true
  selectedModel.value = selectedThreadSettings.value.model || defaultModel.value?.model || defaultModel.value?.id || ''
  selectedEffort.value = selectedThreadSettings.value.effort || 'default'
  selectedApprovalPolicy.value = selectedThreadSettings.value.approvalPolicy || 'on-request'
  void nextTick(() => {
    syncingSettings = false
  })
}

watch(
  () => [
    selectedThreadId.value,
    selectedThreadSettings.value.model,
    selectedThreadSettings.value.effort,
    selectedThreadSettings.value.approvalPolicy,
    defaultModel.value?.model,
    defaultModel.value?.id,
  ],
  syncComposerFromThreadSettings,
  { immediate: true },
)

watch(selectedModel, (model) => {
  if (syncingSettings || !selectedThreadId.value) {
    return
  }
  void store.saveSelectedThreadSettings({ model: model || null })
})

watch(selectedEffort, (effort) => {
  if (syncingSettings || !selectedThreadId.value) {
    return
  }
  void store.saveSelectedThreadSettings({ effort: effort === 'default' ? null : effort })
})

watch(selectedApprovalPolicy, (approvalPolicy) => {
  if (syncingSettings || !selectedThreadId.value) {
    return
  }
  void store.saveSelectedThreadSettings({ approvalPolicy })
})

async function sendTurn() {
  const text = turnText.value.trim()
  if (!text && !attachedFiles.value.length) return
  const files = [...attachedFiles.value]
  const remoteFiles = files.filter((file) => !file.isImage)
  const attachedImages = files.filter((file) => file.isImage)
  const fileReferences = remoteFiles
    .map((file) => `- ${file.name}: ${file.path}`)
  const message = fileReferences.length
    ? `${text}${text ? '\n\n' : ''}已附加文件，远端路径：\n${fileReferences.join('\n')}`
    : text
  turnText.value = ''
  attachedFiles.value = []
  await store.sendTurn(message, {
    model: activeModel.value || undefined,
    effort: selectedEffort.value === 'default' ? undefined : selectedEffort.value,
    approvalPolicy: selectedApprovalPolicy.value,
    images: attachedImages
      .map((file) => ({ url: file.dataUrl, detail: 'auto' as const }))
      .filter((image): image is { url: string, detail: 'auto' } => Boolean(image.url)),
    files: remoteFiles,
  })
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter' || event.shiftKey) {
    return
  }
  event.preventDefault()
  void sendTurn()
}

function openAttachmentPicker() {
  uploadInputRef.value?.click()
}

async function dataUrlFromFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result || '')))
    reader.addEventListener('error', () => reject(reader.error || new Error('Failed to read file')))
    reader.readAsDataURL(file)
  })
}

async function addFiles(files: File[]) {
  const images = files.filter((file) => file.type.startsWith('image/'))
  const otherFiles = files.filter((file) => !file.type.startsWith('image/'))

  for (const file of images) {
    attachedFiles.value.push({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${file.name}`,
      name: file.name || 'pasted-image.png',
      path: '',
      mimeType: file.type || null,
      size: file.size,
      isImage: true,
      dataUrl: await dataUrlFromFile(file),
    })
  }

  if (!otherFiles.length || !selectedHostId.value) {
    return
  }

  uploadingAttachments.value = true
  try {
    const form = new FormData()
    for (const file of otherFiles) {
      form.append('files', file, file.name)
    }
    const result = await $fetch<{ files: UploadedFileRecord[] }>('/api/uploads', {
      method: 'POST',
      query: { hostId: selectedHostId.value },
      body: form,
    })
    attachedFiles.value.push(...result.files.map((file) => ({
      ...file,
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${file.name}`,
    })))
  } catch (error: any) {
    store.setError(error?.data?.message || error?.message || '附件上传失败')
  } finally {
    uploadingAttachments.value = false
  }
}

function handleAttachmentChange(event: Event) {
  const input = event.target as HTMLInputElement
  void addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (!files.length) {
    return
  }
  event.preventDefault()
  void addFiles(files)
}

function removeAttachment(id: string) {
  attachedFiles.value = attachedFiles.value.filter((file) => file.id !== id)
}
</script>

<template>
  <div class="shrink-0 bg-gradient-to-t from-white via-white to-white/75 px-8 pb-5">
    <div class="mx-auto max-w-[760px]">
      <div v-if="activeEvents.length" class="mb-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-[#6f767d] shadow-sm">
        <CircleIcon class="size-3.5 text-sky-300" />
        {{ eventLabel(activeEvents.at(-1)?.method || '') }}
      </div>

      <div class="rounded-2xl border border-black/10 bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <input
          ref="uploadInputRef"
          class="hidden"
          type="file"
          multiple
          @change="handleAttachmentChange"
        >
        <div v-if="attachedFiles.length" class="mb-2 flex flex-wrap gap-2">
          <Badge
            v-for="file in attachedFiles"
            :key="file.id"
            variant="outline"
            class="h-7 gap-1.5 rounded-md px-2 text-xs"
          >
            <ImageIcon v-if="file.isImage" class="size-3.5 text-sky-600" />
            <FileIcon v-else class="size-3.5 text-[#7d858b]" />
            <span class="max-w-48 truncate">{{ file.name }}</span>
            <button type="button" class="ml-1 rounded-sm text-[#7d858b] hover:text-[#202225]" @click="removeAttachment(file.id)">
              <XIcon class="size-3.5" />
            </button>
          </Badge>
        </div>
        <Textarea
          v-model="turnText"
          class="min-h-24 border-0 bg-transparent px-1 text-[17px] leading-7 shadow-none ring-0 focus-visible:ring-0"
          :placeholder="t('app.askFollowUp')"
          :disabled="!selectedThreadId || isThreadRunning"
          @keydown="handleComposerKeydown"
          @paste="handlePaste"
        />
        <div class="flex items-center justify-between pt-2">
          <div class="flex items-center gap-2 text-sm text-[#858b91]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 px-2"
              :disabled="uploadingAttachments || isThreadRunning"
              :aria-label="t('app.attachFile')"
              @click="openAttachmentPicker"
            >
              <Loader2Icon v-if="uploadingAttachments" class="size-4 animate-spin" />
              <PlusIcon v-else class="size-4" />
            </Button>
            <Popover>
              <PopoverTrigger as-child>
                <Button type="button" variant="ghost" size="sm" class="h-8 gap-2 px-2">
                  <SettingsIcon class="size-4" />
                  <span>{{ activeApprovalLabel }}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-72 gap-3">
                <div class="space-y-1">
                  <div class="text-xs font-medium text-[#202225]">{{ t('app.approvalPolicy') }}</div>
                  <Select v-model="selectedApprovalPolicy">
                    <SelectTrigger class="h-8 w-full justify-between">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in approvalOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-medium text-[#202225]">{{ t('app.reasoningEffort') }}</div>
                  <Select v-model="selectedEffort">
                    <SelectTrigger class="h-8 w-full justify-between">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in effortOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
            <span class="hidden text-xs text-[#a5a9ad] sm:inline">{{ activeEffortLabel }}</span>
          </div>
          <div class="flex items-center gap-3">
            <Select v-model="selectedModel" :disabled="loadingModels || !models.length">
              <SelectTrigger data-testid="model-select" class="h-8 max-w-44 justify-between border-0 bg-transparent px-2 text-sm">
                <SelectValue :placeholder="loadingModels ? t('app.loadingModels') : activeModelLabel" />
              </SelectTrigger>
              <SelectContent align="end" class="max-h-80 min-w-60">
                <SelectItem v-for="modelOption in models" :key="modelOption.id" :value="modelOption.model || modelOption.id">
                  {{ modelOption.displayName || modelOption.model || modelOption.id }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              data-testid="send-turn-button"
              class="size-9 rounded-full bg-[#171b1f] p-0 hover:bg-[#171b1f]/90"
              :aria-label="sendButtonLabel"
              :disabled="!canSendTurn"
              @click="sendTurn"
            >
              <Loader2Icon v-if="isThreadRunning || uploadingAttachments" class="size-4 animate-spin" />
              <SendIcon v-else-if="turnText.trim() || attachedFiles.length" class="size-4" />
              <CheckIcon v-else-if="selectedThreadStatus === 'completed'" class="size-4" />
              <SendIcon v-else class="size-4 opacity-60" />
            </Button>
          </div>
        </div>
      </div>
      <p class="mt-2 text-center text-xs text-[#9aa1a6]">
        {{ selectedThreadId ? t('app.ctrlEnter') : t('app.selectThreadFirst') }}
      </p>
    </div>
  </div>
</template>
