<script setup lang="ts">
import { reactive } from "vue";
import { Button } from "@codex-gateway/ui/button";
import { Input } from "@codex-gateway/ui/input";
import { Label } from "@codex-gateway/ui/label";
import type { ModelProvider, ModelProviderPatch } from "~~/shared/model-providers/protocol";
import { providerFormValues, providerFormPatch } from "./provider-form";

const props = defineProps<{ provider: ModelProvider | null; busy: boolean }>();
const emit = defineEmits<{ save: [patch: ModelProviderPatch]; cancel: [] }>();
const { t } = useI18n();
const values = reactive(providerFormValues(props.provider));
const type = props.provider?.settings.type ?? "customGateway";
const fields =
  type === "bedrock"
    ? (["profile", "region"] as const)
    : type === "gcp"
      ? (["projectId", "location", "credentialFile"] as const)
      : (["name", "baseUrl", "envKey"] as const);
const externalAuth =
  props.provider?.settings.type === "customGateway" &&
  props.provider.settings.auth.mode === "externallyConfigured";
</script>

<template>
  <form
    class="space-y-4 rounded-lg border border-hairline p-4"
    @submit.prevent="emit('save', providerFormPatch(provider, values))"
  >
    <div v-for="field in fields" :key="field" class="space-y-1.5">
      <Label :for="`provider-${field}`">{{ t(`app.modelProviders.fields.${field}`) }}</Label>
      <Input
        :id="`provider-${field}`"
        v-model="values[field]"
        :disabled="busy || (field === 'envKey' && externalAuth)"
        :required="provider === null && (field === 'name' || field === 'baseUrl')"
        autocomplete="off"
      />
    </div>
    <p v-if="externalAuth" class="text-xs text-ink-muted">
      {{ t("app.modelProviders.externalAuth") }}
    </p>
    <div class="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" :disabled="busy" @click="emit('cancel')">{{
        t("app.cancel")
      }}</Button>
      <Button type="submit" :disabled="busy">{{ t("app.modelProviders.save") }}</Button>
    </div>
  </form>
</template>
