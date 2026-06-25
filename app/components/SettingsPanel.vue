<script setup lang="ts">
import { FolderIcon, FolderOpenIcon, PlusIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { RemoteDirectoryEntry } from '~~/shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useGatewayStore } from '@/stores/gateway'

const store = useGatewayStore()
const { selectedHostId } = storeToRefs(store)
const { t } = useI18n()

const hostForm = ref({
  name: '',
  sshHost: '',
  username: '',
  port: null as number | null,
  authMode: 'agent',
  privateKeyPath: '',
  password: '',
  appServerMode: 'stdio',
  appServerUrl: '',
})

const projectForm = ref({ name: '', remotePath: '' })
const directoryPath = ref('~')
const directories = ref<RemoteDirectoryEntry[]>([])
const directoryError = ref('')
const browsing = ref(false)
const visibleDirectories = computed(() => directories.value.filter((entry) => entry.type === 'directory').slice(0, 12))

async function createHost() {
  await store.createHost({
    ...hostForm.value,
    username: hostForm.value.username || null,
    privateKeyPath: hostForm.value.privateKeyPath || null,
    password: hostForm.value.password || null,
    port: hostForm.value.port ? Number(hostForm.value.port) : null,
    appServerUrl: hostForm.value.appServerUrl || null,
  })
  hostForm.value = {
    name: '',
    sshHost: '',
    username: '',
    port: null,
    authMode: 'agent',
    privateKeyPath: '',
    password: '',
    appServerMode: 'stdio',
    appServerUrl: '',
  }
}

async function createProject() {
  if (!selectedHostId.value) return
  await store.createProject({
    hostId: selectedHostId.value,
    name: projectForm.value.name,
    remotePath: projectForm.value.remotePath,
  })
  projectForm.value = { name: '', remotePath: '' }
}

async function browseDirectories() {
  if (!selectedHostId.value) return
  browsing.value = true
  directoryError.value = ''
  try {
    const result = await store.listRemoteDirectories(directoryPath.value || '~')
    directoryPath.value = result.path
    directories.value = result.entries
  } catch (error: any) {
    directories.value = []
    directoryError.value = error?.data?.message || error?.message || t('app.browseFailed')
  } finally {
    browsing.value = false
  }
}

function chooseDirectory(entry: RemoteDirectoryEntry) {
  directoryPath.value = entry.path
  projectForm.value.remotePath = entry.path
  if (!projectForm.value.name) {
    projectForm.value.name = entry.name
  }
}
</script>

<template>
  <div class="space-y-4 rounded-xl bg-white/45 p-3 text-xs shadow-sm ring-1 ring-black/5">
    <HostManagerPanel />

    <Separator />

    <div class="space-y-2">
      <div class="font-medium">{{ t('app.addHost') }}</div>
      <Input v-model="hostForm.name" data-testid="host-name-input" :aria-label="t('app.hostName')" :placeholder="t('app.hostName')" />
      <Input v-model="hostForm.sshHost" data-testid="host-ssh-input" :aria-label="t('app.sshHost')" :placeholder="t('app.sshHost')" />
      <div class="grid grid-cols-[1fr_82px] gap-2">
        <Input v-model="hostForm.username" :aria-label="t('app.user')" :placeholder="t('app.user')" />
        <Input v-model="hostForm.port" :aria-label="t('app.port')" type="number" :placeholder="t('app.port')" />
      </div>
      <Select v-model="hostForm.authMode">
        <SelectTrigger class="w-full bg-white/70" :aria-label="t('app.auth')">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="agent">{{ t('app.sshAgent') }}</SelectItem>
          <SelectItem value="privateKey">{{ t('app.privateKeyPath') }}</SelectItem>
          <SelectItem value="password">密码</SelectItem>
        </SelectContent>
      </Select>
      <Input
        v-if="hostForm.authMode === 'privateKey'"
        v-model="hostForm.privateKeyPath"
        :aria-label="t('app.privateKeyPath')"
        :placeholder="t('app.privateKeyPath')"
      />
      <Input
        v-if="hostForm.authMode === 'password'"
        v-model="hostForm.password"
        aria-label="密码"
        type="password"
        placeholder="SSH 密码"
      />
      <Select v-model="hostForm.appServerMode">
        <SelectTrigger class="w-full bg-white/70" :aria-label="t('app.appServer')">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="stdio">{{ t('app.sshStdio') }}</SelectItem>
          <SelectItem data-testid="app-server-websocket-option" value="websocket">{{ t('app.webSocket') }}</SelectItem>
        </SelectContent>
      </Select>
      <Input
        v-if="hostForm.appServerMode === 'websocket'"
        v-model="hostForm.appServerUrl"
        data-testid="app-server-url-input"
        :aria-label="t('app.webSocketUrl')"
        :placeholder="t('app.webSocketUrl')"
      />
      <Button data-testid="add-host-button" class="w-full" size="sm" :disabled="!hostForm.name || !hostForm.sshHost" @click="createHost">
        <PlusIcon class="size-3.5" />
        {{ t('app.addHost') }}
      </Button>
    </div>

    <Separator />

    <div class="space-y-2">
      <div class="font-medium">{{ t('app.addProject') }}</div>
      <div class="grid grid-cols-[1fr_auto] gap-2">
        <Input v-model="directoryPath" data-testid="project-browse-path-input" :aria-label="t('app.remotePath')" :placeholder="t('app.remotePath')" />
        <Button variant="secondary" size="sm" :disabled="!selectedHostId || browsing" @click="browseDirectories">
          <FolderOpenIcon class="size-3.5" />
          {{ t('app.browse') }}
        </Button>
      </div>
      <div v-if="visibleDirectories.length" class="grid grid-cols-1 gap-1">
        <Button
          v-for="entry in visibleDirectories"
          :key="entry.path"
          variant="ghost"
          class="h-8 justify-start gap-2 px-2 text-xs font-normal"
          @click="chooseDirectory(entry)"
        >
          <FolderIcon class="size-3.5 shrink-0" />
          <span class="truncate">{{ entry.name }}</span>
        </Button>
      </div>
      <div v-if="directoryError" class="rounded-md bg-red-50 p-2 text-[11px] text-red-700">{{ directoryError }}</div>
      <Input v-model="projectForm.name" data-testid="project-name-input" :aria-label="t('app.projectName')" :placeholder="t('app.projectName')" />
      <Input v-model="projectForm.remotePath" data-testid="project-path-input" :aria-label="t('app.remotePath')" :placeholder="t('app.remotePath')" />
      <Button data-testid="add-project-button" class="w-full" size="sm" :disabled="!selectedHostId || !projectForm.name || !projectForm.remotePath" @click="createProject">
        <FolderIcon class="size-3.5" />
        {{ t('app.addProject') }}
      </Button>
    </div>
  </div>
</template>
