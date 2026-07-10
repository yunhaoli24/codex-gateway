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
              text: `Open [markdown target](${origin}${markdownPath}) and [nested python](${origin}${nestedPythonPath}:2).`,
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
    page.getByTestId("remote-file-tree").getByTitle(projectPath, { exact: true }),
  ).toBeVisible();
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
  await expect(page.getByTestId("file-workspace-tab")).toHaveCount(3);
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
