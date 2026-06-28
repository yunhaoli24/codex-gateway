<script setup lang="ts">
import { CopyIcon, MoveIcon, RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from "@lucide/vue";
import { toast } from "vue-sonner";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

const props = defineProps<{
  source: string;
  title: string;
  description?: string | null;
  alt?: string | null;
}>();

const open = defineModel<boolean>("open", { default: false });
const { t } = useI18n();

const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const dragging = ref(false);
const dragStart = ref({ pointerId: 0, x: 0, y: 0, offsetX: 0, offsetY: 0 });

const zoomValue = computed({
  get: () => [Math.round(scale.value * 100)],
  set: (value: number[]) => {
    scale.value = clampScale((value[0] ?? 100) / 100);
  },
});
const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`);
const imageTransform = computed(
  () => `translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`,
);
const altText = computed(() => props.alt || props.title);

watch(open, (value) => {
  if (value) {
    resetView();
  }
});

function clampScale(value: number) {
  return Math.min(6, Math.max(0.25, Number(value.toFixed(2))));
}

function zoomBy(delta: number) {
  scale.value = clampScale(scale.value + delta);
}

function resetView() {
  scale.value = 1;
  offset.value = { x: 0, y: 0 };
  dragging.value = false;
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();
  scale.value = clampScale(scale.value + (event.deltaY > 0 ? -0.15 : 0.15));
}

function startDrag(event: PointerEvent) {
  dragging.value = true;
  dragStart.value = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    offsetX: offset.value.x,
    offsetY: offset.value.y,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function dragImage(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== dragStart.value.pointerId) {
    return;
  }
  offset.value = {
    x: dragStart.value.offsetX + event.clientX - dragStart.value.x,
    y: dragStart.value.offsetY + event.clientY - dragStart.value.y,
  };
}

function stopDrag(event: PointerEvent) {
  if (event.pointerId === dragStart.value.pointerId) {
    dragging.value = false;
  }
}

async function copyImage() {
  try {
    const response = await fetch(props.source);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      throw new Error("Response is not an image");
    }
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    toast.success(t("app.imageCopied"));
  } catch {
    toast.error(t("app.copyImageFailed"));
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      class="flex h-[92vh] w-[96vw] max-w-none grid-rows-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      :show-close-button="true"
    >
      <DialogHeader class="shrink-0 border-b border-hairline px-4 py-3 pr-12">
        <DialogTitle class="truncate text-sm font-medium">{{ title }}</DialogTitle>
        <DialogDescription v-if="description" class="truncate text-xs">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div
        class="relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden bg-canvas-soft"
        :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
        data-testid="image-viewer"
        @wheel="handleWheel"
        @pointerdown="startDrag"
        @pointermove="dragImage"
        @pointerup="stopDrag"
        @pointercancel="stopDrag"
      >
        <img
          :src="source"
          :alt="altText"
          class="h-full w-full object-contain will-change-transform"
          draggable="false"
          :style="{ transform: imageTransform }"
        />
        <div
          class="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface/90 px-2 py-1 text-xs text-ink-muted shadow-sm"
        >
          <MoveIcon class="size-3.5" />
          {{ zoomLabel }}
        </div>
      </div>

      <div
        class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-hairline bg-surface px-4 py-3"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            :aria-label="t('app.zoomOut')"
            @click="zoomBy(-0.25)"
          >
            <ZoomOutIcon class="size-4" />
          </Button>
          <Slider
            v-model="zoomValue"
            class="max-w-48"
            :min="25"
            :max="600"
            :step="5"
            :aria-label="t('app.imageZoom')"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            :aria-label="t('app.zoomIn')"
            @click="zoomBy(0.25)"
          >
            <ZoomInIcon class="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="min-w-16"
            :aria-label="t('app.resetImageView')"
            @click="resetView"
          >
            <RotateCcwIcon class="size-4" />
            {{ zoomLabel }}
          </Button>
        </div>
        <Button type="button" variant="secondary" size="sm" class="gap-2" @click="copyImage">
          <CopyIcon class="size-4" />
          {{ t("app.copyImage") }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
