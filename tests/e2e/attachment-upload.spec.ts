import { createHash } from "node:crypto";
import { z } from "zod";
import { expect, test } from "./fixtures/remote-workspace";
import { openApp } from "./helpers/app";
import { execRemoteSsh } from "./helpers/remote-codex";
import { shellQuote } from "../../server/utils/gateway/infra/ssh/shell";
import { sendRealtimeRequest } from "./helpers/realtime";

const uploadResultSchema = z.object({
  files: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      size: z.number(),
      isImage: z.boolean(),
    }),
  ),
});

test("uploads a ZIP and persists its official thread attachment association", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  const { host, project } = await remoteWorkspace.provision();
  const threadId = await remoteWorkspace.startThread(project.remotePath);

  // A real ZIP containing a short text file; use the browser picker and real SFTP transport.
  const zip = Buffer.from(
    "UEsDBC0ACAAIAJ1FTF0AAAAA//////////8BABQALQEAEAAAAAAAAAAAAAAAAAAAAAAAi/IMUEgsKUlMzshNzStRKC3IyU9MUShKTS9KLS7OzM/jAgBQSwcI462zHyMAAAAAAAAAIQAAAAAAAABQSwECHgMtAAgACACdRUxd462zHyMAAAAhAAAAAQAAAAAAAAABAAAAgBEAAAAALVBLBQYAAAAAAQABAC8AAABuAAAAAAA=",
    "base64",
  );
  await page.getByRole("button", { name: "附加文件或图片" }).click();
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/uploads" && response.request().method() === "POST",
  );
  const pickedFile = { name: "attachment.zip", mimeType: "application/zip", buffer: zip };
  await page.locator('input[type="file"]').setInputFiles([pickedFile, pickedFile]);
  const response = await uploaded;
  expect(response.ok(), await response.text()).toBe(true);
  const result = uploadResultSchema.parse(await response.json());
  expect(result.files).toHaveLength(2);
  const file = result.files[0]!;
  expect(result.files[1]!.path).not.toBe(file.path);
  expect(file).toMatchObject({ name: "attachment.zip", size: zip.length, isImage: false });
  expect(file.path).toMatch(/\/\.codex\/attachments\/[0-9a-f-]{36}\/attachment\.zip$/);
  await expect(page.getByText("attachment.zip", { exact: true })).toHaveCount(2);

  try {
    const remoteFile = await execRemoteSsh(
      remoteWorkspace.remote,
      `sha256sum -- ${shellQuote(file.path)}`,
    );
    expect(remoteFile.stdout.trim().split(/\s+/)[0]).toBe(
      createHash("sha256").update(zip).digest("hex"),
    );
    await page.getByRole("button", { name: "移除附件" }).last().click();
    await expect(page.getByText("attachment.zip", { exact: true })).toHaveCount(1);
    await page.getByPlaceholder("输入后续修改要求").fill("无需读取附件，只回复：附件已收到。");
    await page.getByTestId("send-turn-button").click();
    // The actual picker/send flow must register metadata in Codex, not just leave a remote file
    // or a browser chip. Query through the existing live Gateway socket; no app-server mock.
    const scope = { hostId: host.id, threadId };
    const listAttachments = async () => {
      const response = await sendRealtimeRequest(page, {
        type: "thread.attachments.list",
        requestId: "list-uploaded-attachments",
        ...scope,
      });
      if (response.type !== "thread.attachments.page") throw new Error("Expected attachments");
      return response.data;
    };
    await expect(
      page.getByTestId("chat-scroll-area").locator(".is-assistant").last(),
    ).toContainText("附件已收到", {
      timeout: 180_000,
    });
    await expect.poll(listAttachments, { timeout: 30_000, intervals: [1000] }).toEqual([
      expect.objectContaining({
        attachmentType: "file",
        identityKey: file.path,
        payload: expect.objectContaining({ name: file.name, path: file.path, size: zip.length }),
      }),
    ]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("输入后续修改要求")).toBeEnabled();
    expect(await listAttachments()).toHaveLength(1);
    await sendRealtimeRequest(page, {
      type: "thread.attachment.remove",
      requestId: "remove-uploaded-attachment",
      ...scope,
      attachmentType: "file",
      identityKey: file.path,
    });
    expect(await listAttachments()).toEqual([]);
    // Official removal only removes membership; historical file references must remain usable.
    expect(
      (await execRemoteSsh(remoteWorkspace.remote, `test -f ${shellQuote(file.path)}`)).code,
    ).toBe(0);
  } finally {
    for (const uploadedFile of result.files) {
      await execRemoteSsh(
        remoteWorkspace.remote,
        `rm -- ${shellQuote(uploadedFile.path)} && rmdir -- ${shellQuote(uploadedFile.path.slice(0, uploadedFile.path.lastIndexOf("/")))}`,
      );
    }
  }
});
