<script setup lang="ts">
import { ClipboardPasteIcon, EyeIcon, FolderIcon, FolderOpenIcon, PlusIcon } from "@lucide/vue";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import type { RemoteDirectoryEntry } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import ConfigJsonEditor from "@/components/settings/ConfigJsonEditor.vue";
import HostEditList from "@/components/settings/HostEditList.vue";
import { useGatewayStore } from "@/stores/gateway";

const emit = defineEmits<{ close: [] }>();
const store = useGatewayStore();
const { selectedHostId } = storeToRefs(store);
const { t } = useI18n();

const hostForm = ref({
  name: "",
  sshHost: "",
  username: "",
  port: null as number | null,
  authMode: "agent",
  privateKeyPath: "",
  privateKey: "",
  password: "",
  proxyUrl: "socks5h://127.0.0.1:7890",
});

const projectForm = ref({ name: "", remotePath: "" });
const configText = ref("");
const configError = ref("");
const directoryPath = ref("~");
const directories = ref<RemoteDirectoryEntry[]>([]);
const directoryError = ref("");
const browsing = ref(false);
const visibleDirectories = computed(() =>
  directories.value.filter((entry) => entry.type === "directory").slice(0, 12),
);

async function createHost() {
  await store.createHost({
    ...hostForm.value,
    username: hostForm.value.username || null,
    privateKeyPath: hostForm.value.privateKeyPath || null,
    privateKey: hostForm.value.privateKey || null,
    password: hostForm.value.password || null,
    port: hostForm.value.port ? Number(hostForm.value.port) : null,
    proxyUrl: hostForm.value.proxyUrl || null,
  });
  hostForm.value = {
    name: "",
    sshHost: "",
    username: "",
    port: null,
    authMode: "agent",
    privateKeyPath: "",
    privateKey: "",
    password: "",
    proxyUrl: "socks5h://127.0.0.1:7890",
  };
  emit("close");
}

function showConfig() {
  configError.value = "";
  configText.value = store.exportConfigText();
}

async function importConfig() {
  configError.value = "";
  try {
    await store.importConfigText(configText.value);
    emit("close");
  } catch (error: any) {
    configError.value = error?.data?.message || error?.message || t("app.importConfigFailed");
  }
}

async function createProject() {
  if (!selectedHostId.value) return;
  await store.createProject({
    hostId: selectedHostId.value,
    name: projectForm.value.name,
    remotePath: projectForm.value.remotePath,
  });
  projectForm.value = { name: "", remotePath: "" };
  emit("close");
}

async function browseDirectories() {
  if (!selectedHostId.value) return;
  browsing.value = true;
  directoryError.value = "";
  try {
    const result = await store.listRemoteDirectories(directoryPath.value || "~");
    directoryPath.value = result.path;
    directories.value = result.entries;
  } catch (error: any) {
    directories.value = [];
    directoryError.value = error?.data?.message || error?.message || t("app.browseFailed");
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
</script>

<template>
  <Tabs data-testid="settings-panel" default-value="config" class="flex min-h-0 flex-1 flex-col">
    <TabsList class="mb-4">
      <TabsTrigger value="config">{{ t("app.configJson") }}</TabsTrigger>
      <TabsTrigger value="hosts">{{ t("app.hosts") }}</TabsTrigger>
      <TabsTrigger value="projects">{{ t("app.projects") }}</TabsTrigger>
    </TabsList>

    <TabsContent value="config" class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div class="shrink-0 text-sm text-[#6f767d]">{{ t("app.configJsonPlaceholder") }}</div>
      <ConfigJsonEditor v-model="configText" :placeholder="t('app.configJsonPlaceholder')" />
      <div v-if="configError" class="shrink-0 rounded-md bg-red-50 p-3 text-sm text-red-700">
        {{ configError }}
      </div>
      <div class="flex shrink-0 justify-end gap-2">
        <Button variant="secondary" @click="showConfig">
          <EyeIcon class="size-4" />
          {{ t("app.viewConfig") }}
        </Button>
        <Button :disabled="!configText.trim()" @click="importConfig">
          <ClipboardPasteIcon class="size-4" />
          {{ t("app.importConfig") }}
        </Button>
      </div>
    </TabsContent>

    <TabsContent value="hosts" class="min-h-0 flex-1 overflow-y-auto">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-3">
          <div class="font-medium">{{ t("app.addHost") }}</div>
          <Input
            v-model="hostForm.name"
            data-testid="host-name-input"
            :aria-label="t('app.hostName')"
            :placeholder="t('app.hostName')"
          />
          <Input
            v-model="hostForm.sshHost"
            data-testid="host-ssh-input"
            :aria-label="t('app.sshHost')"
            :placeholder="t('app.sshHost')"
          />
          <div class="grid grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)] gap-2">
            <Input
              v-model="hostForm.username"
              :aria-label="t('app.user')"
              :placeholder="t('app.user')"
            />
            <Input
              v-model="hostForm.port"
              :aria-label="t('app.port')"
              type="number"
              :placeholder="t('app.port')"
            />
          </div>
          <Input
            v-model="hostForm.proxyUrl"
            data-testid="host-proxy-url-input"
            :aria-label="t('app.sshProxy')"
            :placeholder="t('app.sshProxyPlaceholder')"
          />
          <Select v-model="hostForm.authMode">
            <SelectTrigger
              data-testid="host-auth-select"
              class="w-full bg-white"
              :aria-label="t('app.auth')"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">{{ t("app.sshAgent") }}</SelectItem>
              <SelectItem value="privateKey">{{ t("app.privateKeyPath") }}</SelectItem>
              <SelectItem data-testid="host-auth-password-option" value="password">密码</SelectItem>
            </SelectContent>
          </Select>
          <Input
            v-if="hostForm.authMode === 'privateKey'"
            v-model="hostForm.privateKeyPath"
            :aria-label="t('app.privateKeyPath')"
            :placeholder="t('app.privateKeyPath')"
          />
          <Textarea
            v-if="hostForm.authMode === 'privateKey'"
            v-model="hostForm.privateKey"
            class="min-h-44 bg-white font-mono text-sm"
            :aria-label="t('app.privateKey')"
            :placeholder="t('app.privateKey')"
          />
          <Input
            v-if="hostForm.authMode === 'password'"
            v-model="hostForm.password"
            aria-label="密码"
            type="password"
            placeholder="SSH 密码"
          />
          <Button
            data-testid="add-host-button"
            class="w-full"
            :disabled="!hostForm.name || !hostForm.sshHost"
            @click="createHost"
          >
            <PlusIcon class="size-4" />
            {{ t("app.addHost") }}
          </Button>
        </div>
        <HostEditList />
      </div>
    </TabsContent>

    <TabsContent value="projects" class="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <div class="font-medium">{{ t("app.addProject") }}</div>
      <div class="grid grid-cols-[1fr_auto] gap-2">
        <Input
          v-model="directoryPath"
          data-testid="project-browse-path-input"
          :aria-label="t('app.remotePath')"
          :placeholder="t('app.remotePath')"
        />
        <Button
          variant="secondary"
          :disabled="!selectedHostId || browsing"
          @click="browseDirectories"
        >
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
      <div v-if="directoryError" class="rounded-md bg-red-50 p-3 text-sm text-red-700">
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
      <Button
        data-testid="add-project-button"
        class="w-full"
        :disabled="!selectedHostId || !projectForm.name || !projectForm.remotePath"
        @click="createProject"
      >
        <FolderIcon class="size-4" />
        {{ t("app.addProject") }}
      </Button>
    </TabsContent>
  </Tabs>
</template>
