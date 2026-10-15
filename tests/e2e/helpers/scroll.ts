import { expect, type Locator, type Page } from "@playwright/test";

const chatScrollAreaTestId = "chat-scroll-area";

export async function parkChatViewportInMiddle(page: Page) {
  await expect.poll(() => chatViewportMaxScrollTop(page)).toBeGreaterThan(400);
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -240 }));
    viewport.scrollTop = Math.floor((viewport.scrollHeight - viewport.clientHeight) / 2);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    return viewport.scrollTop;
  });
}

export async function detachChatViewportNearBottom(page: Page) {
  await expect.poll(() => chatViewportMaxScrollTop(page)).toBeGreaterThan(400);
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight - 48);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -24 }));
    return viewport.scrollTop;
  });
}

export async function chatViewportScrollTop(page: Page) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    return viewport.scrollTop;
  });
}

export async function chatViewportBottomDistance(page: Page) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    return Math.max(0, viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight);
  });
}

export async function waitForScrollableChatViewportAtBottom(page: Page, minimumScrollRange = 400) {
  // WebKit can expose the first visible rows before ResizeObserver has committed the virtual
  // document height. Starting a synthetic gesture in that window only changes the intent state:
  // scrollTop is still zero, so the test never models a reader moving away from the latest edge.
  // Wait on user-visible geometry rather than framework timers, then require the initial chat
  // contract (newly opened timelines start at the latest content) before touching the viewport.
  await expect.poll(() => chatViewportMaxScrollTop(page)).toBeGreaterThan(minimumScrollRange);
  await expect.poll(() => chatViewportBottomDistance(page)).toBeLessThanOrEqual(2);
}

export async function captureVisibleAgentLineAnchor(page: Page) {
  return await captureVisibleTextAnchor(page, "agent loop line ");
}

export async function captureVisibleTextAnchor(page: Page, prefix: string) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement, prefix) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const viewportRect = viewport.getBoundingClientRect();
    const paragraphs = Array.from(viewport.querySelectorAll("p"));
    const element = paragraphs.find((candidate) => {
      const text = candidate.textContent?.trim() ?? "";
      const rect = candidate.getBoundingClientRect();
      return (
        text.startsWith(prefix) &&
        // A single Markdown paragraph can be taller than a mobile viewport.
        // It is still a valid visual anchor when it intersects the viewport;
        // requiring the entire element to fit turns a real scrolling test into
        // a false negative as soon as the reader reaches such a paragraph.
        rect.bottom >= viewportRect.top + 8 &&
        rect.top <= viewportRect.bottom - 8
      );
    });
    if (!element) {
      throw new Error(`Missing visible text anchor ${prefix}`);
    }
    return {
      text: element.textContent?.trim() ?? "",
      top: element.getBoundingClientRect().top,
    };
  }, prefix);
}

export async function captureTextAnchor(page: Page, text: string) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement, text) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const element = Array.from(viewport.querySelectorAll("p")).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    if (!element) {
      throw new Error(`Missing text anchor ${text}`);
    }
    return {
      text,
      top: element.getBoundingClientRect().top,
    };
  }, text);
}

export async function visibleAgentLineTop(page: Page, text: string) {
  return await visibleTextTop(page, text);
}

export async function visibleTextTop(page: Page, text: string) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement, text) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const element = Array.from(viewport.querySelectorAll("p")).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    if (!element) {
      throw new Error(`Missing visible agent line ${text}`);
    }
    return element.getBoundingClientRect().top;
  }, text);
}

export async function captureVisibleTimelineRowAnchor(page: Page) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const viewportRect = viewport.getBoundingClientRect();
    const rows = Array.from(viewport.querySelectorAll<HTMLElement>("[data-row-key]"));
    const fullyVisible = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top >= viewportRect.top + 8 && rect.bottom <= viewportRect.bottom - 8;
    });
    const intersecting = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom >= viewportRect.top + 8 && rect.top <= viewportRect.bottom - 8;
    });
    const row = fullyVisible ?? intersecting;
    const key = row?.dataset.rowKey;
    if (row === undefined || key === undefined || key === "") {
      throw new Error("Missing visible timeline row anchor");
    }
    return { key, top: row.getBoundingClientRect().top };
  });
}

export async function visibleTimelineRowTop(page: Page, key: string) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement, rowKey) => {
    const row = Array.from(root.querySelectorAll<HTMLElement>("[data-row-key]")).find(
      (candidate) => candidate.dataset.rowKey === rowKey,
    );
    if (!row) throw new Error(`Missing visible timeline row ${rowKey}`);
    return row.getBoundingClientRect().top;
  }, key);
}

