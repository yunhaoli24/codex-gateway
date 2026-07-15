import type { Locator, Page } from "@playwright/test";

export function buildTextTurns(start: number, end: number, prefix: string, lineCount = 1) {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const number = start + index;
    const label = String(number).padStart(3, "0");
    return {
      id: `turn-${label}`,
      status: "completed",
      items: [
        {
          id: `agent-${label}`,
          type: "agentMessage",
          phase: "final_answer",
          status: "completed",
          text:
            lineCount === 1
              ? `${prefix} ${label}`
              : [
                  `${prefix} ${label}`,
                  ...Array.from(
                    { length: lineCount - 1 },
                    (_, lineIndex) => `${prefix} ${label} detail ${lineIndex + 1}`,
                  ),
                ].join("\n"),
        },
      ],
    };
  });
}

export async function threadTurnCount(page: Page) {
  return await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) throw new Error("Unable to locate gateway Pinia store");
    return store.history?.thread?.turns?.length ?? 0;
  });
}

export async function installDeferredThreadTurnsLoadStub(page: Page, response: unknown) {
  await installThreadTurnsLoadStub(page, response, true);
}

export async function installThreadTurnsLoadStub(page: Page, response: unknown, deferred: boolean) {
  await page.evaluate(
    ({ response, deferred }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const realtime = app?.config?.globalProperties?.$pinia?._s?.get("gateway-realtime");
      if (!realtime) throw new Error("Unable to locate gateway realtime Pinia store");
      const original = realtime.request.bind(realtime);
      (window as any).__threadTurnsLoadRequests = [];
      if (deferred) {
        (window as any).__threadTurnsLoadResponse = response;
        (window as any).__threadTurnsLoadPromise = new Promise((resolve) => {
          (window as any).__releaseThreadTurnsLoad = () =>
            resolve((window as any).__threadTurnsLoadResponse);
        });
      }
      let requestSequence = 0;
      realtime.request = async (buildMessage: (requestId: string) => any, timeoutMs?: number) => {
        requestSequence += 1;
        const requestId = `e2e-thread-turns-${requestSequence}`;
        const request = buildMessage(requestId);
        if (request?.type !== "thread.turns.load") {
          return original(buildMessage, timeoutMs);
        }
        (window as any).__threadTurnsLoadRequests.push(request);
        return deferred ? await (window as any).__threadTurnsLoadPromise : response;
      };
    },
    { response, deferred },
  );
}

export async function releaseDeferredThreadTurnsLoad(page: Page) {
  await page.evaluate(() => {
    const release = (window as any).__releaseThreadTurnsLoad;
    if (typeof release !== "function") {
      throw new Error("Missing deferred thread turns release callback");
    }
    release();
  });
}

export async function threadTurnsLoadRequests(page: Page) {
  return await page.evaluate(() => (window as any).__threadTurnsLoadRequests ?? []);
}

export async function startElementTopTracking(page: Page, text: string) {
  await startLocatorTopTracking(page.getByText(text, { exact: true }));
}

export async function startLocatorTopTracking(locator: Locator) {
  await locator.evaluate((element) => {
    const samples: number[] = [element.getBoundingClientRect().top];
    const track = () => {
      (window as any).__frameTrackerId = requestAnimationFrame(() => {
        (window as any).__frameTrackerTimerId = window.setTimeout(() => {
          samples.push(element.getBoundingClientRect().top);
          track();
        }, 0);
      });
    };
    (window as any).__frameTrackerSamples = samples;
    (window as any).__frameTrackerId = requestAnimationFrame(track);
  });
}

export async function startBottomDistanceTracking(page: Page) {
  await page.getByTestId("chat-scroll-area").evaluate((root) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const distance = () => viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const samples: number[] = [distance()];
    const track = () => {
      (window as any).__frameTrackerId = requestAnimationFrame(() => {
        (window as any).__frameTrackerTimerId = window.setTimeout(() => {
          samples.push(distance());
          track();
        }, 0);
      });
    };
    (window as any).__frameTrackerSamples = samples;
    (window as any).__frameTrackerId = requestAnimationFrame(track);
  });
}

export async function stopFrameTracking(page: Page) {
  return await page.evaluate(() => {
    cancelAnimationFrame((window as any).__frameTrackerId);
    clearTimeout((window as any).__frameTrackerTimerId);
    return ((window as any).__frameTrackerSamples ?? []) as number[];
  });
}

export async function waitForAnimationFrames(page: Page, count: number) {
  await page.evaluate(
    (frameCount) =>
      new Promise<void>((resolve) => {
        const wait = (remaining: number) => {
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(() => wait(remaining - 1));
        };
        wait(frameCount);
      }),
    count,
  );
}

export function frameSpread(samples: number[]) {
  return Math.max(...samples) - Math.min(...samples);
}
