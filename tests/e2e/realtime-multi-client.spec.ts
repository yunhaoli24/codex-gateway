import { expect, test, type Page, type WebSocket } from "@playwright/test";
import { openApp, reloadApp } from "./helpers/app";
import {
  addRemoteHost,
  addRemoteProject,
  readRemoteEnv,
  sendImageTurnThroughGateway,
  sendSteerText,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
} from "./helpers/remote-codex";

test.describe.configure({ mode: "serial" });

test("fans out a real remote app-server thread to multiple browser clients across turns", async ({
  browser,
  page,
}) => {
  const remote = await readRemoteEnv();
  const realtimeSockets = trackActiveRealtimeSockets(page);
  await installRealtimeSocketProbe(page);

  await openApp(page);
  await expect.poll(() => realtimeSockets.size, { timeout: 10_000 }).toBe(1);
  expect([...realtimeSockets].every((socket) => isTokenlessRealtimeUrl(socket.url()))).toBe(true);
  const resumePingOffset = await realtimeClientMessageCount(page);
  await triggerRealtimeResume(page);
  const resumePing = await waitForRealtimeClientMessage(page, "ping", resumePingOffset);
  expect(typeof resumePing.nonce).toBe("string");

  const host = await addRemoteHost(page, remote);
  const project = await addRemoteProject(page, remote, host.id);
  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id);

  const firstMarker = `E2E 第一轮 ${Date.now()}`;
  await page
    .getByPlaceholder("输入后续修改要求")
    .fill(
      [
        `请执行一个较长命令，然后最终用一句话回复：${firstMarker}`,
        "运行 python - <<'PY'",
        "import time",
        `print('${firstMarker}')`,
        "time.sleep(12)",
        "print('first turn sleep finished')",
        "PY",
      ].join("\n"),
    );
  await page.getByTestId("send-turn-button").click();
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "停止生成");
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("运行中")).toBeVisible();
  await expect(
    page.getByTestId(`thread-button-${threadId}`).locator(".animate-spin"),
  ).toBeVisible();
  await expect.poll(async () => activeRemoteTurnId(page), { timeout: 30_000 }).not.toBe("");
  const steerMarker = `E2E steer ${Date.now()}`;
  const steerMessageOffset = await realtimeClientMessageCount(page);
  await sendSteerText(page, steerMarker);
  const steerMessage = await waitForRealtimeClientMessage(page, "turn.steer", steerMessageOffset);
  expect(steerMessage.threadId).toBe(threadId);
  expect(steerMessage.text).toContain(steerMarker);
  await expect(
    page
      .getByTestId("intermediate-steps")
      .getByTestId("steered-conversation-item")
      .getByText(steerMarker),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("chat-scroll-area").getByText(firstMarker)).toBeVisible({
    timeout: 120_000,
  });
  const processToggle = firstIntermediateStepsToggle(page);
  if (
    (await processToggle.isVisible().catch(() => false)) &&
    (await processToggle.getAttribute("data-state")) !== "open"
  ) {
    await processToggle.click();
    await expect(processToggle).toHaveAttribute("data-state", "open");
  }
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("已完成")).toBeVisible();
  await expect(firstIntermediateStepsToggle(page)).toHaveAttribute("data-state", "closed");
  const reconnectedMarker = `E2E WS重连 ${Date.now()}`;
  await sendTextTurn(page, reconnectedMarker);
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "停止生成");
  const reconnectMessageOffset = await realtimeClientMessageCount(page);
  await closeRealtimeSockets(page);
  await expect.poll(() => realtimeSockets.size, { timeout: 30_000 }).toBe(1);
  const reconnectActivate = await waitForRealtimeClientMessage(
    page,
    "thread.activate",
    reconnectMessageOffset,
  );
  expect(reconnectActivate.threadId).toBe(threadId);
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("已完成")).toBeVisible();
  await firstIntermediateStepsToggle(page).click();
  await expect(
    page
      .getByTestId("intermediate-steps")
      .getByTestId("steered-conversation-item")
      .getByText(steerMarker),
  ).toBeVisible();
  await reloadApp(page);
  await expect(firstIntermediateStepsToggle(page)).toHaveAttribute("data-state", "closed");
  await firstIntermediateStepsToggle(page).click();
  await expect(
    page
      .getByTestId("intermediate-steps")
      .getByTestId("steered-conversation-item")
      .getByText(steerMarker),
  ).toBeVisible({ timeout: 30_000 });

  const secondContext = await browser.newContext({
    storageState: await page.context().storageState(),
  });
  const secondPage = await secondContext.newPage();
  const secondRealtimeSockets = trackActiveRealtimeSockets(secondPage);
  await openApp(secondPage, { resetConfig: false });
  try {
    await expect.poll(() => secondRealtimeSockets.size, { timeout: 10_000 }).toBe(1);
    await openThreadFromProjectOrRestoredState(secondPage, project.id, threadId);
    await expect(secondPage.getByPlaceholder("输入后续修改要求")).toBeEnabled();
    await expect
      .poll(async () => secondPage.getByTestId("chat-scroll-area").getByText(firstMarker).count(), {
        timeout: 120_000,
      })
      .toBeGreaterThan(0);
    await secondPage.getByTestId("chat-scroll-area").evaluate((root) => {
      const viewport = root.querySelector(
        '[data-slot="scroll-area-viewport"]',
      ) as HTMLElement | null;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    await expect
      .poll(
        async () =>
          secondPage.getByTestId("chat-scroll-area").evaluate((root) => {
            const viewport = root.querySelector(
              '[data-slot="scroll-area-viewport"]',
            ) as HTMLElement | null;
            if (!viewport) return false;
            return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
          }),
        { timeout: 5_000 },
      )
      .toBe(true);

    const secondMarker = `E2E 第二轮图片 ${Date.now()}`;
    await sendImageTurnThroughGateway(secondPage, {
      hostId: host.id,
      threadId,
      cwd: remote.projectPath,
      imagePath: remote.imagePath,
      marker: secondMarker,
    });
    await expect(
      page.getByTestId("chat-scroll-area").getByText(`回复：${secondMarker}`),
    ).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
      timeout: 120_000,
    });
    expect(realtimeSockets.size).toBe(1);
    expect(secondRealtimeSockets.size).toBe(1);
  } finally {
    await secondContext.close();
  }

  const interruptMarker = `E2E interrupt ${Date.now()}`;
  const turnStartMessageOffset = await realtimeClientMessageCount(page);
  await page
    .getByPlaceholder("输入后续修改要求")
    .fill(
      [
        `请执行一个较长命令来等待中断：${interruptMarker}`,
        "运行 python - <<'PY'",
        "import time",
        "time.sleep(30)",
        "print('interrupt target finished')",
        "PY",
      ].join("\n"),
    );
  await page.getByTestId("send-turn-button").click();
  const turnStartMessage = await waitForRealtimeClientMessage(
    page,
    "turn.start",
    turnStartMessageOffset,
  );
  expect(turnStartMessage.threadId).toBe(threadId);
  await expect.poll(async () => activeRemoteTurnId(page), { timeout: 30_000 }).not.toBe("");
  const activeTurnId = await activeRemoteTurnId(page);
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "停止生成");
  const interruptMessageOffset = await realtimeClientMessageCount(page);
  await page.getByTestId("send-turn-button").click();
  const interruptMessage = await waitForRealtimeClientMessage(
    page,
    "turn.interrupt",
    interruptMessageOffset,
  );
  expect(interruptMessage.threadId).toBe(threadId);
  expect(interruptMessage.turnId).toBe(activeTurnId);
});

