import { expect, test } from "@playwright/test";
import type { HostRecord, ProjectRecord } from "../../shared/types";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { seedGatewayThread } from "./helpers/gateway-store";
import { execRemoteSsh, readRemoteEnv } from "./helpers/remote-codex";

test("the unified file workspace browses, restores, and refreshes real remote files", async ({
  page,
}) => {
  const remote = await readRemoteEnv();
  await openApp(page);

  const projectPath = `/home/${remote.username}`;
  const remotePath = `${projectPath}/codex-gateway-preview-${Date.now()}.ts`;
  const markdownPath = `${projectPath}/codex-gateway-preview-${Date.now()}.md`;
  const nestedPythonPath = `${projectPath}/deep/prefix/model_${Date.now()}.py`;
  const unknownTextPath = `${projectPath}/codex-gateway-preview-${Date.now()}.customformat`;
  const binaryPath = `${projectPath}/codex-gateway-preview-${Date.now()}.bin`;
  const longFilePath = `${projectPath}/${"very-long-file-name-".repeat(8)}preview.log`;
  const wideTable = `| metric | sample-a | sample-b | sample-c |
| --- | --- | --- | --- |
| very-long-column | ${"unbroken-value-".repeat(12)}a | ${"unbroken-value-".repeat(12)}b | ${"unbroken-value-".repeat(12)}c |`;
  await execRemoteSsh(
    remote,
    `
set -eu
mkdir -p ${shellQuote(projectPath)} ${shellQuote(`${projectPath}/deep/prefix`)}
cat > ${shellQuote(remotePath)} <<'EOF'
export function previewMarker() {
  return "codex-gateway-file-preview";
}
EOF
cat > ${shellQuote(markdownPath)} <<'EOF'
# Rendered Markdown Preview

This **markdown file** should render as HTML.
EOF
cat > ${shellQuote(nestedPythonPath)} <<'EOF'
def nested_preview_marker():
    return "codex-gateway-nested-python"
EOF
cat > ${shellQuote(unknownTextPath)} <<'EOF'
feature_enabled=true
unknown extensions still render as text
EOF
printf '\\000\\001\\002codex-gateway-binary' > ${shellQuote(binaryPath)}
printf '%s\n' 'long file names stay inside the tree' > ${shellQuote(longFilePath)}
`,
  );

  const host = await authenticatedFetch<HostRecord>(page, {
    url: "/api/hosts",
    method: "POST",
    body: {
      name: `file-preview-host-${Date.now()}`,
      sshHost: remote.host,
      username: remote.username,
      port: Number(remote.port),
      authMode: "password",
      password: remote.password,
      proxyUrl: remote.proxyUrl ?? null,
    },
  });
  const project = await authenticatedFetch<ProjectRecord>(page, {
    url: "/api/projects",
    method: "POST",
    body: {
      hostId: host.id,
      name: `file-preview-project-${Date.now()}`,
      remotePath: projectPath,
    },
  });
  const origin = await page.evaluate(() => window.location.origin);
  const threadId = `file-preview-thread-${Date.now()}`;
  const latestHistory = {
    thread: {
      id: threadId,
      turns: [
        {
          id: "file-preview-turn-md",
          status: "completed",
          items: [
            {
              id: "file-preview-md-message",
              type: "agentMessage",
              phase: "final_answer",
              text: `Open [markdown target](${origin}${markdownPath}), [nested python](${origin}${nestedPythonPath}:2), [unknown text](${origin}${unknownTextPath}), and [binary target](${origin}${binaryPath}).\n\n${wideTable}`,
            },
          ],
        },
      ],
    },
  };
  await seedGatewayThread(page, {
    hostId: host.id,
    projectId: project.id,
    host: { ...host },
    project: { ...project },
    threadId,
    currentThread: { id: threadId, name: "File Preview Thread", cwd: projectPath },
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "file-preview-turn",
            status: "completed",
            items: [
              {
                id: "file-preview-agent-message",
                type: "agentMessage",
                phase: "final_answer",
                text: `Open [preview target](${origin}${remotePath}:2) from this message.`,
              },
            ],
          },
        ],
      },
    },
  });

  await expect(filesWorkspaceTab(page)).toBeVisible();
  await page.getByRole("link", { name: "preview target" }).click();
  const panel = page.getByTestId("workspace-file-panel");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "向右分屏" }).click();
  await expect(page.getByTestId("chat-main-pane")).toBeVisible();
  await expect(panel).toBeVisible();
  const [agentDockBox, filesDockBox] = await Promise.all([
    page.getByTestId("chat-main-pane").boundingBox(),
    panel.boundingBox(),
  ]);
  const dockBoundary = (agentDockBox!.x + agentDockBox!.width + filesDockBox!.x) / 2;
  await page.mouse.move(dockBoundary, agentDockBox!.y + agentDockBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(dockBoundary - agentDockBox!.width * 0.1, agentDockBox!.y + 40);
  await page.mouse.up();
  await expect
    .poll(async () => (await page.getByTestId("chat-main-pane").boundingBox())!.width)
    .toBeLessThan(agentDockBox!.width);
  const [resizedAgentDockBox, resizedFilesDockBox] = await Promise.all([
    page.getByTestId("chat-main-pane").boundingBox(),
    panel.boundingBox(),
  ]);
  const dockWidthRatio =
    resizedAgentDockBox!.width / (resizedAgentDockBox!.width + resizedFilesDockBox!.width);
  await expect(
    page
      .getByTestId("remote-file-tree")
      .locator(":scope > div")
      .first()
      .getByTitle(projectPath, { exact: true }),
  ).toBeVisible();
  const tree = page.getByTestId("remote-file-tree");
  const treeScroll = page.getByTestId("remote-file-tree-scroll");
  const longFileLabel = tree.getByTitle(longFilePath, { exact: true });
  const longFileRow = longFileLabel.locator("xpath=..");
  await expect(longFileLabel).toBeVisible();

  const treePane = page.getByTestId("file-tree-pane");
  const separator = page.getByTestId("file-workspace-separator");
  const splitPane = treePane.locator("xpath=..");
  const [initialTreePaneBox, separatorBox, splitPaneBox] = await Promise.all([
    treePane.boundingBox(),
    separator.boundingBox(),
    splitPane.boundingBox(),
  ]);
  await page.mouse.move(separatorBox!.x + separatorBox!.width / 2, separatorBox!.y + 20);
  await page.mouse.down();
  await page.mouse.move(splitPaneBox!.x + splitPaneBox!.width * 0.15, separatorBox!.y + 20);
  await page.mouse.up();
  await expect
    .poll(async () => (await treePane.boundingBox())!.width)
    .toBeLessThan(initialTreePaneBox!.width);
  const [resizedTreePaneBox, resizedSeparatorBox] = await Promise.all([
    treePane.boundingBox(),
    separator.boundingBox(),
  ]);
  expect(
    Math.abs(resizedTreePaneBox!.x + resizedTreePaneBox!.width - resizedSeparatorBox!.x),
  ).toBeLessThan(2);
  await expect
    .poll(() => treeScroll.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true);
  await treeScroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => treeScroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await treeScroll.evaluate((element) => {
    element.scrollLeft = 0;
  });

  await longFileRow.click({ position: { x: 20, y: 16 } });
  await expect(fileTab(page, longFilePath)).toBeVisible();
  await longFileRow.click({ button: "right", position: { x: 20, y: 16 } });
  await page.getByRole("menuitem", { name: "复制绝对路径" }).click();
  await expect(page.getByText("已复制绝对路径")).toBeVisible();

  await longFileRow.click({ button: "right", position: { x: 20, y: 16 } });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载文件" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(longFilePath.split("/").pop());

  await longFileRow.click({ button: "right", position: { x: 20, y: 16 } });
  await page.getByRole("menuitem", { name: "删除文件" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(longFilePath);
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/remote/files?") && response.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "永久删除" }).click();
  const deleteResponse = await deleteResponsePromise;
  expect(deleteResponse.ok(), await deleteResponse.text()).toBe(true);
  await expect(longFileLabel).toBeHidden();
  await expect(fileTab(page, longFilePath)).toBeHidden();

  await expect(fileTab(page, remotePath)).toBeVisible();
  await expect(panel.getByText("codex-gateway-file-preview")).toBeVisible();
  await expect(panel.locator('[data-preview-line="2"]')).toHaveClass(/bg-primary/);

  await page
    .getByTestId("remote-file-tree")
    .getByText(markdownPath.split("/").pop()!, { exact: true })
    .click();
  await expect(fileTab(page, markdownPath)).toBeVisible();
  await expect(panel.locator(".markdown-content h1")).toHaveText("Rendered Markdown Preview");

  await seedGatewayThread(page, {
    hostId: host.id,
    projectId: project.id,
    host: { ...host },
    project: { ...project },
    threadId,
    currentThread: { id: threadId, name: "File Preview Thread", cwd: projectPath },
    history: latestHistory,
  });

  await agentWorkspaceTab(page).click();
  const renderedTable = page.locator(".markdown-content table").filter({
    hasText: "very-long-column",
  });
  await expect(renderedTable).toBeVisible();
  await expect(renderedTable).toHaveCSS("overflow-x", "auto");
  const [markdownBox, tableBox] = await Promise.all([
    renderedTable.locator("xpath=..").boundingBox(),
    renderedTable.boundingBox(),
  ]);
  expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(markdownBox!.x + markdownBox!.width);
  await page.getByRole("link", { name: "markdown target" }).click();
  await expect(fileTab(page, markdownPath)).toBeVisible();
  await expect(panel.locator(".markdown-content h1")).toHaveText("Rendered Markdown Preview");
  await expect(panel.locator(".markdown-content strong")).toHaveText("markdown file");

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "nested python" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(fileTab(page, nestedPythonPath)).toBeVisible();
  await expect(
    page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="files"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId("file-workspace-tab")).toHaveCount(3);
  await expect(panel.getByText("codex-gateway-nested-python")).toBeVisible();
  await expect(panel.locator('[data-preview-line="2"]')).toHaveClass(/bg-primary/);

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "unknown text" }).click();
  await expect(fileTab(page, unknownTextPath)).toBeVisible();
  await expect(panel.getByText("unknown extensions still render as text")).toBeVisible();

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "binary target" }).click();
  await expect(fileTab(page, binaryPath)).toBeVisible();
  await expect(panel.getByText("无法以文本方式显示此文件")).toBeVisible();

  await fileTab(page, nestedPythonPath).click();

  await reloadApp(page);
  await seedGatewayThread(page, {
    hostId: host.id,
    projectId: project.id,
    host: { ...host },
    project: { ...project },
    threadId,
    currentThread: { id: threadId, name: "File Preview Thread", cwd: projectPath },
    history: latestHistory,
  });
  await expect(filesWorkspaceTab(page)).toBeVisible();
  await expect(page.getByTestId("chat-main-pane")).toBeVisible();
  await expect(panel).toBeVisible();
  const [restoredAgentDockBox, restoredFilesDockBox] = await Promise.all([
    page.getByTestId("chat-main-pane").boundingBox(),
    panel.boundingBox(),
  ]);
  const restoredDockRatio =
    restoredAgentDockBox!.width / (restoredAgentDockBox!.width + restoredFilesDockBox!.width);
  expect(Math.abs(restoredDockRatio - dockWidthRatio)).toBeLessThan(0.08);
  await expect(page.getByTestId("file-workspace-tab")).toHaveCount(5);
  await expect(panel.getByText("codex-gateway-nested-python")).toBeVisible();

  await execRemoteSsh(
    remote,
    `sleep 1; printf '%s\n' 'def nested_preview_marker():' '    return "remote-file-refreshed"' > ${shellQuote(nestedPythonPath)}`,
  );
  await agentWorkspaceTab(page).click();
  await filesWorkspaceTab(page).click();
  await expect(panel.getByText("remote-file-refreshed")).toBeVisible();

  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("dock-popout-group").last().click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup.getByTestId("workspace-file-panel")).toBeVisible();

  const alternateThreadId = `${threadId}-alternate`;
  await seedGatewayThread(page, {
    hostId: host.id,
    projectId: project.id,
    host: { ...host },
    project: { ...project },
    threadId: alternateThreadId,
    currentThread: { id: alternateThreadId, name: "Alternate File Thread", cwd: projectPath },
  });
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.getByTestId("chat-main-pane")).toBeVisible();

  let reopenedPopouts = 0;
  page.on("popup", () => reopenedPopouts++);
  await seedGatewayThread(page, {
    hostId: host.id,
    projectId: project.id,
    host: { ...host },
    project: { ...project },
    threadId,
    currentThread: { id: threadId, name: "File Preview Thread", cwd: projectPath },
    history: latestHistory,
  });
  await expect(page.getByTestId("chat-main-pane")).toBeVisible();
  await expect(panel).toBeVisible();
  await page.waitForTimeout(300);
  expect(reopenedPopouts).toBe(0);
});

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function agentWorkspaceTab(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="agent"]');
}

function filesWorkspaceTab(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="files"]');
}

function fileTab(page: import("@playwright/test").Page, path: string) {
  return page.locator(`[data-testid="file-workspace-tab"][data-file-path=${JSON.stringify(path)}]`);
}
