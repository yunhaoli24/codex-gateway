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
  await installRealtimeSocketCloser(page);

  await openApp(page);
  await expect.poll(() => realtimeSockets.size, { timeout: 10_000 }).toBe(1);
  expect([...realtimeSockets].every((socket) => isTokenlessRealtimeUrl(socket.url()))).toBe(true);

  const host = await addRemoteHost(page, remote);
  const project = await addRemoteProject(page, remote, host.id);
  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id);

  const firstMarker = `E2E 第一轮 ${Date.now()}`;
  await sendTextTurn(page, firstMarker);
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "运行中");
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("运行中")).toBeVisible();
  await expect(
    page.getByTestId(`thread-button-${threadId}`).locator(".animate-spin"),
  ).toBeVisible();
  const steerMarker = `E2E steer ${Date.now()}`;
  await sendSteerText(page, steerMarker);
  await expect(
    page
      .getByTestId("intermediate-steps")
      .getByTestId("steered-conversation-item")
      .getByText(steerMarker),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("chat-scroll-area").getByText(firstMarker)).toBeVisible({
    timeout: 120_000,
  });
  const processToggle = page.getByRole("button", { name: /中间过程/ });
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
  await expect(page.getByRole("button", { name: /中间过程/ })).toHaveAttribute(
    "data-state",
    "closed",
  );
  const probedMarker = `E2E 状态探头 ${Date.now()}`;
  const statusProbeResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/threads/status?") && response.status() === 200,
    { timeout: 120_000 },
  );
  await sendTextTurn(page, probedMarker);
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "运行中");
  await closeRealtimeSockets(page);
  await statusProbeResponsePromise;
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("已完成")).toBeVisible();
  await page.getByRole("button", { name: /中间过程/ }).click();
  await expect(
    page
      .getByTestId("intermediate-steps")
      .getByTestId("steered-conversation-item")
      .getByText(steerMarker),
  ).toBeVisible();
  await reloadApp(page);
  await expect(page.getByRole("button", { name: /中间过程/ })).toHaveAttribute(
    "data-state",
    "closed",
  );
  await page.getByRole("button", { name: /中间过程/ }).click();
  await expect(
    page
      .getByTestId("intermediate-steps")
      .getByTestId("steered-conversation-item")
      .getByText(steerMarker),
  ).toBeVisible({ timeout: 30_000 });

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  const secondRealtimeSockets = trackActiveRealtimeSockets(secondPage);
  await openApp(secondPage, { resetConfig: false });
  try {
    await expect.poll(() => secondRealtimeSockets.size, { timeout: 10_000 }).toBe(1);
    await expect(secondPage.getByTestId(`project-button-${project.id}`)).toBeVisible();
    await secondPage.getByTestId(`project-button-${project.id}`).click();
    await expect(secondPage.getByTestId(`project-thread-row-${threadId}`)).toBeVisible({
      timeout: 30_000,
    });
    const openResponsePromise = secondPage
      .waitForResponse(
        (response) =>
          response.url().endsWith("/api/threads/open") && response.request().method() === "POST",
      )
      .catch(() => null);
    await secondPage.getByTestId(`project-thread-row-${threadId}`).click();
    const openResponse = await openResponsePromise;
    if (openResponse) {
      expect(openResponse.ok(), await openResponse.text()).toBe(true);
    }
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
    expect(realtimeSockets.size).toBe(1);
    expect(secondRealtimeSockets.size).toBe(1);
  } finally {
    await secondContext.close();
  }
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

async function closeRealtimeSockets(page: Page) {
  await page.evaluate(() => {
    (window as any).__closeGatewayRealtimeSockets?.();
  });
}

async function installRealtimeSocketCloser(page: Page) {
  await page.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket;
    const sockets = new Set<WebSocket>();
    class TrackedWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        const rawUrl = String(url);
        if (rawUrl.endsWith("/api/realtime")) {
          sockets.add(this);
          this.addEventListener("close", () => sockets.delete(this));
        }
      }
    }
    window.WebSocket = TrackedWebSocket;
    (window as any).__closeGatewayRealtimeSockets = () => {
      for (const socket of sockets) {
        socket.close();
      }
    };
  });
}
