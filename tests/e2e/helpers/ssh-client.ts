import { Client } from "ssh2";

export interface SshTestTarget {
  host: string;
  port: string | number;
  username: string;
  password: string;
  keyboardInteractiveCode?: string;
}

export async function connectTestSsh(target: SshTestTarget) {
  const client = new Client();
  return new Promise<Client>((resolve, reject) => {
    client
      .on("ready", () => resolve(client))
      .on("error", reject)
      .on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
        const code = target.keyboardInteractiveCode;
        // SSH servers may emit a zero-prompt info request after the PAM challenge. Match the
        // protocol's prompt cardinality instead of manufacturing another answer.
        finish(code === undefined ? [] : prompts.map(() => code));
      })
      .connect({
        host: target.host,
        port: Number(target.port),
        username: target.username,
        ...(target.keyboardInteractiveCode === undefined ? { password: target.password } : {}),
        readyTimeout: 10_000,
        tryKeyboard: target.keyboardInteractiveCode !== undefined,
      });
  });
}

export async function execTestSsh(connection: Client, command: string) {
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      connection.exec(command, (error, channel) => {
        if (error) return reject(error);
        let stdout = "";
        let stderr = "";
        channel.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
        channel.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
        channel.on("error", reject);
        channel.on("close", (code: number | null) => resolve({ code, stdout, stderr }));
      });
    },
  );
  if (result.code !== 0) {
    throw new Error(
      [
        result.stdout ? `stdout:\n${result.stdout}` : null,
        result.stderr ? `stderr:\n${result.stderr}` : null,
      ]
        .filter(Boolean)
        .join("\n") || `Remote command failed: ${command}`,
    );
  }
  return result;
}
