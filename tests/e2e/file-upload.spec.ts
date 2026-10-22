import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, resetGatewayConfig } from "./helpers/app";
import { execRemoteSsh } from "./helpers/remote-codex";
import { shellQuote } from "../../server/utils/gateway/infra/ssh/shell";
import { z } from "zod";

test("uploads project files through the picker and folder drop without replacing existing files", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  const name = `file-upload-${Date.now()}`;
  const root = `/home/${remoteWorkspace.remote.username}/${name}`;
  const directory = `${root}/incoming`;
  const outside = `/home/${remoteWorkspace.remote.username}/${name}-outside`;
  await execRemoteSsh(
    remoteWorkspace.remote,
    `mkdir -p ${shellQuote(directory)} ${shellQuote(outside)} && ln -s ${shellQuote(outside)} ${shellQuote(`${directory}/escape`)}`,
  );
  const { host, project } = await remoteWorkspace.provision({ remotePath: root });
  const threadId = await remoteWorkspace.startThread(project.remotePath);
  try {
    await page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="files"]').click();
    const tree = page.getByTestId("remote-file-tree");
    const folder = tree.locator(`[data-file-path="${directory}"]`);
    await folder.click();
    const selected = {
      name: "picked.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("picker bytes\n"),
    };
    const picker = page.waitForEvent("filechooser");
    await tree.getByRole("button", { name: "上传文件", exact: true }).click();
    await (await picker).setFiles([selected]);
    const progress = page.getByTestId("workspace-upload-progress");
    await expect(progress).toBeVisible();
    await expect(progress.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    await expect(tree.locator(`[data-file-path="${directory}/picked.txt"]`)).toBeVisible();
    await expect(progress.getByText("上传完成", { exact: true })).toBeVisible();
    await expect(progress.getByText("已上传 1/1 个文件", { exact: true })).toBeVisible();
    // Upload details live in a dismissible overlay, leaving the directory list in place.
    await expect(tree.getByRole("progressbar")).toHaveCount(0);
    await progress.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(progress).not.toBeVisible();
    await tree.getByRole("button", { name: "上传文件", exact: true }).click();
    await expect(progress.getByText(selected.name, { exact: true })).toBeVisible();
    const duplicatePicker = page.waitForEvent("filechooser");
    await progress.getByRole("button", { name: "选择文件", exact: true }).click();
    await (await duplicatePicker).setFiles([selected]);
    await expect(progress.getByText("文件已存在，请使用其他文件名", { exact: true })).toBeVisible();
    await progress.getByRole("button", { name: "关闭", exact: true }).click();
    expect(
      (await execRemoteSsh(remoteWorkspace.remote, `cat ${shellQuote(`${directory}/picked.txt`)}`))
        .stdout,
    ).toBe("picker bytes\n");

    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array([0, 1, 2, 255])], "dropped.bin", {
          type: "application/octet-stream",
        }),
      );
      data.items.add(new File(["second file"], "second.txt", { type: "text/plain" }));
      return data;
    });
    await folder.dispatchEvent("dragover", { dataTransfer: transfer });
    await expect(folder).toHaveAttribute("data-upload-target", "true");
    await folder.dispatchEvent("drop", { dataTransfer: transfer });
    await expect(tree.locator(`[data-file-path="${directory}/dropped.bin"]`)).toBeVisible();
    await expect(tree.locator(`[data-file-path="${directory}/second.txt"]`)).toBeVisible();
    await expect(progress.getByText("已上传 2/2 个文件", { exact: true })).toBeVisible();
    await progress.getByRole("button", { name: "关闭", exact: true }).click();
    expect(
      (
        await execRemoteSsh(
          remoteWorkspace.remote,
          `od -An -tu1 ${shellQuote(`${directory}/dropped.bin`)}`,
        )
      ).stdout.trim(),
    ).toMatch(/0\s+1\s+2\s+255/);
    await transfer.dispose();

    // Exercise the authenticated HTTP boundary too: forged destinations, symlinks, duplicate
    // names and concurrent requests must not escape the project or replace existing bytes.
    const upload = async (path: string, fileName: string, contents: string, claimedRoot = root) => {
      const result = await page.evaluate(
        async (input) => {
          const form = new FormData();
          form.append("files", new File([input.contents], input.fileName));
          const query = new URLSearchParams({
            hostId: String(input.hostId),
            rootPath: input.root,
            path: input.path,
          });
          const response = await fetch(`/api/remote/uploads?${query}`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${localStorage.getItem("codex-gateway-auth-token")}`,
            },
            body: form,
          });
          return { status: response.status, body: await response.text() };
        },
        { hostId: host.id, root: claimedRoot, path, fileName, contents },
      );
      const files =
        result.status === 200
          ? z
              .object({
                files: z.array(
                  z.object({
                    name: z.string(),
                    path: z.string().optional(),
                    error: z.string().optional(),
                  }),
                ),
              })
              .parse(JSON.parse(result.body)).files
          : [];
      return { status: result.status, files };
    };
    const duplicate = await upload(directory, "picked.txt", "must not replace");
    expect(duplicate.status).toBe(200);
    expect(duplicate.files[0]).toMatchObject({
      name: "picked.txt",
      error: "remoteFileAlreadyExists",
    });
    for (const path of [outside, `${root}/../${name}-outside`, `${directory}/escape`]) {
      expect((await upload(path, "forbidden.txt", "outside")).status).toBe(403);
    }
    expect((await upload(outside, "forbidden.txt", "outside", outside)).status).toBe(403);
    await authenticatedFetch(
      page,
      {
        url: "/api/projects",
        method: "POST",
        body: {
          hostId: host.id,
          name: "000-parent-project",
          remotePath: `/home/${remoteWorkspace.remote.username}`,
        },
      },
      () => undefined,
    );
    expect((await upload(`${directory}/escape`, "forbidden.txt", "outside")).status).toBe(403);
    const concurrent = await Promise.all([
      upload(directory, "race.txt", "first"),
      upload(directory, "race.txt", "second"),
    ]);
    expect(concurrent.map((result) => result.status)).toEqual([200, 200]);
    expect(concurrent.filter((result) => result.files[0]?.error === undefined)).toHaveLength(1);
    expect(
      concurrent.filter((result) => result.files[0]?.error === "remoteFileAlreadyExists"),
    ).toHaveLength(1);
    expect(
      (await execRemoteSsh(remoteWorkspace.remote, `cat ${shellQuote(`${directory}/picked.txt`)}`))
        .stdout,
    ).toBe("picker bytes\n");
    expect(
      (await execRemoteSsh(remoteWorkspace.remote, `find ${shellQuote(outside)} -type f`)).stdout,
    ).toBe("");
    expect(
      (
        await execRemoteSsh(
          remoteWorkspace.remote,
          `find ${shellQuote(directory)} -name '.codex-gateway-upload-*'`,
        )
      ).stdout,
    ).toBe("");
  } finally {
    try {
      await authenticatedFetch(
        page,
        { url: "/api/e2e/archive-threads", method: "POST", body: { hostId: host.id, threadId } },
        () => undefined,
      );
    } finally {
      await execRemoteSsh(
        remoteWorkspace.remote,
        `rm -rf -- ${shellQuote(root)} ${shellQuote(outside)}`,
      );
      await resetGatewayConfig(page);
    }
  }
});
