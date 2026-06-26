<script setup lang="ts">
import { Loader2Icon, ServerIcon, Trash2Icon, WifiIcon } from '@lucide/vue'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGatewayStore } from '@/stores/gateway'

const store = useGatewayStore()
const { hosts, hostConnectionStatuses, selectedHostId } = storeToRefs(store)
const { t } = useI18n()
const verifyingHostId = ref<number | null>(null)
const verifyResults = ref<Record<number, { ok?: boolean, message: string }>>({})

async function selectHost(hostId: number) {
  await store.selectHost(hostId)
}

async function verifyHost(hostId: number) {
  verifyingHostId.value = hostId
  try {
    const result = await store.verifyHost(hostId) as any
    verifyResults.value[hostId] = {
      ok: Boolean(result.ok),
      message: result.stdout || result.stderr || (result.ok ? t('app.connected') : t('app.verifyFailed')),
    }
  } catch (error: any) {
    verifyResults.value[hostId] = {
      ok: false,
      message: error?.data?.message || error?.message || t('app.verifyFailed'),
    }
  } finally {
    verifyingHostId.value = null
  }
}

async function deleteHost(hostId: number) {
  await store.deleteHost(hostId)
}

function hostConnectionStatus(hostId: number) {
  return hostConnectionStatuses.value[hostId] ?? { status: 'idle' as const, message: null }
}

function hostConnectionLabel(hostId: number) {
  const connection = hostConnectionStatus(hostId)
  if (connection.status === 'checkingVersion') return connection.message || '正在检查远端 Codex 版本'
  if (connection.status === 'upgrading') return connection.message || '正在升级远端 Codex'
  if (connection.status === 'restarting') return connection.message || '正在重启远端 app-server'
  if (connection.status === 'connecting') return connection.message || '正在连接'
  if (connection.status === 'connected') return connection.message || t('app.connected')
  if (connection.status === 'failed') return connection.message || t('app.verifyFailed')
  return ''
}

function hostConnectionClass(hostId: number) {
  const status = hostConnectionStatus(hostId).status
  if (status === 'checkingVersion' || status === 'upgrading' || status === 'restarting' || status === 'connecting') return 'text-sky-700'
  if (status === 'connected') return 'text-emerald-700'
  if (status === 'failed') return 'text-red-700'
  return 'text-[#79838a]'
}

function hostConnectionIsBusy(hostId: number) {
  const status = hostConnectionStatus(hostId).status
  return status === 'checkingVersion' || status === 'upgrading' || status === 'restarting' || status === 'connecting'
}

function hostStatusMessage(hostId: number) {
  return hostConnectionLabel(hostId) || verifyResults.value[hostId]?.message || ''
}

function hostStatusClass(hostId: number) {
  if (hostConnectionLabel(hostId)) {
    return hostConnectionClass(hostId)
  }
  return verifyResults.value[hostId]?.ok ? 'text-emerald-700' : 'text-red-700'
}
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between px-1">
      <div class="text-xs font-medium text-[#5f6970]">{{ t('app.hosts') }}</div>
      <Badge variant="secondary">{{ hosts.length }}</Badge>
    </div>

    <ScrollArea class="max-h-56">
      <div class="space-y-1 pr-2">
        <div
          v-for="host in hosts"
          :key="host.id"
          class="rounded-lg p-1"
          :class="host.id === selectedHostId ? 'bg-[#c7ddeb]' : 'hover:bg-black/5'"
        >
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              class="min-w-0 flex-1 justify-start gap-2 px-2 text-left"
              @click="selectHost(host.id)"
            >
              <ServerIcon class="size-4 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{{ host.name }}</span>
                <span class="block truncate text-[11px] text-[#79838a]">
                  {{ host.sshHost }}
                </span>
              </span>
            </Button>
            <Button
              :data-testid="`verify-host-button-${host.id}`"
              variant="ghost"
              size="sm"
              class="size-8 p-0"
              :aria-label="t('app.verifyHost')"
              :disabled="verifyingHostId === host.id || hostConnectionIsBusy(host.id)"
              @click="verifyHost(host.id)"
            >
              <Loader2Icon v-if="verifyingHostId === host.id || hostConnectionIsBusy(host.id)" class="size-4 animate-spin" />
              <WifiIcon v-else class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="size-8 p-0 text-red-600 hover:text-red-700"
              :aria-label="t('app.deleteHost')"
              @click="deleteHost(host.id)"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>
          <div
            v-if="hostStatusMessage(host.id)"
            class="truncate px-2 pb-1 text-[11px]"
            :class="hostStatusClass(host.id)"
          >
            {{ hostStatusMessage(host.id) }}
          </div>
        </div>
      </div>
    </ScrollArea>
  </section>
</template>
