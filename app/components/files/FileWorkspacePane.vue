<script setup lang="ts">
import { FilesIcon } from "@lucide/vue";
import { useEventListener } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useGatewayFileWorkspaceStore } from "@/stores/gateway-file-workspace";
import { useAuthStore } from "@/stores/auth";
import FilePreviewViewport from "./FilePreviewViewport.vue";
import FileWorkspaceTabs from "./FileWorkspaceTabs.vue";
import RemoteFileTree from "./RemoteFileTree.vue";

const props = defineProps<{
  layout: "desktop" | "mobile";
  hostId: number;
  projectId: number | null;
  threadId: string;
  rootPath: string;
  active: boolean;
}>();

const fileWorkspace = useGatewayFileWorkspaceStore();
const auth = useAuthStore();
auth.hydrate();
const mobileTreeOpen = ref(false);
const scope = computed(() => fileWorkspace.scopeFor(props.hostId, props.threadId));
const documents = computed(() => fileWorkspace.documentsForScope(props.hostId, props.threadId));
const activeDocument = computed(() =>
  fileWorkspace.activeDocumentFor(props.hostId, props.threadId),
);

watch(
  () =>
    [props.hostId, props.projectId, props.threadId, props.rootPath, auth.isAuthenticated] as const,
  async ([hostId, projectId, threadId, rootPath, authenticated]) => {
    if (!rootPath || !authenticated) return;
    fileWorkspace.setScopeRoot({ hostId, projectId, threadId, rootPath });
    await fileWorkspace.restoreScope(hostId, threadId);
  },
  { immediate: true },
);

watch(
  () => props.active,
  (active) => {
    if (active) void revalidateWorkspace();
  },
  { immediate: true },
);

watch(
  () => activeDocument.value?.stale,
  (stale) => {
    if (props.active && stale)
      void fileWorkspace.revalidateActiveFile(props.hostId, props.threadId);
  },
);

useEventListener(document, "visibilitychange", () => {
  if (document.visibilityState === "visible" && props.active) {
    void revalidateWorkspace();
  }
});

function openFile(path: string) {
  mobileTreeOpen.value = false;
  void fileWorkspace.openFile({
    hostId: props.hostId,
    projectId: props.projectId,
    threadId: props.threadId,
    path,
  });
}

function revalidateWorkspace() {
  if (!auth.isAuthenticated) {
    return Promise.resolve([]);
  }
  return Promise.all([
    fileWorkspace.revalidateActiveFile(props.hostId, props.threadId),
    fileWorkspace.refreshExpandedDirectories(props.hostId, props.threadId),
  ]);
}
</script>

<template>
  <div data-testid="workspace-file-panel" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <ResizablePanelGroup v-if="layout === 'desktop'" direction="horizontal">
      <ResizablePanel :default-size="22" :min-size="15" :max-size="38">
        <RemoteFileTree
          :host-id="hostId"
          :thread-id="threadId"
          :root-path="rootPath"
          @open="openFile"
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="78" :min-size="45">
        <div class="flex h-full min-h-0 flex-col overflow-hidden">
          <FileWorkspaceTabs
            :documents="documents"
            :active-path="scope?.activePath ?? null"
            @activate="fileWorkspace.activateFile(hostId, threadId, $event)"
            @close="fileWorkspace.closeFile(hostId, threadId, $event)"
          />
          <FilePreviewViewport v-if="activeDocument" :document="activeDocument" />
          <div
            v-else
            class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-canvas text-center text-ink-muted"
          >
            <FilesIcon class="size-9 text-ink-faint" />
            <div>
              <div class="text-sm font-medium text-ink">{{ $t("app.noOpenFiles") }}</div>
              <div class="mt-1 text-xs">{{ $t("app.chooseFileFromTree") }}</div>
            </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>

    <template v-else>
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div class="flex shrink-0 items-stretch border-b border-hairline">
          <Button
            variant="ghost"
            size="sm"
            class="h-10 shrink-0 rounded-none border-r border-hairline px-3"
            @click="mobileTreeOpen = true"
          >
            <FilesIcon class="size-4" />
            {{ $t("app.fileTree") }}
          </Button>
          <FileWorkspaceTabs
            class="min-w-0 flex-1 border-b-0"
            :documents="documents"
            :active-path="scope?.activePath ?? null"
            @activate="fileWorkspace.activateFile(hostId, threadId, $event)"
            @close="fileWorkspace.closeFile(hostId, threadId, $event)"
          />
        </div>
        <FilePreviewViewport v-if="activeDocument" :document="activeDocument" />
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center gap-3 bg-canvas text-center text-ink-muted"
        >
          <FilesIcon class="size-9 text-ink-faint" />
          <Button variant="outline" size="sm" @click="mobileTreeOpen = true">
            {{ $t("app.openFileTree") }}
          </Button>
        </div>
      </div>

      <Sheet v-model:open="mobileTreeOpen">
        <SheetContent side="left" class="w-[min(88vw,24rem)] p-0">
          <SheetHeader class="sr-only">
            <SheetTitle>{{ $t("app.fileTree") }}</SheetTitle>
            <SheetDescription>{{ rootPath }}</SheetDescription>
          </SheetHeader>
          <RemoteFileTree
            :host-id="hostId"
            :thread-id="threadId"
            :root-path="rootPath"
            @open="openFile"
          />
        </SheetContent>
      </Sheet>
    </template>
  </div>
</template>
