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
  await expect(
    page
      .getByTestId("remote-file-tree")
      .locator(":scope > div")
      .first()
      .getByTitle(projectPath, { exact: true }),
  ).toBeVisible();
  const tree = page.getByTestId("remote-file-tree");
  const longFileLabel = tree.getByTitle(longFilePath, { exact: true });
  await expect(longFileLabel).toBeVisible();
  await expect(longFileLabel).toHaveCSS("text-overflow", "ellipsis");
  const [treeBox, longFileLabelBox] = await Promise.all([
    tree.boundingBox(),
    longFileLabel.boundingBox(),
  ]);
  expect(longFileLabelBox!.x + longFileLabelBox!.width).toBeLessThanOrEqual(
    treeBox!.x + treeBox!.width,
  );

  await longFileLabel.click();
  await expect(fileTab(page, longFilePath)).toBeVisible();
  await longFileLabel.click({ button: "right" });
  await page.getByRole("menuitem", { name: "复制绝对路径" }).click();
  await expect(page.getByText("已复制绝对路径")).toBeVisible();

  await longFileLabel.click({ button: "right" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "下载文件" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(longFilePath.split("/").pop());

  await longFileLabel.click({ button: "right" });
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
  await expect(page.locator('[data-testid="workspace-tab"][data-tab-kind="files"]')).toHaveCount(1);
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
  await filesWorkspaceTab(page).click();
  await expect(page.getByTestId("file-workspace-tab")).toHaveCount(5);
  await expect(panel.getByText("codex-gateway-nested-python")).toBeVisible();

  await execRemoteSsh(
    remote,
    `sleep 1; printf '%s\n' 'def nested_preview_marker():' '    return "remote-file-refreshed"' > ${shellQuote(nestedPythonPath)}`,
  );
  await agentWorkspaceTab(page).click();
  await filesWorkspaceTab(page).click();
  await expect(panel.getByText("remote-file-refreshed")).toBeVisible();
});

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function agentWorkspaceTab(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="workspace-tab"][data-tab-kind="agent"]');
}

function filesWorkspaceTab(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="workspace-tab"][data-tab-kind="files"]');
}

function fileTab(page: import("@playwright/test").Page, path: string) {
  return page.locator(`[data-testid="file-workspace-tab"][data-file-path=${JSON.stringify(path)}]`);
}
