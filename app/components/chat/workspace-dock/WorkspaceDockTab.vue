<script setup lang="ts">
import type { IDockviewPanelHeaderProps } from "dockview-vue";
import { PanelRightOpenIcon, XIcon } from "@lucide/vue";

import { computed, onBeforeUnmount, ref } from "vue";
import type { WorkspaceDockPanelParams } from "./types";
import { requireWorkspaceDockUiContext } from "./context";
import { splitDockPanelRight } from "./actions";
import { workspacePanelPolicy } from "./panel-registry";

const props = defineProps<{ params: IDockviewPanelHeaderProps<WorkspaceDockPanelParams> }>();
const context = requireWorkspaceDockUiContext();
const kind = computed(() => props.params.params.kind);
const title = ref(props.params.api.title ?? "");
const titleSubscription = props.params.api.onDidTitleChange((event) => {
  title.value = event.title;
});
onBeforeUnmount(() => titleSubscription.dispose());
const policy = computed(() => workspacePanelPolicy(kind.value));

function splitRight(event: MouseEvent) {
  event.stopPropagation();
  splitDockPanelRight(props.params.api);
}

function closePanel(event: MouseEvent) {
  event.stopPropagation();
  const panel = props.params.containerApi.getPanel(props.params.api.id);
  if (panel) context.closePanel(panel);
}

function toggleMaximize() {
  if (context.layout.value === "mobile") return;
  if (props.params.api.isMaximized()) {
    props.params.api.exitMaximized();
  } else {
    props.params.api.maximize();
  }
}
</script>

<template>
  <div
    data-testid="workspace-dock-tab"
    :data-panel-kind="kind"
    :data-panel-title="title"
    class="group flex h-full min-w-0 items-center gap-1.5 px-2 text-sm"
    @dblclick="toggleMaximize"
  >
    <component :is="policy.icon" class="size-3.5 shrink-0" />
    <span class="max-w-[11rem] truncate" :title="title">{{ title }}</span>
    <button
      v-if="kind === 'files' && context.layout.value === 'desktop'"
      type="button"
      class="ml-1 inline-flex size-5 items-center justify-center rounded text-ink-faint opacity-0 hover:bg-canvas-soft hover:text-ink group-hover:opacity-100"
      :aria-label="$t('app.splitRight')"
      @click="splitRight"
    >
      <PanelRightOpenIcon class="size-3.5" />
    </button>
    <button
      v-if="policy.closable"
      type="button"
      class="ml-1 inline-flex size-5 items-center justify-center rounded text-ink-faint opacity-70 hover:bg-canvas-soft hover:text-ink"
      :aria-label="$t('app.closeTab')"
      @click="closePanel"
    >
      <XIcon class="size-3" />
    </button>
  </div>
</template>
