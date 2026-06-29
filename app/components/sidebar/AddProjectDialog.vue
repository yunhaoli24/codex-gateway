<script setup lang="ts">
import { FolderIcon, FolderOpenIcon } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import type { HostRecord, ProjectRecord, RemoteDirectoryEntry } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useGatewayStore } from "@/stores/gateway";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
  host: HostRecord | null;
  project?: ProjectRecord | null;
}>();

const store = useGatewayStore();
const { t } = useI18n();
const errorLabels = computed(() => errorMessageLabels(t));
const projectForm = ref({ name: "", remotePath: "" });
const directoryPath = ref("~");
const directories = ref<RemoteDirectoryEntry[]>([]);
const directoryError = ref("");
const browsing = ref(false);
const saving = ref(false);
const visibleDirectories = computed(() =>
  directories.value.filter((entry) => entry.type === "directory").slice(0, 12),
);
const editing = computed(() => Boolean(props.project));

watch(open, (isOpen) => {
  if (isOpen) {
    resetForm();
  }
});

async function saveProject() {
  if (!props.host || !projectForm.value.name || !projectForm.value.remotePath) {
    return;
  }
  saving.value = true;
  try {
    const input = {
      hostId: props.host.id,
      name: projectForm.value.name,
      remotePath: projectForm.value.remotePath,
    };
    if (props.project) {
      await store.updateProject(props.project.id, input);
    } else {
      await store.createProject(input);
    }
    open.value = false;
  } finally {
    saving.value = false;
  }
}

async function browseDirectories() {
  if (!props.host) {
    return;
  }
  browsing.value = true;
  directoryError.value = "";
  try {
    const result = await store.listRemoteDirectories(directoryPath.value || "~", props.host.id);
    directoryPath.value = result.path;
    directories.value = result.entries;
  } catch (error: any) {
    directories.value = [];
    directoryError.value = messageFromError(error, t("app.browseFailed"), errorLabels.value);
  } finally {
    browsing.value = false;
  }
}

function chooseDirectory(entry: RemoteDirectoryEntry) {
  directoryPath.value = entry.path;
  projectForm.value.remotePath = entry.path;
  if (!projectForm.value.name) {
    projectForm.value.name = entry.name;
  }
}

function resetForm() {
  projectForm.value = props.project
    ? { name: props.project.name, remotePath: props.project.remotePath }
    : { name: "", remotePath: "" };
  directoryPath.value = props.project?.remotePath || "~";
  directories.value = [];
  directoryError.value = "";
  browsing.value = false;
  saving.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[min(42rem,calc(100vh-2rem))] flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>{{ editing ? t("app.editProject") : t("app.addProject") }}</DialogTitle>
        <DialogDescription>
          {{
            t(editing ? "app.editProjectDescription" : "app.addProjectDescription", {
              host: host?.name ?? "",
            })
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <div class="grid grid-cols-[1fr_auto] gap-2">
          <Input
            v-model="directoryPath"
            data-testid="project-browse-path-input"
            :aria-label="t('app.remotePath')"
            :placeholder="t('app.remotePath')"
          />
          <Button variant="secondary" :disabled="!host || browsing" @click="browseDirectories">
            <FolderOpenIcon class="size-4" />
            {{ t("app.browse") }}
          </Button>
        </div>

        <div v-if="visibleDirectories.length" class="grid grid-cols-2 gap-1">
          <Button
            v-for="entry in visibleDirectories"
            :key="entry.path"
            variant="ghost"
            class="h-9 justify-start gap-2 px-2 text-sm font-normal"
            @click="chooseDirectory(entry)"
          >
            <FolderIcon class="size-4 shrink-0" />
            <span class="truncate">{{ entry.name }}</span>
          </Button>
        </div>

        <div
          v-if="directoryError"
          class="whitespace-pre-line rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          {{ directoryError }}
        </div>

        <Separator />

        <div class="grid gap-3 md:grid-cols-2">
          <Input
            v-model="projectForm.name"
            data-testid="project-name-input"
            :aria-label="t('app.projectName')"
            :placeholder="t('app.projectName')"
          />
          <Input
            v-model="projectForm.remotePath"
            data-testid="project-path-input"
            :aria-label="t('app.remotePath')"
            :placeholder="t('app.remotePath')"
          />
        </div>
      </div>

      <Button
        data-testid="add-project-button"
        class="w-full"
        :disabled="!host || !projectForm.name || !projectForm.remotePath || saving"
        @click="saveProject"
      >
        <FolderIcon class="size-4" />
        {{ editing ? t("app.saveProject") : t("app.addProject") }}
      </Button>
    </DialogContent>
  </Dialog>
</template>
