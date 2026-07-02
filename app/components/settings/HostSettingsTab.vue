<script setup lang="ts">
import { PlusIcon } from "@lucide/vue";
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import HostEditList from "@/components/settings/HostEditList.vue";
import { useGatewayStore } from "@/stores/gateway";

const emit = defineEmits<{ close: [] }>();
const store = useGatewayStore();
const { t } = useI18n();
const defaultHostForm = () => ({
  name: "",
  sshHost: "",
  username: "",
  port: "",
  authMode: "agent",
  privateKeyPath: "",
  privateKey: "",
  password: "",
  proxyUrl: "socks5h://127.0.0.1:7890",
});
const hostForm = ref(defaultHostForm());

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
  hostForm.value = defaultHostForm();
  emit("close");
}
</script>

<template>
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
          class="w-full bg-surface"
          :aria-label="t('app.auth')"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="agent">{{ t("app.sshAgent") }}</SelectItem>
          <SelectItem value="privateKey">{{ t("app.privateKeyPath") }}</SelectItem>
          <SelectItem data-testid="host-auth-password-option" value="password">
            {{ t("app.password") }}
          </SelectItem>
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
        class="min-h-44 bg-surface font-mono text-sm"
        :aria-label="t('app.privateKey')"
        :placeholder="t('app.privateKey')"
      />
      <Input
        v-if="hostForm.authMode === 'password'"
        v-model="hostForm.password"
        :aria-label="t('app.password')"
        type="password"
        :placeholder="t('app.sshPassword')"
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
</template>
