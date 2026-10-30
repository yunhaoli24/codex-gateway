import { createInterface } from "node:readline";
import { once } from "node:events";
import type { ClientChannel } from "ssh2";
import { z } from "zod";
import { shellQuote } from "../../../server/utils/gateway/infra/ssh/shell";
import { remoteCodexCommand, type RemoteCodexEnv } from "./remote-codex";
import { connectTestSsh } from "./ssh-client";

const threadStarted = z.object({ type: z.literal("thread.started"), thread_id: z.string() });

/** A real CLI owns its own runtime, just like an independently opened Desktop/VS Code client. */
export async function startExternalCodexTurn(remote: RemoteCodexEnv, prompt: string) {
  const connection = await connectTestSsh(remote);
  try {
    const command = `cd ${shellQuote(remote.projectPath)} && exec ${remoteCodexCommand(remote)} exec --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --model ${shellQuote(remote.testModel ?? "gpt-6-luna")} ${shellQuote(prompt)}`;
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      // A PTY lets teardown use the same Ctrl-C as a user, including the CLI's child command.
      connection.exec(command, { pty: true }, (error, stream) => {
        if (error) reject(error);
        else resolve(stream);
      });
    });
    let threadId: string | null = null;
    let closed = false;
    channel.once("close", () => {
      closed = true;
    });
    const lines = createInterface({ input: channel });
    lines.on("line", (line) => {
      // The CLI emits real JSONL events; other terminal diagnostics aren't protocol events.
      if (!line.startsWith("{")) return;
      const parsed = threadStarted.safeParse(JSON.parse(line));
      if (parsed.success) threadId = parsed.data.thread_id;
    });
    return {
      threadId: () => threadId,
      async stop() {
        try {
          if (!closed) {
            const closing = once(channel, "close", { signal: AbortSignal.timeout(10_000) });
            channel.write("\u0003");
            await closing;
          }
        } finally {
          lines.close();
          channel.close();
          connection.end();
        }
      },
    };
  } catch (error: unknown) {
    connection.end();
    throw error;
  }
}
