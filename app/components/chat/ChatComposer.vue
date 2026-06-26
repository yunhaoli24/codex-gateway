<script setup lang="ts">
import {
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  FileIcon,
  HandIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  XIcon,
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import type { ApprovalPolicy, ReasoningEffort, UploadedFileRecord } from '~~/shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  selectedThreadTokenUsage,
  models,
  loadingModels,
  defaultModel,
} = storeToRefs(store)

const turnText = ref('')
const selectedModel = ref('')
const selectedEffort = ref<ReasoningEffort | 'default'>('default')
const selectedApprovalMode = ref<ApprovalPolicy | 'custom'>('custom')
const attachedFiles = ref<Array<UploadedFileRecord & { id: string, dataUrl?: string }>>([])
const uploadInputRef = ref<HTMLInputElement | null>(null)
const uploadingAttachments = ref(false)

const approvalOptions: Array<{ value: ApprovalPolicy | 'custom', icon: any, labelKey: string, shortLabelKey: string, descriptionKey: string }> = [
  { value: 'untrusted', icon: HandIcon, labelKey: 'approvalAsk', shortLabelKey: 'approvalAskShort', descriptionKey: 'approvalAskDescription' },
  { value: 'on-request', icon: ShieldCheckIcon, labelKey: 'approvalAuto', shortLabelKey: 'approvalAutoShort', descriptionKey: 'approvalAutoDescription' },
  { value: 'never', icon: ShieldAlertIcon, labelKey: 'approvalFullAccess', shortLabelKey: 'approvalFullAccessShort', descriptionKey: 'approvalFullAccessDescription' },
  { value: 'custom', icon: SettingsIcon, labelKey: 'approvalCustom', shortLabelKey: 'approvalCustomShort', descriptionKey: 'approvalCustomDescription' },
]

let syncingSettings = false

