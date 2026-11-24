import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, resetGatewayConfig } from "./helpers/app";
import { execRemoteSsh } from "./helpers/remote-codex";
import { shellQuote } from "../../server/utils/gateway/infra/ssh/shell";

test("downloads a folder ZIP from Files without following symlinks outside the project", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  const root = `/home/${remoteWorkspace.remote.username}/file-zip-${Date.now()}`;
  const folder = `${root}/folder with spaces`;
  const outside = `${root}-outside`;
  await execRemoteSsh(
    remoteWorkspace.remote,
    [
      `mkdir -p ${shellQuote(`${folder}/nested/empty`)} ${shellQuote(outside)}`,
      `printf 'hello\\n' > ${shellQuote(`${folder}/nested/.hidden.txt`)}`,
      `printf 'private' > ${shellQuote(`${outside}/private.txt`)}`,
      `ln -s ${shellQuote(outside)} ${shellQuote(`${folder}/escape`)}`,
      `ln -s ${shellQuote(`${outside}/private.txt`)} ${shellQuote(`${folder}/link.txt`)}`,
    ].join(" && "),
  );

  try {
    const { host, project } = await remoteWorkspace.provision({ remotePath: root });
    const threadId = await remoteWorkspace.startThread(project.remotePath);
    try {
      await page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="files"]').click();
      const folderRow = page
        .getByTestId("remote-file-tree")
        .locator(`[data-file-path="${folder}"]`);
      await folderRow.click({ button: "right" });
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: "将文件夹下载为 ZIP" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("folder with spaces.zip");
      const files = unzipSync(await readFile(await download.path()));
      expect(Object.keys(files).sort()).toEqual([
        "folder with spaces/",
        "folder with spaces/nested/",
        "folder with spaces/nested/.hidden.txt",
        "folder with spaces/nested/empty/",
      ]);
      expect(Buffer.from(files["folder with spaces/nested/.hidden.txt"] ?? []).toString()).toBe(
        "hello\n",
      );

      for (const path of [outside, `${folder}/escape`]) {
        const query = new URLSearchParams({ hostId: String(host.id), rootPath: root, path });
        const response = await page.request.get(`/api/remote/folder-zip?${query}`, {
          headers: {
            authorization: `Bearer ${await page.evaluate(() =>
              localStorage.getItem("codex-gateway-auth-token"),
            )}`,
          },
        });
        expect(response.status()).toBe(403);
      }
    } finally {
      await authenticatedFetch(
        page,
        { url: "/api/e2e/archive-threads", method: "POST", body: { hostId: host.id, threadId } },
        () => undefined,
      );
    }
  } finally {
    await execRemoteSsh(
      remoteWorkspace.remote,
      `rm -rf -- ${shellQuote(root)} ${shellQuote(outside)}`,
    );
    await resetGatewayConfig(page);
  }
});
