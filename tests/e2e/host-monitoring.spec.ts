import { expect, test } from "./fixtures/remote-workspace";
import { openApp } from "./helpers/app";
import { execRemoteSsh } from "./helpers/remote-codex";
import type { HostMetricsSnapshot } from "../../shared/types";
import { parseRealtimeServerMessage } from "../../shared/runtime/realtime";
import {
  activeRealtimeSocketCount,
  installRealtimeSocketProbe,
} from "./helpers/realtime-socket-probe";

test("keeps Host metrics history while the monitor is closed and streams it when reopened", async ({
  page,
  remoteWorkspace,
}) => {
  const snapshots: HostMetricsSnapshot[] = [];
  // Observe the real browser connection; all subscription changes below come from panel actions.
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/api/realtime") return;
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      const message = parseRealtimeServerMessage(JSON.parse(payload));
      if (message.type === "host.metrics.snapshot") snapshots.push(message);
    });
  });
  await installRealtimeSocketProbe(page);
  await openApp(page, { interceptRealtime: false });
  const remote = remoteWorkspace.remote;
  const sampleCount = async () => {
    const { stdout } = await execRemoteSsh(
      remote,
      "if [ -f /tmp/codex-e2e-host-metrics-samples ]; then wc -l < /tmp/codex-e2e-host-metrics-samples; else printf '0\\n'; fi",
    );
    return Number(stdout.trim());
  };
  const beforeConnection = await sampleCount();
  const hostName = `metrics-host-${Date.now()}`;
  const { project } = await remoteWorkspace.provision({
    hostName,
    projectName: "Metrics project",
  });

  await expect(page.getByTestId(`project-button-${project.remotePath}`)).toBeVisible();
  // A connected Host starts collecting even before anyone opens the monitor.
  await expect.poll(sampleCount).toBeGreaterThan(beforeConnection);
  await page.getByTestId("open-host-monitor-button").click();
  const panel = page.getByTestId("host-metrics-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("host-metric-cpu")).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("host-metric-memory")).toBeVisible();
  await expect(panel.getByTestId("host-metric-network")).toBeVisible();
  await expect(panel.getByTestId("host-metric-disk")).toBeVisible();
  await expect(panel.getByText("实时采集中")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "GPU", exact: true })).toBeVisible();
  await expect(panel.getByTestId("host-metric-gpu-0")).toContainText("E2E Training GPU");
  const gpuProcesses = panel.getByTestId("host-gpu-processes");
  await expect(gpuProcesses).toBeVisible();
  await expect(gpuProcesses.getByText("trainer", { exact: true }).first()).toBeVisible();
  await expect(gpuProcesses.getByText("/usr/local/bin/e2e-gpu-training").first()).toBeVisible();
  await expect(gpuProcesses.getByText("6.0 GiB").first()).toBeVisible();
  await expect.poll(() => activeRealtimeSocketCount(page)).toBe(1);

  const monitorTab = page.getByRole("tab", { name: "主机监控" });
  await monitorTab.getByLabel(/关闭标签页|Close tab/).click();
  await expect(panel).toBeHidden();
  const closedAt = Date.now();
  const samplesWhenClosed = await sampleCount();
  // Wait for multiple background samples so reopening cannot masquerade as continuous history.
  await expect.poll(sampleCount, { timeout: 30_000 }).toBeGreaterThan(samplesWhenClosed + 1);
  const reopenedAt = Date.now();
  const previousSnapshots = snapshots.length;
  await page.getByTestId("open-host-monitor-button").click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: hostName })).toBeVisible();
  await expect(panel.getByTestId("host-metric-cpu")).toBeVisible();
  await expect.poll(() => snapshots.length).toBeGreaterThan(previousSnapshots);
  expect(
    snapshots.at(-1)?.samples.some((sample) => {
      const sampledAt = Date.parse(sample.sampledAt);
      return sampledAt > closedAt && sampledAt < reopenedAt;
    }),
  ).toBe(true);
});
