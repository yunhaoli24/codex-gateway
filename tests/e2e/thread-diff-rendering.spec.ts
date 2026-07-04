import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { seedGatewayThread } from "./helpers/gateway-store";

test("file diff blocks can collapse and expand after virtual timeline measurement", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-diff-thread";
  const diff = [
    "diff --git a/src/example.py b/src/example.py",
    "index 1111111..2222222 100644",
    "--- a/src/example.py",
    "+++ b/src/example.py",
    "@@ -1,2 +1,3 @@",
    " print('before')",
    "-old_value = 'short'",
    "+new_value = 'this is a deliberately long changed line to require horizontal scrolling in the diff viewport'",
    "+print(new_value)",
  ].join("\n");

  await seedGatewayThread(page, {
    threadId,
    projectId: 1,
    currentThread: { id: threadId, name: "Diff UI" },
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-1",
            status: "running",
            items: [
              {
                id: "user-1",
                type: "userMessage",
                content: [{ type: "text", text: "edit a file" }],
              },
              {
                id: "file-change-1",
                type: "fileChange",
                status: "completed",
                changes: [{ path: "src/example.py", kind: "update", diff }],
              },
            ],
          },
        ],
      },
    },
  });

  await openIntermediateSteps(page);
  const toggle = page.getByRole("button", { name: /src\/example\.py/ });
  const diffText = page.getByText("new_value =");
  await expect(toggle).toHaveAttribute("data-state", "open");
  await expect(diffText).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".diff-markdown").first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(24);

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "closed");
  await expect(diffText).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "open");
  await expect(diffText).toBeVisible();
});

test("short command output uses natural height instead of a fixed minimum", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-short-command-output-thread";
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Short Command Output" },
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-short-command",
            status: "running",
            items: [
              {
                id: "command-short-1",
                type: "commandExecution",
                status: "completed",
                command: "pwd",
                aggregatedOutput: "/tmp/e2e\n",
              },
            ],
          },
        ],
      },
    },
  });

  await openIntermediateSteps(page);
  await page.getByRole("button", { name: /pwd/ }).click();
  await expect(page.getByText("/tmp/e2e")).toBeVisible();
  await expect
    .poll(async () =>
      page.getByText("/tmp/e2e").evaluate((element: HTMLElement) => {
        const scrollArea = element.closest('[data-slot="scroll-area"]') as HTMLElement | null;
        if (!scrollArea) throw new Error("Missing command output scroll area");
        return scrollArea.getBoundingClientRect().height;
      }),
    )
    .toBeLessThan(96);
});

async function openIntermediateSteps(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /中间过程/ }).first();
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("data-state")) !== "open") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("data-state", "open");
}