const visibleEvents = computed(() => events.value.filter((event) => shouldShowEvent(event.method)))
const activeEvents = computed(() => visibleEvents.value.slice(-8))
const isThreadRunning = computed(() => selectedThreadStatus.value === 'running')
const hasComposerInput = computed(() => Boolean(turnText.value.trim() || attachedFiles.value.length))
const canSendTurn = computed(() => Boolean(selectedThreadId.value && hasComposerInput.value && !uploadingAttachments.value))
const activeModel = computed(() => selectedModel.value || defaultModel.value?.model || defaultModel.value?.id || '')
const activeModelRecord = computed(() => models.value.find((candidate) => candidate.model === activeModel.value || candidate.id === activeModel.value))
const activeModelLabel = computed(() => {
  const model = activeModelRecord.value
  return model?.displayName || model?.model || activeModel.value || '模型'
})
const activeEffortValue = computed(() => {
  return selectedEffort.value !== 'default'
    ? selectedEffort.value
    : activeModelRecord.value?.defaultReasoningEffort || ''
})
const effortOptions = computed(() => {
  const supportedEfforts = activeModelRecord.value?.supportedReasoningEfforts ?? []
  const options = supportedEfforts.map((option) => ({
    value: option.reasoningEffort,
    label: option.reasoningEffort,
  }))
  if (selectedEffort.value !== 'default' && !options.some((option) => option.value === selectedEffort.value)) {
    options.unshift({ value: selectedEffort.value, label: selectedEffort.value })
  }
  return options
})
const activeEffortLabel = computed(() => labelEffortOption(effortOptions.value.find((option) => option.value === selectedEffort.value)))
const activeEffortCompactLabel = computed(() => compactEffortLabel(activeEffortValue.value))
const activeApprovalOption = computed(() => approvalOptions.find((option) => option.value === selectedApprovalMode.value) ?? approvalOptions.at(-1)!)
const BASELINE_CONTEXT_TOKENS = 12000
const contextRemainingPercent = computed(() => {
  const usage = selectedThreadTokenUsage.value
  const totalTokens = usage?.total?.totalTokens
  const contextWindow = usage?.modelContextWindow
  if (!totalTokens || !contextWindow) {
    return null
  }
  if (contextWindow <= BASELINE_CONTEXT_TOKENS) {
    return 0
  }
  const effectiveWindow = contextWindow - BASELINE_CONTEXT_TOKENS
  const used = Math.max(0, totalTokens - BASELINE_CONTEXT_TOKENS)
  const remaining = Math.max(0, effectiveWindow - used)
  return Math.min(100, Math.max(0, Math.round((remaining / effectiveWindow) * 100)))
})
const contextUsageStyle = computed(() => {
  const percent = contextRemainingPercent.value ?? 0
  return {
    background: `conic-gradient(#8f969d ${percent}%, #d8dde1 0)`,
  }
})
const contextUsageLabel = computed(() => contextRemainingPercent.value == null ? null : `${contextRemainingPercent.value}%`)
const sendButtonLabel = computed(() => {
  if (hasComposerInput.value) return t('app.send')
  if (isThreadRunning.value) return '运行中'
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

function compactEffortLabel(value: string) {
  if (!value) return ''
  const normalized = value.toLowerCase().replaceAll('_', '-')
  const knownLabels: Record<string, string> = {
    low: 'Light',
    light: 'Light',
    medium: 'Medium',
    high: 'High',
    'extra-high': 'Extra High',
    xhigh: 'Extra High',
  }
  if (knownLabels[normalized]) {
    return knownLabels[normalized]
  }
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function labelEffortOption(option: { value: ReasoningEffort, label?: string } | undefined) {
  if (!option) return activeEffortCompactLabel.value || t('app.reasoningDefault')
  return compactEffortLabel(option.label || option.value)
}

function modelOptionValue(modelOption: { model?: string, id: string }) {
  return modelOption.model || modelOption.id
}

function setSelectedModel(model: string) {
  selectedModel.value = model
}

function setSelectedEffort(effort: ReasoningEffort) {
  selectedEffort.value = effort
}

function syncComposerFromThreadSettings() {
  syncingSettings = true
  selectedModel.value = selectedThreadSettings.value.model || defaultModel.value?.model || defaultModel.value?.id || ''
  selectedEffort.value = selectedThreadSettings.value.effort || 'default'
  selectedApprovalMode.value = selectedThreadSettings.value.approvalPolicy || 'custom'
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

watch(selectedApprovalMode, (approvalPolicy) => {
  if (syncingSettings || !selectedThreadId.value) {
    return
  }
  void store.saveSelectedThreadSettings({ approvalPolicy: approvalPolicy === 'custom' ? null : approvalPolicy })
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
    approvalPolicy: selectedApprovalMode.value === 'custom' ? undefined : selectedApprovalMode.value,
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

function selectApprovalMode(value: ApprovalPolicy | 'custom') {
  selectedApprovalMode.value = value
}
</script>

<template>
  <div class="shrink-0 bg-gradient-to-t from-white via-white to-white/75 px-8 pb-5">
    <div class="mx-auto max-w-[760px]">
      <div v-if="activeEvents.length" class="mb-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-[#6f767d] shadow-sm">
        <CircleIcon class="size-3.5 text-sky-300" />
        {{ eventLabel(activeEvents.at(-1)?.method || '') }}
      </div>

      <div class="rounded-[28px] border border-black/10 bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
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
          class="min-h-28 border-0 bg-transparent px-1 !text-xl !leading-8 shadow-none ring-0 placeholder:!text-xl placeholder:!text-[#9aa1a6] focus-visible:ring-0 md:!text-xl"
          :placeholder="t('app.askFollowUp')"
          :disabled="!selectedThreadId"
          @keydown="handleComposerKeydown"
          @paste="handlePaste"
        />
        <div class="flex items-center justify-between pt-2">
          <div class="flex items-center gap-1 text-xl text-[#858b91]">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              class="text-[#858b91] hover:bg-black/[0.04] hover:text-[#4f575e]"
              :disabled="uploadingAttachments || !selectedThreadId"
              :aria-label="t('app.attachFile')"
              @click="openAttachmentPicker"
            >
              <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
              <PlusIcon v-else class="size-5" />
            </Button>
            <Popover>
              <PopoverTrigger as-child>
                <Button type="button" variant="ghost" size="lg" class="h-10 gap-2 px-2 text-xl font-normal text-[#858b91] hover:bg-black/[0.04] hover:text-[#4f575e]">
                  <SettingsIcon class="size-5" />
                  <span>{{ t(`app.${activeApprovalOption.shortLabelKey}`) }}</span>
                  <ChevronDownIcon class="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" class="w-[560px] gap-1 rounded-[22px] p-2 shadow-[0_18px_60px_rgba(15,23,42,0.16)]">
                <div class="flex items-center gap-4 px-3 py-2 text-base text-[#858b91]">
                  <span>{{ t('app.approvalQuestion') }}</span>
                  <button type="button" class="underline underline-offset-4 hover:text-[#202225]">
                    {{ t('app.learnMore') }}
                  </button>
                </div>
                <button
                  v-for="option in approvalOptions"
                  :key="option.value"
                  type="button"
                  class="grid w-full grid-cols-[32px_1fr_24px] items-center gap-4 rounded-xl px-3 py-2.5 text-left hover:bg-black/[0.04]"
                  :class="option.value === selectedApprovalMode ? 'bg-black/[0.04]' : ''"
                  @click="selectApprovalMode(option.value)"
                >
                  <component :is="option.icon" class="size-5 text-[#5f6970]" />
                  <span class="min-w-0">
                    <span class="block text-lg leading-6 text-[#202225]">{{ t(`app.${option.labelKey}`) }}</span>
                    <span class="block truncate text-base leading-6 text-[#858b91]">{{ t(`app.${option.descriptionKey}`) }}</span>
                  </span>
                  <CheckIcon v-if="option.value === selectedApprovalMode" class="size-5 text-[#202225]" />
                </button>
              </PopoverContent>
            </Popover>
          </div>
          <div class="flex items-center gap-2">
            <div v-if="contextUsageLabel" class="flex items-center gap-2 text-xl text-[#858b91]" :title="t('app.contextUsage', { percent: contextRemainingPercent })">
              <div
                class="flex size-6 items-center justify-center rounded-full"
                :style="contextUsageStyle"
              >
                <div class="size-3.5 rounded-full bg-white" />
              </div>
              <span>{{ contextUsageLabel }}</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button type="button" variant="ghost" size="lg" class="h-10 gap-2.5 px-2 text-xl font-normal text-[#4f575e] hover:bg-black/[0.04]" data-testid="model-select" :disabled="loadingModels || !models.length">
                  <span class="text-[#202225]">{{ loadingModels ? t('app.loadingModels') : activeModelLabel }}</span>
                  <span v-if="activeEffortCompactLabel" class="text-[#858b91]">{{ activeEffortCompactLabel }}</span>
                  <ChevronDownIcon class="size-4 text-[#858b91]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-[300px] rounded-[22px] p-2 shadow-[0_18px_60px_rgba(15,23,42,0.16)]">
                <DropdownMenuLabel class="px-3 pb-2 pt-1 text-lg font-normal leading-7 text-[#858b91]">
                  {{ t('app.reasoningEffort') }}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="option in effortOptions"
                  :key="option.value"
                  class="h-14 rounded-xl px-3 text-xl leading-none text-[#202225] focus:bg-black/[0.04]"
                  @select="setSelectedEffort(option.value)"
                >
                  <span>{{ labelEffortOption(option) }}</span>
                  <CheckIcon v-if="option.value === activeEffortValue" class="ml-auto size-5 text-[#5f6970]" />
                </DropdownMenuItem>
                <DropdownMenuSeparator class="mx-3 my-2" />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger class="h-14 rounded-xl px-3 text-xl leading-none text-[#202225] data-open:bg-black/[0.04] focus:bg-black/[0.04] [&>svg]:size-5 [&>svg]:text-[#858b91]">
                    <span>{{ activeModelLabel }}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent class="w-[330px] rounded-[22px] p-2 shadow-[0_18px_60px_rgba(15,23,42,0.16)]">
                    <DropdownMenuLabel class="px-3 pb-2 pt-1 text-lg font-normal leading-7 text-[#858b91]">
                      {{ t('app.model') }}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      v-for="modelOption in models"
                      :key="modelOption.id"
                      class="h-14 rounded-xl px-3 text-xl leading-none text-[#202225] focus:bg-black/[0.04]"
                      @select="setSelectedModel(modelOptionValue(modelOption))"
                    >
                      <span class="truncate">{{ modelOption.displayName || modelOption.model || modelOption.id }}</span>
                      <CheckIcon v-if="modelOptionValue(modelOption) === activeModel" class="ml-auto size-5 text-[#5f6970]" />
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              data-testid="send-turn-button"
              class="size-12 rounded-full bg-[#171b1f] p-0 hover:bg-[#171b1f]/90"
              :aria-label="sendButtonLabel"
              :disabled="!canSendTurn"
              @click="sendTurn"
            >
              <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
              <SendIcon v-else-if="hasComposerInput" class="size-5" />
              <CheckIcon v-else-if="selectedThreadStatus === 'completed'" class="size-5" />
              <SendIcon v-else class="size-5 opacity-60" />
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
