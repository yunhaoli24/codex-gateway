import { expect, type Page } from "@playwright/test";

const chatScrollAreaTestId = "chat-scroll-area";

export async function parkChatViewportInMiddle(page: Page) {
  await expect.poll(() => chatViewportMaxScrollTop(page)).toBeGreaterThan(400);
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
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
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight - 48);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -24 }));
    return viewport.scrollTop;
  });
}

export async function chatViewportScrollTop(page: Page) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    return viewport.scrollTop;
  });
}

export async function chatViewportBottomDistance(page: Page) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    return Math.max(0, viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight);
  });
}

export async function captureVisibleAgentLineAnchor(page: Page) {
  return await captureVisibleTextAnchor(page, "agent loop line ");
}

export async function captureVisibleTextAnchor(page: Page, prefix: string) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement, prefix) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    const viewportRect = viewport.getBoundingClientRect();
    const paragraphs = Array.from(viewport.querySelectorAll("p"));
    const element = paragraphs.find((candidate) => {
      const text = candidate.textContent?.trim() ?? "";
      const rect = candidate.getBoundingClientRect();
      return (
        text.startsWith(prefix) &&
        rect.top >= viewportRect.top + 8 &&
        rect.bottom <= viewportRect.bottom - 8
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
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
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
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
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

export async function scrollChatViewportToBottom(page: Page) {
  await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    // Production intentionally ignores programmatic scroll deltas when deciding
    // whether a detached reader returned to the latest content. Model the real
    // downward user intent before moving the test viewport to the bottom.
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 240 }));
    viewport.scrollTop = viewport.scrollHeight;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

export async function scrollChatViewportToTop(page: Page) {
  await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -240 }));
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

export async function parkCommandOutputInMiddle(page: Page) {
  await expect.poll(() => commandOutputMaxScrollTop(page)).toBeGreaterThan(120);
  return await page
    .getByText("command output line 001")
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
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
      const viewport = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
      if (!viewport) throw new Error("Missing command output viewport");
      return viewport.scrollTop;
    });
}

export async function setDiffScrollLeft(page: Page, text: string, scrollLeft: number) {
  return await page
    .getByText(text)
    .first()
    .evaluate((element: HTMLElement, scrollLeft) => {
      const viewport = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
      if (!viewport) throw new Error("Missing diff viewport");
      viewport.scrollLeft = scrollLeft;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      return viewport.scrollLeft;
    }, scrollLeft);
}

export async function diffScrollLeft(page: Page, text: string) {
  return await page
    .getByText(text)
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
      if (!viewport) throw new Error("Missing diff viewport");
      return viewport.scrollLeft;
    });
}

async function chatViewportMaxScrollTop(page: Page) {
  return await page.getByTestId(chatScrollAreaTestId).evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) return 0;
    return viewport.scrollHeight - viewport.clientHeight;
  });
}

async function commandOutputMaxScrollTop(page: Page) {
  return await page
    .getByText("command output line 001")
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
      if (!viewport) throw new Error("Missing command output viewport");
      return viewport.scrollHeight - viewport.clientHeight;
    });
}
