<script setup lang="ts">
import { ImageIcon, Maximize2Icon } from "@lucide/vue";
import { computed, ref, toRef } from "vue";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ImageViewer from "@/components/common/ImageViewer.vue";
import { useAuthorizedObjectUrl } from "@/composables/files/useAuthorizedObjectUrl";

const props = defineProps<{
  source: string;
  label?: string | null;
  detail?: string | null;
}>();

const { t } = useI18n();
const open = ref(false);

const altText = computed(() => props.label || props.detail || t("app.imageAttachment"));
const { objectUrl, loading, error } = useAuthorizedObjectUrl(toRef(props, "source"));
</script>

<template>
  <div>
    <div class="group relative overflow-hidden rounded-lg border border-hairline bg-surface">
      <button
        type="button"
        data-testid="thread-image-attachment"
        class="block w-full cursor-zoom-in"
        :aria-label="t('app.openImagePreview')"
        @dblclick="open = true"
        @keydown.enter="open = true"
      >
        <img
          v-if="objectUrl"
          :src="objectUrl"
          :alt="altText"
          class="max-h-72 w-full bg-surface object-contain"
        />
        <div v-else class="flex min-h-24 items-center gap-2 px-3 py-2 text-sm text-ink-secondary">
          <ImageIcon class="size-4 shrink-0" />
          <span class="min-w-0 truncate">{{
            loading ? t("app.loadingGateway") : error?.message || label || source
          }}</span>
        </div>
      </button>
      <div
        class="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                class="pointer-events-auto bg-surface/95 shadow-sm"
                :aria-label="t('app.openImagePreview')"
                @click="open = true"
              >
                <Maximize2Icon class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ t("app.openImagePreview") }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <ImageViewer
      v-model:open="open"
      :source="objectUrl || source"
      :title="altText"
      :description="detail || label || source"
      :alt="altText"
    />
  </div>
</template>
