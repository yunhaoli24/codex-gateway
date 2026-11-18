<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@codex-gateway/ui/dialog";
import { Button } from "@codex-gateway/ui/button";
import { Badge } from "@codex-gateway/ui/badge";
import type { ModelProvider, ModelProviderPatch } from "~~/shared/model-providers/protocol";
import { useModelProviders } from "@/composables/model-providers/useModelProviders";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayProjectDefaultsStore } from "@/stores/gateway-project-defaults";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import ModelProviderForm from "./ModelProviderForm.vue";

const props = defineProps<{ hostId: number }>();
const open = defineModel<boolean>("open", { required: true });
const { t } = useI18n();
const { providers, busy, request, refresh } = useModelProviders(props.hostId);
const editing = ref<ModelProvider | null | undefined>();
const authMessage = ref("");
const loginPrompt = ref<{ providerId: string; verificationUrl: string; userCode: string } | null>(
  null,
);
const loginInProgress = ref(false);
const hostName = useGatewayCatalogStore().hosts.find((host) => host.id === props.hostId)?.name;
onMounted(() => {
  void refresh();
});
async function save(settings: ModelProviderPatch) {
  if ((await request({ method: "write", settings })) === null) return;
  editing.value = undefined;
  await refreshConfiguration();
}
async function select(providerId: string) {
  if ((await request({ method: "select", providerId })) === null) return;
  await refreshConfiguration();
}
async function refreshConfiguration() {
  // Model-provider selection changes new-thread defaults, not existing thread settings.
  // Invalidate the host's project defaults as well as its catalog at this explicit write boundary.
  const defaults = useGatewayProjectDefaultsStore();
  defaults.clearHost(props.hostId);
  const navigation = useGatewayNavigationStore();
  // Explicitly re-read after invalidation, even when an older initial read is still pending and
  // the cache was already empty. A null-to-null computed value cannot trigger a hydration watch.
  if (navigation.selectedHostId === props.hostId && navigation.selectedCwd !== null)
    await defaults.ensure(props.hostId, navigation.selectedCwd, "codex").catch((error: unknown) => {
      // Saving succeeded; a failed decorative config/read follows ordinary composer hydration
      // policy and remains uncached for the next visit, rather than claiming the save failed.
      console.warn("[gateway] failed to resolve remote project defaults", error);
    });
  await refresh();
  await useGatewayCatalogStore().listModels({ force: true });
}
async function authorize(providerId: string) {
  // Device codes belong to one provider/login attempt. Never leave a previous provider's link
  // visible when this check returns external auth, success, or an error without a new prompt.
  if (loginPrompt.value?.providerId !== providerId) loginPrompt.value = null;
  authMessage.value = "";
  const result = await request({ method: "auth.read", providerId });
  if (result?.method !== "auth.read") return;
  loginInProgress.value = result.value.status === "started";
  if (!loginInProgress.value) loginPrompt.value = null;
  authMessage.value =
    result.value.error ??
    (result.value.required
      ? t(`app.modelProviders.auth.${result.value.status ?? "notReady"}`)
      : t("app.modelProviders.auth.external"));
  if (
    loginInProgress.value ||
    !result.value.required ||
    result.value.status === "succeeded" ||
    result.value.supportsDeviceAuth !== true
  )
    return;
  const login = await request({ method: "auth.login", providerId });
  if (login?.method === "auth.login") {
    loginPrompt.value = login.value.prompt === null ? null : { providerId, ...login.value.prompt };
    loginInProgress.value = login.value.prompt !== null;
  }
}
async function cancelAuthorization() {
  if ((await request({ method: "auth.cancel" })) === null) return;
  loginPrompt.value = null;
  loginInProgress.value = false;
  authMessage.value = "";
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      class="flex max-h-[85dvh] w-[calc(100%-2rem)] flex-col overflow-y-auto sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle>{{ t("app.modelProviders.title") }} · {{ hostName }}</DialogTitle>
        <DialogDescription>{{ t("app.modelProviders.description") }}</DialogDescription>
      </DialogHeader>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" :disabled="busy" @click="editing = null">{{
          t("app.modelProviders.add")
        }}</Button>
        <Button size="sm" variant="outline" :disabled="busy" @click="refresh">{{
          t("app.modelProviders.refresh")
        }}</Button>
      </div>
      <ModelProviderForm
        v-if="editing !== undefined"
        :key="editing?.id ?? 'new'"
        :provider="editing"
        :busy="busy"
        @save="save"
        @cancel="editing = undefined"
      />
      <div
        v-for="provider in providers.data"
        :key="provider.id"
        class="space-y-3 rounded-lg border border-hairline p-4"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="min-w-0 flex-1 truncate font-medium">{{ provider.name }}</span>
          <Badge v-if="provider.id === providers.defaultProviderId" variant="secondary">{{
            t("app.modelProviders.default")
          }}</Badge>
        </div>
        <p class="break-all text-xs text-ink-muted">
          {{ provider.id }}<span v-if="provider.baseUrl"> · {{ provider.baseUrl }}</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="provider.canEdit && provider.settings.type !== 'openai'"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="editing = provider"
            >{{ t("app.modelProviders.edit") }}</Button
          >
          <Button
            v-if="providers.canChangeDefault && provider.id !== providers.defaultProviderId"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="select(provider.id)"
            >{{ t("app.modelProviders.select") }}</Button
          >
          <Button
            v-if="provider.settings.type === 'customGateway'"
            size="sm"
            variant="ghost"
            :disabled="busy"
            @click="authorize(provider.id)"
            >{{ t("app.modelProviders.authorize") }}</Button
          >
        </div>
      </div>
      <p v-if="authMessage" class="text-sm text-ink-muted">{{ authMessage }}</p>
      <Button variant="outline" :disabled="busy" @click="cancelAuthorization">
        {{ t("app.modelProviders.cancelLogin") }}
      </Button>
      <a
        v-if="loginPrompt"
        :href="loginPrompt.verificationUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="break-all text-sm text-primary underline"
        >{{ loginPrompt.verificationUrl }} · {{ loginPrompt.userCode }}</a
      >
      <p class="text-xs text-ink-muted">{{ t("app.modelProviders.restartHint") }}</p>
    </DialogContent>
  </Dialog>
</template>
