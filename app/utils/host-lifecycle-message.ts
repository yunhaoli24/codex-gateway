import type { HostLifecycleMessage } from "~~/shared/host-lifecycle-message";
import type { GatewayTranslate } from "@/composables/i18n/useGatewayTranslator";

export function hostLifecycleMessage(
  event: { message?: string | null; messageTranslation?: HostLifecycleMessage },
  t: GatewayTranslate,
) {
  const translation = event.messageTranslation;
  return translation === undefined
    ? (event.message ?? "")
    : t(`app.hostLifecycle.${translation.key}`, translation.values);
}