function trackActiveRealtimeSockets(page: Page) {
  const sockets = new Set<WebSocket>();
  page.on("websocket", (webSocket) => {
    if (!webSocket.url().endsWith("/api/realtime")) {
      return;
    }
    sockets.add(webSocket);
    webSocket.on("close", () => {
      sockets.delete(webSocket);
    });
  });
  return sockets;
}

function isTokenlessRealtimeUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  return url.pathname === "/api/realtime" && url.search === "";
}

function firstIntermediateStepsToggle(page: Page) {
  return page.getByRole("button", { name: /中间过程/ }).first();
}

async function openThreadFromProjectOrRestoredState(
  page: Page,
  projectId: number,
  threadId: string,
) {
  if ((await currentSelectedThreadId(page)) === threadId) {
    return;
  }

  await expect(page.getByTestId(`project-button-${projectId}`)).toBeVisible();
  const row = page.getByTestId(`project-thread-row-${threadId}`);
  if (!(await row.isVisible().catch(() => false))) {
    await page.getByTestId(`project-button-${projectId}`).click();
  }
  if ((await currentSelectedThreadId(page)) === threadId) {
    return;
  }
  const threadButton = page.getByTestId(`thread-button-${threadId}`);
  if (await threadButton.isVisible().catch(() => false)) {
    await threadButton.click();
    await expect
      .poll(async () => currentSelectedThreadId(page), { timeout: 10_000 })
      .toBe(threadId);
    return;
  }
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect.poll(async () => currentSelectedThreadId(page), { timeout: 10_000 }).toBe(threadId);
}

