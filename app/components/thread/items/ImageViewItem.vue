<script setup lang="ts">
import { ImageIcon } from "@lucide/vue";
import { computed } from "vue";
import ThreadImageAttachment from "@/components/thread/attachments/ThreadImageAttachment.vue";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
}>();

const { t } = useI18n();

const imageSource = computed(() => {
  if (!props.hostId || typeof props.item.path !== "string" || !props.item.path.trim()) {
    return "";
  }
  const query = new URLSearchParams({
    hostId: String(props.hostId),
    path: props.item.path,
  });
  return `/api/remote/images?${query.toString()}`;
});

const label = computed(() => String(props.item.path || t("app.imageView")));
</script>

<template>
  <div class="max-w-4xl text-ink-secondary">
    <div class="mb-2 flex items-center gap-2 text-[0.9375rem]">
      <ImageIcon class="size-4 shrink-0" />
      <span class="min-w-0 truncate">{{ label }}</span>
    </div>
    <div class="max-w-2xl">
      <ThreadImageAttachment
        v-if="imageSource"
        :source="imageSource"
        :label="label"
        :detail="t('app.imageView')"
      />
      <div
        v-else
        class="flex min-h-20 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink-muted"
      >
        <ImageIcon class="size-4 shrink-0" />
        <span class="min-w-0 truncate">{{ label }}</span>
      </div>
    </div>
  </div>
</template>