export async function expectSyntheticWebKitTouchToRemainReadable(page: Page) {
  // Playwright WebKit can dispatch touch events, but it cannot produce Safari's native
  // touch-driven scroll and momentum. Direct scrollTop writes deliberately bypass the browser
  // anchoring that TanStack's iOS deferred adjustment complements, so pixel and bottom-distance
  // assertions after its flush would test an impossible hybrid. The reliable browser contract in
  // this project is that a measured timeline row remains mounted/readable. Chromium covers exact
  // active-scroll anchoring and detachment; asserting core's at-end flag after script-written
  // WebKit momentum would bind the test to geometry that a real Safari gesture cannot produce.
  await captureVisibleTimelineRowAnchor(page);
}

export async function scrollChatViewportToBottom(page: Page) {
  await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    // Pair the scripted position with the wheel direction a real reader would use. Production
    // derives follow state from resulting viewport geometry; TanStack owns the actual scroll.
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 240 }));
    viewport.scrollTop = viewport.scrollHeight;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

export async function scrollChatViewportToTop(page: Page) {
  await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -240 }));
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

export async function revealVirtualizedChatLocator(page: Page, locator: Locator) {
  // TanStack deliberately unmounts timeline rows outside its overscan window. Playwright's native
  // scrollIntoViewIfNeeded cannot target a node that does not exist yet, so walk the real viewport
  // one screen at a time and let the virtualizer mount each window. Keeping this in the scroll
  // helper avoids weakening production virtualization merely to make an off-screen assertion work.
  await scrollChatViewportToTop(page);
  await waitForBrowserFrames(page, 2);
  for (let index = 0; index < 100; index += 1) {
    if (await locator.isVisible().catch(() => false)) return;
    const moved = await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
      const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!viewport) throw new Error("Missing chat viewport");
      const before = viewport.scrollTop;
      const deltaY = Math.max(1, Math.floor(viewport.clientHeight * 0.8));
      viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY }));
      viewport.scrollTop = Math.min(
        viewport.scrollHeight - viewport.clientHeight,
        viewport.scrollTop + deltaY,
      );
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      return viewport.scrollTop > before;
    });
    await waitForBrowserFrames(page, 2);
    if (!moved) break;
  }
  await expect(locator).toBeVisible();
}

export async function scrollChatViewportBy(page: Page, deltaY: number) {
  const viewport = page
    .getByTestId(chatScrollAreaTestId)
    .locator('[data-slot="scroll-area-viewport"]');
  const before = await chatViewportScrollTop(page);

  // Keep wheel intent and its default scroll in one browser task. Native default handling runs
  // before Vue microtasks or ResizeObserver can mount and measure the newly overscanned window;
  // splitting these operations across Playwright commands introduces an impossible intermediate
  // layout where estimate compensation can consume the requested wheel delta. Do not manually
  // dispatch `scroll`: assigning scrollTop schedules the browser's real event. Wait for movement,
  // not TanStack's scroll-end timer, so the caller still streams during active scrolling.
  await viewport.evaluate((element: HTMLElement, delta) => {
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: delta }));
    element.scrollTop += delta;
  }, deltaY);
  await expect
    .poll(async () => {
      const after = await chatViewportScrollTop(page);
      return deltaY < 0 ? before - after : after - before;
    })
    .toBeGreaterThan(0);

  return { before, after: await chatViewportScrollTop(page) };
}

export async function startChatWheelScrollUp(page: Page, distance = 240) {
  const before = await captureVisibleTimelineRowAnchor(page);

  const root = page.getByTestId(chatScrollAreaTestId);
  const state = await root.evaluate(async (element: HTMLElement, scrollDistance) => {
    const viewport = element.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const scrollTop = viewport.scrollTop;
    viewport.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -scrollDistance }),
    );
    viewport.scrollTop = Math.max(0, scrollTop - scrollDistance);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));

    // Keep observation inside the browser task. A Playwright mouse round-trip can exceed
    // TanStack's official 150ms scroll-end delay and would test the idle state instead. One frame
    // gives Vue time to publish the Virtualizer flag while remaining inside that active window.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      followLatest: element.dataset.followLatest,
      isScrolling: element.dataset.isScrolling,
      moved: scrollTop - viewport.scrollTop,
    };
  }, distance);
  expect(state.followLatest).toBe("false");
  expect(state.isScrolling).toBe("true");
  expect(state.moved).toBeGreaterThan(0);
  const after = await captureVisibleTimelineRowAnchor(page);
  expect(after.key !== before.key || Math.abs(after.top - before.top) > 2).toBe(true);

  return { before, after };
}