async function currentRouteThreadId(page: Page) {
  return page.evaluate(() => new URLSearchParams(window.location.search).get("threadId"));
}

async function currentSelectedThreadId(page: Page) {
  const storeThreadId = await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    return store?.selectedThreadId ? String(store.selectedThreadId) : null;
  });
  return storeThreadId ?? (await currentRouteThreadId(page));
}

async function closeRealtimeSockets(page: Page) {
  await page.evaluate(() => {
    (window as any).__closeGatewayRealtimeSockets?.();
  });
}

async function triggerRealtimeResume(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function installRealtimeSocketProbe(page: Page) {
  await page.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket;
    const sockets = new Set<any>();
    const messages: any[] = [];
    class TrackedWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        const rawUrl = String(url);
        if (rawUrl.endsWith("/api/realtime")) {
          sockets.add(this as any);
          (this as any).addEventListener("close", () => sockets.delete(this as any));
        }
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === "string") {
          try {
            const parsed = JSON.parse(data);
            if (parsed && typeof parsed.type === "string") {
              messages.push(parsed);
            }
          } catch {
            // Non-JSON WebSocket frames are not gateway protocol messages.
          }
        }
        return super.send(data as any);
      }
    }
    window.WebSocket = TrackedWebSocket as typeof WebSocket;
    (window as any).__closeGatewayRealtimeSockets = () => {
      for (const socket of sockets) {
        socket.close();
      }
    };
    (window as any).__gatewayRealtimeClientMessages = messages;
  });
}

async function realtimeClientMessageCount(page: Page) {
  return page.evaluate(() => ((window as any).__gatewayRealtimeClientMessages ?? []).length);
}

async function waitForRealtimeClientMessage(page: Page, type: string, offset: number) {
  try {
    await page.waitForFunction(
      ({ expectedType, startIndex }) =>
        ((window as any).__gatewayRealtimeClientMessages ?? [])
          .slice(startIndex)
          .some((message: any) => message.type === expectedType),
      { expectedType: type, startIndex: offset },
      { timeout: 30_000 },
    );
  } catch (error) {
    const messages = await page.evaluate(
      (startIndex) => ((window as any).__gatewayRealtimeClientMessages ?? []).slice(startIndex),
      offset,
    );
    throw new Error(
      [
        `Timed out waiting for realtime client message ${type}`,
        `Observed messages after offset ${offset}:`,
        JSON.stringify(messages, null, 2),
      ].join("\n"),
      { cause: error },
    );
  }
  return page.evaluate(
    ({ expectedType, startIndex }) =>
      ((window as any).__gatewayRealtimeClientMessages ?? [])
        .slice(startIndex)
        .find((message: any) => message.type === expectedType),
    { expectedType: type, startIndex: offset },
  );
}

async function activeRemoteTurnId(page: Page) {
  return page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    const turns = store?.history?.thread?.turns ?? [];
    const latest = [...turns].reverse().find((turn: any) => {
      const status = typeof turn?.status === "string" ? turn.status : turn?.status?.type;
      return status === "inProgress" || status === "running" || status === "active";
    });
    if (latest?.id) {
      return String(latest.id);
    }
    const key =
      store?.selectedHostId && store?.selectedThreadId
        ? `${store.selectedHostId}:${store.selectedThreadId}`
        : "";
    return String(store?.activeTerminalProcessByThreadKey?.[key]?.turnId || "");
  });
}
