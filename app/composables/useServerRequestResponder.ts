import { computed, ref, unref, type MaybeRef } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";

type RequestId = string | number;

interface ServerRequestResponderSource {
  hostId: MaybeRef<number | null | undefined>;
  threadId: MaybeRef<string | null | undefined>;
  requestId: MaybeRef<RequestId | null | undefined>;
}

export function useServerRequestResponder(source: ServerRequestResponderSource) {
  const store = useGatewayStore();
  const threadTurns = useGatewayThreadTurnsStore();
  const { t } = useI18n();
  const responding = ref(false);
  const context = computed(() => ({
    hostId: unref(source.hostId) ?? null,
    threadId: unref(source.threadId) ?? null,
  }));
  const canRespond = computed(() => {
    const hostId = unref(source.hostId);
    const threadId = unref(source.threadId);
    const requestId = unref(source.requestId);
    return Boolean(hostId && threadId && requestId != null && requestId !== "");
  });

  async function respond(result: unknown) {
    const hostId = unref(source.hostId);
    const threadId = unref(source.threadId);
    const requestId = unref(source.requestId);
    if (!hostId || !threadId || requestId == null || requestId === "") {
      store.setError(t("app.serverRequestMissingContext"), context.value);
      return false;
    }

    responding.value = true;
    try {
      await threadTurns.respondToServerRequest(hostId, threadId, requestId, result);
      return true;
    } catch (error: any) {
      store.setError(
        messageFromError(error, t("app.submitResponseFailed"), errorMessageLabels(t)),
        context.value,
      );
      return false;
    } finally {
      responding.value = false;
    }
  }

  async function respondWithJson(text: string) {
    return await respondWithParsedJson(text, (value) => value);
  }

  async function respondWithParsedJson(text: string, buildResult: (value: unknown) => unknown) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      store.setError(t("app.invalidJsonResponse"), context.value);
      return false;
    }
    return await respond(buildResult(value));
  }

  return {
    canRespond,
    responding,
    respond,
    respondWithJson,
    respondWithParsedJson,
  };
}
