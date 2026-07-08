import { expect, test } from "@playwright/test";
import type { HostRecord, ProjectRecord } from "../../shared/types";
import { authenticatedFetch, openApp } from "./helpers/app";
import { seedGatewayThread } from "./helpers/gateway-store";
import { execRemoteSsh, readRemoteEnv } from "./helpers/remote-codex";

test("agent file links open a real remote code preview in the inspector", async ({ page }) => {
  const remote = await readRemoteEnv();
  await openApp(page);

  const projectPath = `/home/${remote.username}`;
  const remotePath = `${projectPath}/codex-gateway-preview-${Date.now()}.ts`;
  await execRemoteSsh(
    remote,
    `
set -eu
mkdir -p ${shellQuote(projectPath)}
cat > ${shellQuote(remotePath)} <<'EOF'
export function previewMarker() {
  return "codex-gateway-file-preview";
}
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
  await seedGatewayThread(page, {
    hostId: host.id,
    projectId: project.id,
    host: { ...host },
    project: { ...project },
    threadId,
    currentThread: { id: threadId, name: "File Preview Thread" },
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

  await page.getByRole("link", { name: "preview target" }).click();
  const panel = page.getByTestId("thread-inspector-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("inspector-panel-title")).toHaveText(remotePath.split("/").pop()!);
  await expect(panel.getByText("codex-gateway-file-preview")).toBeVisible();
  await expect(panel.locator('[data-preview-line="2"]')).toHaveClass(/bg-primary/);
});

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
