import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";
import { z } from "zod";
import { expect, test } from "./fixtures/remote-workspace";
import {
  authenticatedFetch,
  E2E_PASSWORD,
  openApp,
  reloadApp,
  resetGatewayConfig,
} from "./helpers/app";
import { execRemoteSsh } from "./helpers/remote-codex";
import { sendRealtimeRawRequest, sendRealtimeRequest } from "./helpers/realtime";

test("accounts retain only their assigned folder and conversations on a shared Host", async ({
  page,
  browser,
  remoteWorkspace,
}) => {
  const runtimeUpdates = new Map<Page, Array<{ threadId: string; status: string }>>();
  const realtimeErrors = new Map<Page, string[]>();
  const captureRuntime = (target: Page) => {
    const updates: Array<{ threadId: string; status: string }> = [];
    const errors: string[] = [];
    runtimeUpdates.set(target, updates);
    realtimeErrors.set(target, errors);
    target.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => {
        const data: unknown = JSON.parse(payload.toString());
        const error = z.object({ type: z.literal("error"), message: z.string() }).safeParse(data);
        if (error.success) errors.push(error.data.message);
        const message = z
          .object({
            type: z.literal("thread.runtime.updated"),
            update: z.object({ threadId: z.string(), status: z.string() }),
          })
          .safeParse(data);
        if (message.success) updates.push(message.data.update);
      }),
    );
  };
  captureRuntime(page);
  await openApp(page, { interceptRealtime: false });
  const remote = remoteWorkspace.remote;
  const root = `/tmp/gateway-account-scope-${randomUUID()}`;
  const alice = `${root}/alice`;
  const bob = `${root}/alice-other`;
  await execRemoteSsh(
    remote,
    `mkdir -p '${alice}' '${bob}' && ln -s '${bob}' '${alice}/escape' && ln -s '${alice}' '${bob}/escape'`,
  );
  const host = await authenticatedFetch(
    page,
    {
      url: "/api/hosts",
      method: "POST",
      body: {
        name: "Shared workspace Host",
        sshHost: remote.host,
        port: Number(remote.port),
        username: remote.username,
        authMode: "password",
        password: remote.password,
        proxyUrl: null,
      },
    },
    (value) => z.object({ id: z.number().int().positive() }).parse(value),
  );
  const startThread = async (cwd: string) => {
    const result = await sendRealtimeRequest(page, {
      type: "thread.start",
      requestId: randomUUID(),
      hostId: host.id,
      cwd,
      model: remote.testModel ?? "gpt-6-luna",
      effort: "medium",
      approvalPolicy: "never",
    });
    if (result.type !== "thread.started") throw new Error("Expected a real Codex thread");
    await sendRealtimeRequest(page, {
      type: "turn.start",
      requestId: randomUUID(),
      hostId: host.id,
      threadId: result.threadId,
      text: "Reply OK. Do not call tools or change files.",
    });
    return result.threadId;
  };
  const aliceThread = await startThread(alice);
  const bobThread = await startThread(bob);
  const username = `workspace-bob-${Date.now()}`;
  await promisify(execFile)("node", ["scripts/create-user.mjs", username, E2E_PASSWORD]);
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const otherPage = await otherContext.newPage();
  captureRuntime(otherPage);
  try {
    await otherPage.goto("/");
    await otherPage.getByTestId("login-username").fill(username);
    await otherPage.getByTestId("login-password").fill(E2E_PASSWORD);
    await otherPage.getByTestId("login-submit").click();
    await openApp(otherPage, { resetConfig: false, interceptRealtime: false });
    const config = await authenticatedFetch(page, { url: "/api/config/export" }, (value) =>
      z
        .object({
          version: z.literal(2),
          hosts: z.array(z.unknown()),
          pinnedThreads: z.array(z.unknown()),
        })
        .loose()
        .parse(value),
    );
    for (const [target, cwd] of [
      [page, alice],
      [otherPage, bob],
    ] as const) {
      await authenticatedFetch(
        target,
        {
          url: "/api/config/sync",
          method: "POST",
          body: {
            ...config,
            workspaceRoots: [{ hostId: host.id, name: cwd.split("/").at(-1), remotePath: cwd }],
          },
        },
        () => undefined,
      );
      await reloadApp(target);
      const folders = await authenticatedFetch(
        target,
        { url: `/api/projects?hostId=${host.id}` },
        (value) => z.array(z.object({ remotePath: z.string() })).parse(value),
      );
      expect(folders.map((folder) => folder.remotePath)).toEqual([cwd]);
      await expect(target.getByTestId(`project-button-${cwd}`)).toBeVisible();
      await expect(
        target.getByTestId(`project-button-${cwd === alice ? bob : alice}`),
      ).toBeHidden();
      const found: string[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ hostId: String(host.id), limit: "1" });
        if (cursor !== null && cursor !== "") query.set("cursor", cursor);
        const result = await authenticatedFetch(target, { url: `/api/threads?${query}` }, (value) =>
          z
            .object({
              data: z.array(z.object({ id: z.string(), cwd: z.string().nullish() })),
              nextCursor: z.string().nullish(),
            })
            .parse(value),
        );
        expect(result.data.every((thread) => thread.cwd === cwd)).toBe(true);
        found.push(...result.data.map((thread) => thread.id));
        cursor = result.nextCursor ?? null;
      } while (cursor !== null && cursor !== "");
      expect(found).toContain(cwd === alice ? aliceThread : bobThread);
      expect(found).not.toContain(cwd === alice ? bobThread : aliceThread);
      const forbidden = await sendRealtimeRawRequest(target, {
        type: "thread.activate",
        requestId: randomUUID(),
        hostId: host.id,
        threadId: cwd === alice ? bobThread : aliceThread,
      });
      expect(forbidden.type).toBe("error");
      const errors = realtimeErrors.get(target)!;
      const beforeSubscription = errors.length;
      await target.evaluate(
        ({ hostId, threadId }) => {
          const realtime = window.__codexGatewayE2e?.realtime;
          if (!realtime) throw new Error("Gateway E2E driver is unavailable");
          realtime.send({ type: "thread.subscribe", hostId, threadId, afterId: 0 });
        },
        { hostId: host.id, threadId: cwd === alice ? bobThread : aliceThread },
      );
      await expect.poll(() => errors.length).toBeGreaterThan(beforeSubscription);
      expect(errors.at(-1)).toContain("Path is outside this account's workspace");
      const forbiddenStart = await sendRealtimeRawRequest(target, {
        type: "thread.start",
        requestId: randomUUID(),
        hostId: host.id,
        cwd: cwd === alice ? bob : alice,
        approvalPolicy: "never",
      });
      expect(forbiddenStart.type).toBe("error");
      const parent = await authenticatedFetch(
        target,
        {
          url: `/api/remote/directories?${new URLSearchParams({ hostId: String(host.id), path: root })}`,
        },
        (value) => z.object({ entries: z.array(z.object({ path: z.string() })) }).parse(value),
      );
      expect(parent.entries.map((entry) => entry.path)).toEqual([cwd]);
      const browseStatus = await target.evaluate(
        async ({ hostId, path }) => {
          const token = localStorage.getItem("codex-gateway-auth-token");
          return (
            await fetch(
              `/api/remote/directories?${new URLSearchParams({ hostId: String(hostId), path })}`,
              { headers: { authorization: `Bearer ${token}` } },
            )
          ).status;
        },
        { hostId: host.id, path: cwd === alice ? bob : alice },
      );
      expect(browseStatus).toBe(403);
      const uploadStatuses = await target.evaluate(
        async ({ hostId, cwd, foreign }) => {
          const statuses: number[] = [];
          for (const attempt of [
            { rootPath: cwd, path: cwd },
            { rootPath: cwd, path: foreign },
            { rootPath: foreign, path: foreign },
            { rootPath: cwd, path: `${cwd}/escape` },
          ]) {
            const form = new FormData();
            form.append("files", new File([cwd], "scoped-upload.txt"));
            const response = await fetch(
              `/api/remote/uploads?${new URLSearchParams({ hostId: String(hostId), ...attempt })}`,
              {
                method: "POST",
                headers: {
                  authorization: `Bearer ${localStorage.getItem("codex-gateway-auth-token")}`,
                },
                body: form,
              },
            );
            statuses.push(response.status);
          }
          return statuses;
        },
        { hostId: host.id, cwd, foreign: cwd === alice ? bob : alice },
      );
      expect(uploadStatuses).toEqual([200, 403, 403, 403]);
      expect((await execRemoteSsh(remote, `cat '${cwd}/scoped-upload.txt'`)).stdout).toBe(cwd);
    }
    for (const updates of runtimeUpdates.values()) updates.length = 0;
    await sendRealtimeRequest(otherPage, {
      type: "turn.start",
      requestId: randomUUID(),
      hostId: host.id,
      threadId: bobThread,
      text: "Reply OK. Do not call tools or change files.",
    });
    await expect
      .poll(
        () =>
          runtimeUpdates
            .get(otherPage)
            ?.some((update) => update.threadId === bobThread && update.status !== "running"),
        { timeout: 60_000 },
      )
      .toBe(true);
    expect(runtimeUpdates.get(page)?.some((update) => update.threadId === bobThread)).toBe(false);
  } finally {
    try {
      for (const [target, threadId] of [
        [page, aliceThread],
        [otherPage, bobThread],
      ] as const) {
        await authenticatedFetch(
          target,
          {
            url: "/api/e2e/archive-threads",
            method: "POST",
            body: { hostId: host.id, threadId },
          },
          () => undefined,
        );
        await resetGatewayConfig(target);
      }
    } finally {
      await otherContext.close();
    }
  }
});
