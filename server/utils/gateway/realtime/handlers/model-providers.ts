import { match } from "ts-pattern";
import { z } from "zod";
import type { RealtimeClientMessage } from "~~/shared/types";
import {
  gatewayOAuthLoginSchema,
  gatewayOAuthReadSchema,
  modelProviderListSchema,
  modelProviderSchema,
  type ModelProviderResult,
} from "~~/shared/model-providers/protocol";
import { requireRecord } from "../../http/validation/common";
import { hostStore } from "../../state/hosts";
import { threadBroker } from "../../runtime/broker";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function manageModelProvider(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "modelProvider.request" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const client = await threadBroker.getHostClient(host);
  const result: ModelProviderResult = await match(request.operation)
    .with({ method: "list" }, async () => ({
      method: "list" as const,
      value: await client.request("modelProvider/list", {}, 120_000, (value) =>
        modelProviderListSchema.parse(value),
      ),
    }))
    .with({ method: "write" }, async ({ settings }) => ({
      method: "write" as const,
      value: await client.request("modelProvider/config/write", { settings }, 120_000, (value) =>
        z.object({ provider: modelProviderSchema }).strict().parse(value),
      ),
    }))
    .with({ method: "select" }, async ({ providerId }) => {
      const providers = await client.request("modelProvider/list", {}, 120_000, (value) =>
        modelProviderListSchema.parse(value),
      );
      if (
        !providers.canChangeDefault ||
        !providers.data.some((provider) => provider.id === providerId)
      )
        throw new Error("Model provider cannot be selected");
      // config/value/write is the official selection path. Saving a provider patch alone must
      // never change the default, nor mutate the provider bound to an existing thread.
      await client.request("config/value/write", {
        keyPath: "model_provider",
        value: providerId,
        mergeStrategy: "replace",
      });
      return { method: "select" as const };
    })
    .with({ method: "auth.read" }, async ({ providerId }) => ({
      method: "auth.read" as const,
      value: await client.request(
        "account/gatewayOAuth/read",
        { modelProvider: providerId },
        120_000,
        (value) => gatewayOAuthReadSchema.parse(value),
      ),
    }))
    .with({ method: "auth.login" }, async ({ providerId }) => ({
      method: "auth.login" as const,
      value: await client.request(
        "account/gatewayOAuth/login",
        { modelProvider: providerId, deviceAuth: true },
        120_000,
        (value) => gatewayOAuthLoginSchema.parse(value),
      ),
    }))
    .with({ method: "auth.cancel" }, async () => {
      // Official cancellation applies to the shared Host RPC login. Closing a modal must not
      // cancel another page's login; only this explicit host-scoped user action can do so.
      // Option<()> accepts null/omission, whereas this RPC client's omitted params default to {}.
      await client.request("account/gatewayOAuth/cancel", null);
      return { method: "auth.cancel" as const };
    })
    .exhaustive();
  sendRealtimePeerMessage(peer, {
    type: "modelProvider.result",
    requestId: request.requestId,
    hostId: request.hostId,
    result,
  });
}