export async function startChatTouchScrollUp(page: Page, distance: number) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement, distance) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const touchEvent = (type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "touches", { value: [{ clientY }] });
      return event;
    };
    const before = viewport.scrollTop;
    viewport.dispatchEvent(touchEvent("touchstart", 320));
    // A finger moving down makes the scrollable content travel upward.
    viewport.dispatchEvent(touchEvent("touchmove", 520));
    viewport.scrollTop = Math.max(0, viewport.scrollTop - distance);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    return { before, after: viewport.scrollTop };
  }, distance);
}

export async function continueChatTouchScrollUp(page: Page, distance: number, clientY: number) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate(
    (root: HTMLElement, { distance, clientY }) => {
      const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!viewport) throw new Error("Missing chat viewport");
      const event = new Event("touchmove", { bubbles: true });
      Object.defineProperty(event, "touches", { value: [{ clientY }] });
      const before = viewport.scrollTop;
      viewport.dispatchEvent(event);
      viewport.scrollTop = Math.max(0, viewport.scrollTop - distance);
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      return { before, after: viewport.scrollTop };
    },
    { distance, clientY },
  );
}

export async function endChatTouchScroll(page: Page) {
  await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    viewport.dispatchEvent(new Event("touchend", { bubbles: true }));
  });
}

export async function waitForChatScrollToSettle(page: Page) {
  // TanStack Virtual intentionally defers scrollTop compensation while iOS WebKit owns an
  // active touch or momentum scroll. Writing scrollTop during that interval cancels native
  // momentum. Its fallback scroll-end detector uses a 150 ms idle window, so tests must assert
  // the visual anchor after that browser-owned phase rather than requiring mid-gesture writes.
  await page.waitForTimeout(350);
  await waitForBrowserFrames(page, 4);
}

export async function continueChatTouchMomentumUp(page: Page, distance: number) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement, distance) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const before = viewport.scrollTop;
    // Native momentum continues with scroll events after touchend. Do not emit
    // another touchmove here: the regression is specifically the period where
    // the browser is moving the viewport without new pointer input.
    viewport.scrollTop = Math.max(0, viewport.scrollTop - distance);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    return { before, after: viewport.scrollTop };
  }, distance);
}

export async function parkCommandOutputInMiddle(page: Page) {
  await expect.poll(() => commandOutputMaxScrollTop(page)).toBeGreaterThan(120);
  return await page
    .getByText("command output line 001")
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!viewport) throw new Error("Missing command output viewport");
      viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -120 }));
      viewport.scrollTop = Math.floor((viewport.scrollHeight - viewport.clientHeight) / 2);
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      return viewport.scrollTop;
    });
}

export async function commandOutputScrollTop(page: Page) {
  return await page
    .getByText("command output line 001")
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!viewport) throw new Error("Missing command output viewport");
      return viewport.scrollTop;
    });
}

export async function setDiffScrollLeft(page: Page, path: string, scrollLeft: number) {
  const viewport = await diffViewport(page, path);
  return await viewport.evaluate((element: HTMLElement, nextScrollLeft) => {
    element.scrollLeft = nextScrollLeft;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
    return element.scrollLeft;
  }, scrollLeft);
}

export async function diffScrollLeft(page: Page, path: string) {
  return await (
    await diffViewport(page, path)
  ).evaluate((element: HTMLElement) => element.scrollLeft);
}

async function diffViewport(page: Page, path: string) {
  const trigger = page.getByRole("button", { name: new RegExp(escapeRegExp(path)) }).first();
  // The rendered code is replaced as streaming Markdown is enhanced, so text nodes are not stable
  // anchors. The file's Collapsible root persists across that replacement, so locate the bounded
  // viewport from the user-visible file trigger instead of from transient highlighted code.
  return trigger
    .locator('xpath=ancestor::*[@data-slot="collapsible"][1]')
    .locator('[data-slot="scroll-area-viewport"]');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function chatViewportMaxScrollTop(page: Page) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return 0;
    return viewport.scrollHeight - viewport.clientHeight;
  });
}

async function commandOutputMaxScrollTop(page: Page) {
  return await page
    .getByText("command output line 001")
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!viewport) throw new Error("Missing command output viewport");
      return viewport.scrollHeight - viewport.clientHeight;
    });
}

async function waitForBrowserFrames(page: Page, count: number) {
  await page.evaluate(
    (frameCount) =>
      new Promise<void>((resolve) => {
        const step = (remaining: number) => {
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(() => step(remaining - 1));
        };
        step(frameCount);
      }),
    count,
  );
}
