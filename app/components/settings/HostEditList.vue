<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, ServerIcon } from '@lucide/vue'
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { HostRecord } from '~~/shared/types'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useGatewayStore } from '@/stores/gateway'

interface HostEditForm {
  name: string
  sshHost: string
  username: string
  port: number | null
  authMode: HostRecord['authMode']
  privateKeyPath: string
  privateKey: string
  password: string
  proxyUrl: string
}

const store = useGatewayStore()
const { hosts } = storeToRefs(store)
const { t } = useI18n()
const expandedHostId = ref<number | null>(hosts.value[0]?.id ?? null)
const forms = ref<Record<number, HostEditForm>>({})
const savingHostId = ref<number | null>(null)
const saveErrors = ref<Record<number, string>>({})

watch(hosts, (nextHosts) => {
  for (const host of nextHosts) {
    if (!forms.value[host.id]) {
      forms.value[host.id] = formFromHost(host)
    }
  }
  for (const id of Object.keys(forms.value).map(Number)) {
    if (!nextHosts.some((host) => host.id === id)) {
      delete forms.value[id]
    }
  }
}, { immediate: true })

function formFromHost(host: HostRecord): HostEditForm {
  return {
    name: host.name,
    sshHost: host.sshHost,
    username: host.username ?? '',
    port: host.port,
    authMode: host.authMode,
    privateKeyPath: host.privateKeyPath ?? '',
    privateKey: host.privateKey ?? '',
    password: host.password ?? '',
    proxyUrl: host.proxyUrl ?? '',
  }
}

function toggleHost(hostId: number) {
  expandedHostId.value = expandedHostId.value === hostId ? null : hostId
}

async function saveHost(host: HostRecord) {
  const form = forms.value[host.id]
  if (!form) return
  savingHostId.value = host.id
  saveErrors.value[host.id] = ''
  try {
    const updated = await store.updateHost(host.id, {
      name: form.name,
      sshHost: form.sshHost,
      username: form.username || null,
      port: form.port ? Number(form.port) : null,
      authMode: form.authMode,
      privateKeyPath: form.privateKeyPath || null,
      privateKey: form.privateKey || null,
      password: form.password || null,
      proxyUrl: form.proxyUrl || null,
    })
    forms.value[host.id] = formFromHost(updated)
  } catch (error: any) {
    saveErrors.value[host.id] = error?.data?.message || error?.message || t('app.saveHostFailed')
  } finally {
    savingHostId.value = null
  }
}
</script>

<template>
  <section class="space-y-2">
    <div class="text-sm font-medium text-[#5f6970]">{{ t('app.editHosts') }}</div>
    <div v-if="!hosts.length" class="rounded-md border border-black/10 bg-[#f7f7f5] p-3 text-sm text-[#6f767d]">
      {{ t('app.noHosts') }}
    </div>
    <Collapsible
      v-for="host in hosts"
      :key="host.id"
      :open="expandedHostId === host.id"
      class="rounded-md border border-black/10 bg-white"
    >
      <CollapsibleTrigger as-child>
        <Button
          variant="ghost"
          class="h-11 w-full justify-start gap-2 rounded-md px-3"
          @click="toggleHost(host.id)"
        >
          <ChevronDownIcon v-if="expandedHostId === host.id" class="size-4 shrink-0 text-[#7e878d]" />
          <ChevronRightIcon v-else class="size-4 shrink-0 text-[#7e878d]" />
          <ServerIcon class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 text-left">
            <span class="block truncate text-sm">{{ host.name }}</span>
            <span class="block truncate text-xs text-[#7e878d]">{{ host.sshHost }}</span>
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent class="space-y-3 border-t border-black/10 p-3">
        <Input v-model="forms[host.id].name" :aria-label="t('app.hostName')" :placeholder="t('app.hostName')" />
        <Input v-model="forms[host.id].sshHost" :aria-label="t('app.sshHost')" :placeholder="t('app.sshHost')" />
        <div class="grid grid-cols-[1fr_120px] gap-2">
          <Input v-model="forms[host.id].username" :aria-label="t('app.user')" :placeholder="t('app.user')" />
          <Input v-model="forms[host.id].port" :aria-label="t('app.port')" type="number" :placeholder="t('app.port')" />
        </div>
        <Input
          v-model="forms[host.id].proxyUrl"
          :aria-label="t('app.sshProxy')"
          :placeholder="t('app.sshProxyPlaceholder')"
        />
        <Select v-model="forms[host.id].authMode">
          <SelectTrigger class="w-full bg-white" :aria-label="t('app.auth')">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agent">{{ t('app.sshAgent') }}</SelectItem>
            <SelectItem value="privateKey">{{ t('app.privateKeyPath') }}</SelectItem>
            <SelectItem value="password">密码</SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-if="forms[host.id].authMode === 'privateKey'"
          v-model="forms[host.id].privateKeyPath"
          :aria-label="t('app.privateKeyPath')"
          :placeholder="t('app.privateKeyPath')"
        />
        <Textarea
          v-if="forms[host.id].authMode === 'privateKey'"
          v-model="forms[host.id].privateKey"
          class="min-h-32 bg-white font-mono text-sm"
          :aria-label="t('app.privateKey')"
          :placeholder="t('app.privateKey')"
        />
        <Input
          v-if="forms[host.id].authMode === 'password'"
          v-model="forms[host.id].password"
          aria-label="密码"
          type="password"
          placeholder="SSH 密码"
        />
        <div v-if="saveErrors[host.id]" class="rounded-md bg-red-50 p-2 text-xs text-red-700">
          {{ saveErrors[host.id] }}
        </div>
        <Button class="w-full" :disabled="savingHostId === host.id || !forms[host.id].name || !forms[host.id].sshHost" @click="saveHost(host)">
          <CheckIcon class="size-4" />
          {{ t('app.saveHost') }}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  </section>
</template>
