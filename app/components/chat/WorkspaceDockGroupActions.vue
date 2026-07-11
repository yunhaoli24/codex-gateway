<script setup lang="ts">
import type { IDockviewHeaderActionsProps } from "dockview-vue";
import { ArrowDownToLineIcon, Maximize2Icon, PictureInPicture2Icon, Rows3Icon } from "@lucide/vue";
import { onBeforeUnmount, ref } from "vue";
import { Button } from "@/components/ui/button";
import { floatDockItem, popoutDockItem } from "./workspace-dock-actions";

const props = defineProps<{ params?: IDockviewHeaderActionsProps }>();
if (!props.params) throw new Error("Dockview header action parameters are unavailable");
const params = props.params;
const { t } = useI18n();
const location = ref(params.group.api.location.type);
const locationSubscription = params.group.api.onDidLocationChange((event) => {
  location.value = event.location.type;
});
onBeforeUnmount(() => locationSubscription.dispose());

function toggleMaximize() {
  const api = params.group.api;
  if (api.isMaximized()) {
    api.exitMaximized();
  } else {
    api.maximize();
  }
}

function toggleFloating() {
  if (location.value === "floating" || location.value === "popout") {
    params.group.api.moveTo({ position: "right" });
  } else {
    floatDockItem(params.containerApi, params.group);
  }
}

function popout() {
  void popoutDockItem(params.containerApi, params.group, {
    title: t("app.popupBlocked"),
    description: t("app.popupBlockedDescription"),
  });
}
</script>

<template>
  <div class="flex h-full items-center gap-0.5 px-1">
    <Button
      variant="ghost"
      size="icon-sm"
      class="size-7"
      :aria-label="$t('app.maximizePanel')"
      @click="toggleMaximize"
    >
      <Maximize2Icon class="size-3.5" />
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      class="size-7"
      :aria-label="$t('app.floatPanel')"
      @click="toggleFloating"
    >
      <Rows3Icon v-if="location === 'floating' || location === 'popout'" class="size-3.5" />
      <PictureInPicture2Icon v-else class="size-3.5" />
    </Button>
    <Button
      v-if="location !== 'popout'"
      data-testid="dock-popout-group"
      variant="ghost"
      size="icon-sm"
      class="size-7"
      :aria-label="$t('app.popoutPanel')"
      @click="popout"
    >
      <ArrowDownToLineIcon class="size-3.5" />
    </Button>
  </div>
</template>
