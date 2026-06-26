<script setup lang="ts">
import { CheckIcon, CopyIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { threadItemText } from '@/utils/thread-items'

const props = defineProps<{ item: Record<string, any> }>()

const { t } = useI18n()
const text = computed(() => threadItemText(props.item))
const copied = ref(false)

async function copyText() {
  if (!text.value) return
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = true
    toast.success(t('app.agentOutputCopied'))
    window.setTimeout(() => {
      copied.value = false
    }, 1200)
  } catch {
    toast.error(t('app.copyAgentOutputFailed'))
  }
}
</script>

<template>
  <div class="group max-w-[840px] text-[15px] leading-8 text-[#202225]">
    <MarkdownContent :content="text" />
    <div v-if="text" class="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="size-8 p-0 text-[#8d9499] hover:bg-black/[0.04] hover:text-[#202225]"
              :aria-label="t('app.copyAgentOutput')"
              @click="copyText"
            >
              <CheckIcon v-if="copied" class="size-4 text-emerald-600" />
              <CopyIcon v-else class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ t('app.copyAgentOutput') }}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </div>
</template>
