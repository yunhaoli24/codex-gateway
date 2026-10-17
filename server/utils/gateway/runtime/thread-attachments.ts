import type { HostRecord, UploadedFileRecord } from "~~/shared/types";
import {
  parseEmptyAppServerResponse,
  parseThreadAttachmentAddResponse,
  parseThreadAttachmentsPage,
  parseThreadAttachmentRemoveResponse,
} from "~~/shared/runtime/app-server";
import type { AgentRpcClient } from "../agent/provider-adapter";
import type { ControllerRegistry } from "./controller-registry";
import { recordFromUnknown } from "~~/shared/utils/records";
import { threadIdFromNotification } from "../protocol/thread-payload";
import { gatewayLog } from "../logging";

interface AttachmentIdentity {
  threadId: string;
  attachmentType: string;
  identityKey: string;
}

export class ThreadAttachmentService {
  constructor(private readonly registry: ControllerRegistry) {}

  async add(host: HostRecord, input: AttachmentIdentity & { payload: unknown }) {
    const client = await this.registry.getHostClient(host);
    return addAttachment(client, input);
  }

  async list(
    host: HostRecord,
    input: { threadId: string; cursor?: string | null; limit?: number },
  ) {
    const client = await this.registry.getHostClient(host);
    return client.request(
      "thread/attachment/list",
      { threadId: input.threadId, cursor: input.cursor ?? null, limit: input.limit ?? 100 },
      120_000,
      parseThreadAttachmentsPage,
    );
  }

  async remove(host: HostRecord, input: AttachmentIdentity) {
    const client = await this.registry.getHostClient(host);
    return parseThreadAttachmentRemoveResponse(
      await client.request("thread/attachment/remove", input, 120_000, parseEmptyAppServerResponse),
    );
  }
}

export function sendWithUploadedFiles<T>(
  client: AgentRpcClient,
  hostId: number,
  threadId: string,
  files: UploadedFileRecord[] | undefined,
  send: () => Promise<T>,
) {
  if (files === undefined || files.length === 0) return send();

  // thread/start creates a speculative thread. Even turn/start and the user item's completion
  // precede Core's persistence barrier. Model output (or turn completion) comes after that barrier;
  // observe it before sending so fast responses cannot race listener installation. No polling or
  // "thread not found" retry is needed, and metadata work never delays/rejects an accepted turn.
  const persisted = Promise.withResolvers<void>();
  const removeNotificationListener = client.on("notification", (message) => {
    if (threadIdFromNotification(message) !== threadId) return;
    const item = recordFromUnknown(recordFromUnknown(message.params)?.item);
    if (
      message.method === "turn/completed" ||
      (message.method === "item/started" &&
        (item?.type === "agentMessage" || item?.type === "reasoning"))
    ) {
      persisted.resolve();
    }
  });
  const removeCloseListener = client.on("close", () => {
    persisted.reject(new Error("App-server disconnected before attachment registration"));
  });
  const timeout = setTimeout(() => {
    persisted.reject(new Error("Timed out waiting to register attachments on a stored thread"));
  }, 180_000);
  timeout.unref();

  let accepted = false;
  const submission = send().then((result) => {
    accepted = true;
    return result;
  });
  void Promise.all([submission, persisted.promise])
    .then(() => registerUploadedFiles(client, threadId, files))
    .catch((error: unknown) => {
      if (accepted) {
        gatewayLog("error", "gateway-attachments", "thread attachment registration failed", {
          hostId,
          threadId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    })
    .finally(() => {
      clearTimeout(timeout);
      removeNotificationListener();
      removeCloseListener();
    });
  return submission;
}

async function registerUploadedFiles(
  client: AgentRpcClient,
  threadId: string,
  files: UploadedFileRecord[],
) {
  // The path is the identity, so retries reuse the official idempotent record. RPC carries only
  // metadata; removing membership must not delete an SFTP file still referenced by history.
  for (const file of files) {
    await addAttachment(client, {
      threadId,
      attachmentType: "file",
      identityKey: file.path,
      payload: file,
    });
  }
}

function addAttachment(client: AgentRpcClient, input: AttachmentIdentity & { payload: unknown }) {
  return client.request("thread/attachment/add", input, 120_000, parseThreadAttachmentAddResponse);
}
