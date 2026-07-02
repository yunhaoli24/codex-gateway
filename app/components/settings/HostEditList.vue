<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, ServerIcon } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { HostRecord } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGatewayStore } from "@/stores/gateway";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";

interface HostEditForm {
  name: string;
  sshHost: string;
  username: string;
  port: string;
  authMode: HostRecord["authMode"];
  privateKeyPath: string;
  privateKey: string;
  password: string;
  proxyUrl: string;
}

const store = useGatewayStore();
const { hosts } = storeToRefs(store);
const { t } = useI18n();
const errorLabels = computed(() => errorMessageLabels(t));
const expandedHostId = ref<number | null>(hosts.value[0]?.id ?? null);
const forms = ref<Record<number, HostEditForm>>({});
const savingHostId = ref<number | null>(null);
const saveErrors = ref<Record<number, string>>({});
const editableHosts = computed(() =>
  hosts.value.flatMap((host) => {
    const form = forms.value[host.id];
    return form ? [{ host, form }] : [];
  }),
);

watch(
  hosts,
  (nextHosts) => {
    for (const host of nextHosts) {
      if (!forms.value[host.id]) {
        forms.value[host.id] = formFromHost(host);
      }
    }
    for (const id of Object.keys(forms.value).map(Number)) {
      if (!nextHosts.some((host) => host.id === id)) {
        delete forms.value[id];
      }
    }
  },
  { immediate: true },
);

function formFromHost(host: HostRecord): HostEditForm {
  return {
    name: host.name,
    sshHost: host.sshHost,
    username: host.username ?? "",
    port: host.port == null ? "" : String(host.port),
    authMode: host.authMode,
    privateKeyPath: host.privateKeyPath ?? "",
    privateKey: host.privateKey ?? "",
    password: host.password ?? "",
    proxyUrl: host.proxyUrl ?? "",
  };
}

function toggleHost(hostId: number) {
  expandedHostId.value = expandedHostId.value === hostId ? null : hostId;
}

async function saveHost(host: HostRecord) {
  const form = forms.value[host.id];
  if (!form) return;
  savingHostId.value = host.id;
  saveErrors.value[host.id] = "";
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
    });
    forms.value[host.id] = formFromHost(updated);
  } catch (error: any) {
    saveErrors.value[host.id] = messageFromError(error, t("app.saveHostFailed"), errorLabels.value);
  } finally {
    savingHostId.value = null;
  }
}
</script>

<template>
  <section class="space-y-2">
    <div class="text-sm font-medium text-ink-secondary">{{ t("app.editHosts") }}</div>
    <div
      v-if="!hosts.length"
      class="rounded-md border border-hairline bg-canvas-soft p-3 text-sm text-ink-secondary"
    >
      {{ t("app.noHosts") }}
    </div>
    <Collapsible
      v-for="entry in editableHosts"
      :key="entry.host.id"
      :open="expandedHostId === entry.host.id"
      class="rounded-md border border-hairline bg-surface"
    >
      <CollapsibleTrigger as-child>
        <Button
          variant="ghost"
          class="h-11 w-full justify-start gap-2 rounded-md px-3"
          @click="toggleHost(entry.host.id)"
        >
          <ChevronDownIcon
            v-if="expandedHostId === entry.host.id"
            class="size-4 shrink-0 text-ink-muted"
          />
          <ChevronRightIcon v-else class="size-4 shrink-0 text-ink-muted" />
          <ServerIcon class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 text-left">
            <span class="block truncate text-sm">{{ entry.host.name }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ entry.host.sshHost }}</span>
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent class="space-y-3 border-t border-hairline p-3">
        <Input
          v-model="entry.form.name"
          :aria-label="t('app.hostName')"
          :placeholder="t('app.hostName')"
        />
        <Input
          v-model="entry.form.sshHost"
          :aria-label="t('app.sshHost')"
          :placeholder="t('app.sshHost')"
        />
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)] gap-2">
          <Input
            v-model="entry.form.username"
            :aria-label="t('app.user')"
            :placeholder="t('app.user')"
          />
          <Input
            v-model="entry.form.port"
            :aria-label="t('app.port')"
            type="number"
            :placeholder="t('app.port')"
          />
        </div>
        <Input
          v-model="entry.form.proxyUrl"
          :aria-label="t('app.sshProxy')"
          :placeholder="t('app.sshProxyPlaceholder')"
        />
        <Select v-model="entry.form.authMode">
          <SelectTrigger class="w-full bg-surface" :aria-label="t('app.auth')">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agent">{{ t("app.sshAgent") }}</SelectItem>
            <SelectItem value="privateKey">{{ t("app.privateKeyPath") }}</SelectItem>
            <SelectItem value="password">{{ t("app.password") }}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-if="entry.form.authMode === 'privateKey'"
          v-model="entry.form.privateKeyPath"
          :aria-label="t('app.privateKeyPath')"
          :placeholder="t('app.privateKeyPath')"
        />
        <Textarea
          v-if="entry.form.authMode === 'privateKey'"
          v-model="entry.form.privateKey"
          class="min-h-32 bg-surface font-mono text-sm"
          :aria-label="t('app.privateKey')"
          :placeholder="t('app.privateKey')"
        />
        <Input
          v-if="entry.form.authMode === 'password'"
          v-model="entry.form.password"
          :aria-label="t('app.password')"
          type="password"
          :placeholder="t('app.sshPassword')"
        />
        <div
          v-if="saveErrors[entry.host.id]"
          class="whitespace-pre-line rounded-md bg-destructive/10 p-2 text-xs text-destructive"
        >
          {{ saveErrors[entry.host.id] }}
        </div>
        <Button
          class="w-full"
          :disabled="savingHostId === entry.host.id || !entry.form.name || !entry.form.sshHost"
          @click="saveHost(entry.host)"
        >
          <CheckIcon class="size-4" />
          {{ t("app.saveHost") }}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  </section>
</template>
