import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { hostRecordSchema, projectRecordSchema } from "./helpers/http-schemas";
import { seedGatewayThread } from "./helpers/gateway-store";
import { execRemoteSsh } from "./helpers/remote-codex";

test("the unified file workspace browses, restores, and refreshes real remote files", async ({
  page,
  remoteWorkspace,
}) => {
  const { remote } = remoteWorkspace;
  await openApp(page);

  const projectPath = `/home/${remote.username}/codex-gateway-file-project-${Date.now()}`;
  const remotePath = `${projectPath}/codex-gateway-preview-${Date.now()}.ts`;
  const markdownPath = `${projectPath}/codex-gateway-preview-${Date.now()}.md`;
  const nestedPythonPath = `${projectPath}/deep/prefix/model_${Date.now()}.py`;
  const outsideWorkspacePath = `/tmp/codex-gateway-outside-${Date.now()}.log`;
  const unknownTextPath = `${projectPath}/codex-gateway-preview-${Date.now()}.customformat`;
  const binaryPath = `${projectPath}/codex-gateway-preview-${Date.now()}.bin`;
  const longFilePath = `${projectPath}/${"very-long-file-name-".repeat(8)}preview.log`;
  const treeStressPath = `${projectPath}/tree-stability-${Date.now()}`;
  const symlinkTargetPath = `/tmp/codex-gateway-symlink-target-${Date.now()}`;
  const symlinkDirectoryPath = `${projectPath}/linked-training-${Date.now()}`;
  const symlinkChildName = `checkpoint-${Date.now()}.log`;
  const nestedRepositoryPath = `${projectPath}/nested-repository-${Date.now()}`;
  const nestedRepositoryFilePath = `${nestedRepositoryPath}/nested-change.ts`;
  const deletedWorktreeDirectoryPath = `${projectPath}/deleted-after-open-${Date.now()}`;
  const deletedWorktreeFilePath = `${deletedWorktreeDirectoryPath}/tracked.txt`;
  const reviewRenamedOriginalPath = `${projectPath}/rename-before-review.txt`;
  const reviewRenamedPath = `${projectPath}/rename-after-review.txt`;
  const reviewDeletedPath = `${projectPath}/deleted-before-review.txt`;
  const reviewAddedPath = `${projectPath}/added-before-review.txt`;
  const wideTable = `| metric | sample-a | sample-b | sample-c |
| --- | --- | --- | --- |
| very-long-column | ${"unbroken-value-".repeat(12)}a | ${"unbroken-value-".repeat(12)}b | ${"unbroken-value-".repeat(12)}c |`;
  await execRemoteSsh(
    remote,
    `
set -eu
mkdir -p ${shellQuote(projectPath)} ${shellQuote(`${projectPath}/deep/prefix`)}
mkdir -p ${shellQuote(symlinkTargetPath)}
printf '%s\n' 'linked training checkpoint' > ${shellQuote(`${symlinkTargetPath}/${symlinkChildName}`)}
ln -sfn ${shellQuote(symlinkTargetPath)} ${shellQuote(symlinkDirectoryPath)}
cat > ${shellQuote(remotePath)} <<'EOF'
export function previewMarker() {
  return "codex-gateway-file-baseline";
}
EOF
cat > ${shellQuote(markdownPath)} <<'EOF'
# Rendered Markdown Preview

This **markdown file** should render as HTML.

Inline formula: $E = mc^2$.

\\[
\\int_0^1 x^2\\,dx = \\frac{1}{3}
\\]
EOF
cat > ${shellQuote(nestedPythonPath)} <<'EOF'
def nested_preview_marker():
    return "codex-gateway-nested-python"
EOF
cat > ${shellQuote(outsideWorkspacePath)} <<'EOF'
outside workspace files still open safely
EOF
mkdir -p ${shellQuote(deletedWorktreeDirectoryPath)}
cat > ${shellQuote(deletedWorktreeFilePath)} <<'EOF'
tracked file remains open while it is deleted remotely
EOF
printf '%s\n' 'renamed file baseline' > ${shellQuote(reviewRenamedOriginalPath)}
printf '%s\n' 'deleted file baseline' > ${shellQuote(reviewDeletedPath)}
for line in $(seq 1 120); do printf '# source line %s\n' "$line" >> ${shellQuote(nestedPythonPath)}; done
git -C ${shellQuote(projectPath)} init -q
git -C ${shellQuote(projectPath)} config user.email codex-gateway-e2e@example.invalid
git -C ${shellQuote(projectPath)} config user.name 'Codex Gateway E2E'
git -C ${shellQuote(projectPath)} add -- ${shellQuote(remotePath)} ${shellQuote(markdownPath)} ${shellQuote(nestedPythonPath)} ${shellQuote(deletedWorktreeFilePath)} ${shellQuote(reviewRenamedOriginalPath)} ${shellQuote(reviewDeletedPath)}
git -C ${shellQuote(projectPath)} commit -qm 'test: establish file preview baseline'
git -C ${shellQuote(projectPath)} mv -- ${shellQuote(reviewRenamedOriginalPath)} ${shellQuote(reviewRenamedPath)}
rm -- ${shellQuote(reviewDeletedPath)}
printf '%s\n' 'staged added file' > ${shellQuote(reviewAddedPath)}
git -C ${shellQuote(projectPath)} add -- ${shellQuote(reviewAddedPath)}
cat > ${shellQuote(remotePath)} <<'EOF'
export function previewMarker() {
  return "codex-gateway-file-preview";
}
EOF
cat > ${shellQuote(unknownTextPath)} <<'EOF'
feature_enabled=true
unknown extensions still render as text
EOF
printf '\\000\\001\\002codex-gateway-binary' > ${shellQuote(binaryPath)}
printf '%s\n' 'long file names stay inside the tree' > ${shellQuote(longFilePath)}
mkdir -p ${shellQuote(nestedRepositoryPath)}
git -C ${shellQuote(nestedRepositoryPath)} init -q
git -C ${shellQuote(nestedRepositoryPath)} config user.email codex-gateway-e2e@example.invalid
git -C ${shellQuote(nestedRepositoryPath)} config user.name 'Codex Gateway E2E'
printf '%s\n' 'export const nestedValue = "baseline";' > ${shellQuote(nestedRepositoryFilePath)}
git -C ${shellQuote(nestedRepositoryPath)} add -- ${shellQuote(nestedRepositoryFilePath)}
git -C ${shellQuote(nestedRepositoryPath)} commit -qm 'test: establish nested repository baseline'
printf '%s\n' 'export const nestedValue = "worktree";' > ${shellQuote(nestedRepositoryFilePath)}
current=${shellQuote(treeStressPath)}
mkdir -p "$current"
for level in $(seq -w 1 14); do
  current="$current/level-$level"
  mkdir -p "$current"
  for file in $(seq -w 1 6); do
    printf 'tree stability %s %s\n' "$level" "$file" > "$current/file-$level-$file.log"
  done
done
`,
  );

  const host = await authenticatedFetch(
    page,
    {
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
    },
    (value) => hostRecordSchema.parse(value),
  );
  const project = await authenticatedFetch(
    page,
    {
      url: "/api/projects",
      method: "POST",
      body: {
        hostId: host.id,
        name: `file-preview-project-${Date.now()}`,
        remotePath: projectPath,
      },
    },
    (value) => projectRecordSchema.parse(value),
  );
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
              text: `Open [markdown target](${origin}${markdownPath}), [nested python](${origin}${nestedPythonPath}:2), [nested repository file](${origin}${nestedRepositoryFilePath}), [deleted worktree file](${origin}${deletedWorktreeFilePath}), [outside workspace](${origin}${outsideWorkspacePath}), [unknown text](${origin}${unknownTextPath}), and [binary target](${origin}${binaryPath}).\n\nInline agent formula: \\(E = mc^2\\).\n\n${wideTable}`,
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
  const symlinkDirectoryLabel = tree.getByTitle(symlinkDirectoryPath, { exact: true });
  const symlinkDirectoryRow = symlinkDirectoryLabel.locator("xpath=..");
  await expect(longFileLabel).toBeVisible();
  await expect(symlinkDirectoryLabel).toBeVisible();
  await expect(tree.getByTitle(remotePath, { exact: true }).locator("xpath=..")).toContainText("M");

  await panel.getByRole("tab", { name: /变更/ }).click();
  const changesTree = panel.getByTestId("git-changes-tree");
  await expect(changesTree).toBeVisible();
  await expect(
    changesTree.locator(`[data-git-change-path=${JSON.stringify(remotePath)}]`),
  ).toContainText("M");
  await expect(
    changesTree.locator(`[data-git-change-path=${JSON.stringify(reviewRenamedPath)}]`),
  ).toContainText("R");
  await expect(
    changesTree.locator(`[data-git-change-path=${JSON.stringify(reviewDeletedPath)}]`),
  ).toContainText("D");
  await expect(
    changesTree.locator(`[data-git-change-path=${JSON.stringify(reviewAddedPath)}]`),
  ).toContainText("A");
  await expect(
    changesTree.locator(`[data-git-change-path=${JSON.stringify(unknownTextPath)}]`),
  ).toContainText("U");
  await changesTree.locator(`[data-git-change-path=${JSON.stringify(remotePath)}]`).click();
  await expect(panel.getByTestId("remote-file-diff-editor")).toContainText(
    "codex-gateway-file-baseline",
  );

  await panel.getByRole("button", { name: "打开完整变更审查" }).click();
  const reviewPanel = page.getByTestId("git-review-panel");
  await expect(reviewPanel).toBeVisible();
  await page
    .getByRole("region", { name: "审查变更" })
    .getByRole("button", { name: "关闭标签页" })
    .click();
  await expect(reviewPanel).toBeHidden();
  await changesTree.locator(`[data-git-change-path=${JSON.stringify(reviewDeletedPath)}]`).click();
  await expect(reviewPanel).toBeVisible();
  await reviewPanel
    .getByTestId("git-changes-tree")
    .locator(`[data-git-change-path=${JSON.stringify(reviewDeletedPath)}]`)
    .click();
  await expect(reviewPanel.getByTestId("git-review-diff-editor")).toContainText(
    "deleted file baseline",
  );
  await page
    .getByRole("region", { name: "审查变更" })
    .getByRole("button", { name: "关闭标签页" })
    .click();
  await expect(reviewPanel).toBeHidden();
  await filesWorkspaceTab(page).click();
  await panel.getByRole("tab", { name: "文件", exact: true }).click();
  await symlinkDirectoryRow.click({ button: "right", position: { x: 20, y: 16 } });
  await page.getByRole("menuitem", { name: "复制绝对路径" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "已复制绝对路径" }).last(),
  ).toBeVisible();
  await symlinkDirectoryRow.click({ position: { x: 20, y: 16 } });
  await expect(tree.getByText(symlinkChildName, { exact: true })).toBeVisible();
  await tree.getByText("deep", { exact: true }).click();
  await tree.getByText("prefix", { exact: true }).click();
  await expect(tree.getByText(nestedPythonPath.split("/").pop()!, { exact: true })).toBeVisible();
  const treeGeometry = await treeScroll.evaluate(async (element) => {
    const samples: Array<[number, number]> = [];
    for (let index = 0; index < 20; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push([element.clientHeight, element.scrollHeight]);
    }
    return samples;
  });
  expect(new Set(treeGeometry.map(([height]) => height)).size).toBe(1);
  expect(new Set(treeGeometry.map(([, height]) => height)).size).toBe(1);

  await tree.getByText(treeStressPath.split("/").pop()!, { exact: true }).click();
  for (let level = 1; level <= 14; level += 1) {
    await tree.getByText(`level-${String(level).padStart(2, "0")}`, { exact: true }).click();
  }
  await expect.poll(() => tree.getByRole("treeitem").count()).toBeGreaterThan(90);
  const expandedTreeGeometry = await treeScroll.evaluate(async (element) => {
    element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) / 2);
    const samples: Array<[number, number, number]> = [];
    for (let index = 0; index < 30; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push([element.scrollTop, element.clientHeight, element.scrollHeight]);
    }
    return samples;
  });
  expect(new Set(expandedTreeGeometry.map(([top]) => top)).size).toBe(1);
  expect(new Set(expandedTreeGeometry.map(([, height]) => height)).size).toBe(1);
  expect(new Set(expandedTreeGeometry.map(([, , height]) => height)).size).toBe(1);

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
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "已复制绝对路径" }).last(),
  ).toBeVisible();

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
  const initialFileTabHeight = (await fileTab(page, remotePath).boundingBox())!.height;
  await expect(panel.getByText("codex-gateway-file-preview")).toBeVisible();
  await expect(panel.getByTestId("remote-file-editor")).toBeVisible();
  await expect(panel.locator(".cm-gitChangeMarker-modified")).toBeVisible();
  await panel.getByRole("button", { name: "变更", exact: true }).click();
  const trackedDiffEditor = panel.getByTestId("remote-file-diff-editor");
  // CodeMirror's inline merge view inserts deleted text beside the replacement in the DOM.
  // Assert its semantic decorations instead of concatenated textContent ("baselinepreview").
  await expect(trackedDiffEditor.locator(".cm-deletedText")).toContainText("baseline");
  await expect(trackedDiffEditor.locator(".cm-changedText")).toContainText("preview");
  await panel.getByRole("button", { name: "下一处变更" }).click();
  await panel.getByRole("button", { name: "源码", exact: true }).click();
  const trackedSourceEditor = panel.getByTestId("remote-file-editor").locator(".cm-content");
  await trackedSourceEditor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    'export function previewMarker() {\n  return "codex-gateway-file-baseline";\n}\n',
  );
  const trackedSaveResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/remote/files?") && response.request().method() === "PUT",
  );
  await page.keyboard.press("ControlOrMeta+S");
  expect((await trackedSaveResponse).ok()).toBe(true);
  await expect(panel.getByText("未修改", { exact: true })).toBeVisible();
  await expect(panel.locator(".cm-gitChangeMarker-modified")).toHaveCount(0);

  await page
    .getByTestId("remote-file-tree")
    .getByText(markdownPath.split("/").pop()!, { exact: true })
    .click();
  await expect(fileTab(page, markdownPath)).toBeVisible();
  await expect(panel.locator(".markdown-content h1")).toHaveText("Rendered Markdown Preview");
  await panel.getByRole("button", { name: "源码" }).click();
  await expect(panel.getByTestId("remote-file-editor")).toContainText("Rendered Markdown Preview");

  await seedGatewayThread(page, {
    hostId: host.id,
    projectId: project.id,
    host: { ...host },
    project: { ...project },
    threadId,
    currentThread: { id: threadId, name: "File Preview Thread", cwd: projectPath },
    history: latestHistory,
  });

  await tree.getByText("deep", { exact: true }).click();
  await expect(tree.getByText("prefix", { exact: true })).toBeHidden();
  await agentWorkspaceTab(page).click();
  const renderedTable = page.locator(".markdown-content table").filter({
    hasText: "very-long-column",
  });
  await expect(renderedTable).toBeVisible();
  await expect(page.locator(".markdown-content .katex")).toBeVisible();
  await expect(renderedTable).toHaveCSS("overflow-x", "auto");
  const [markdownBox, tableBox] = await Promise.all([
    renderedTable.locator("xpath=..").boundingBox(),
    renderedTable.boundingBox(),
  ]);
  expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(markdownBox!.x + markdownBox!.width);
  await page.getByRole("link", { name: "markdown target" }).click();
  await expect(fileTab(page, markdownPath)).toBeVisible();
  await panel.getByRole("button", { name: "预览" }).click();
  await expect(panel.locator(".markdown-content h1")).toHaveText("Rendered Markdown Preview");
  await expect(panel.locator(".markdown-content strong")).toHaveText("markdown file");
  await expect(panel.locator(".markdown-content .katex")).toHaveCount(2);
  await expect(panel.locator(".markdown-content .katex-display")).toHaveCount(1);

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "nested repository file" }).click();
  await expect(fileTab(page, nestedRepositoryFilePath)).toBeVisible();
  await expect(panel.getByText('export const nestedValue = "worktree";')).toBeVisible();
  await expect(panel.getByText("已修改", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "变更", exact: true }).click();
  const nestedDiffEditor = panel.getByTestId("remote-file-diff-editor");
  await expect(nestedDiffEditor).toContainText("worktree");
  // CodeMirror may keep a shared prefix/suffix outside either character-level mark.
  // Assert the visible worktree value and both change semantics without coupling the
  // user-flow test to a particular diff chunk boundary.
  await expect(nestedDiffEditor.locator(".cm-deletedText")).not.toBeEmpty();
  await expect(nestedDiffEditor.locator(".cm-changedText")).not.toBeEmpty();
  await fileTab(page, nestedRepositoryFilePath).getByLabel("关闭标签页").click();

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "deleted worktree file" }).click();
  await expect(fileTab(page, deletedWorktreeFilePath)).toBeVisible();
  await expect(
    panel.getByText("tracked file remains open while it is deleted remotely"),
  ).toBeVisible();
  await execRemoteSsh(remote, `rm -rf -- ${shellQuote(deletedWorktreeDirectoryPath)}`);
  await panel.getByRole("button", { name: "刷新 Git 变更" }).click();
  await expect(panel.getByText("已删除", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "变更", exact: true }).click();
  const deletedDiffEditor = panel.getByTestId("remote-file-diff-editor");
  await expect(deletedDiffEditor).toContainText(
    "tracked file remains open while it is deleted remotely",
  );
  await fileTab(page, deletedWorktreeFilePath).getByLabel("关闭标签页").click();

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "nested python" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(fileTab(page, nestedPythonPath)).toBeVisible();
  await expect(
    page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="files"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId("file-workspace-tab")).toHaveCount(3);
  await expect(panel.getByText("codex-gateway-nested-python")).toBeVisible();
  await expect(panel.getByTestId("remote-file-editor")).toBeVisible();
  await expect(tree.getByText("prefix", { exact: true })).toBeVisible();
  await expect(
    tree.locator(`[data-file-path=${JSON.stringify(nestedPythonPath)}][data-selected]`),
  ).toBeVisible();
  const nestedSourceScroller = panel.getByTestId("remote-file-editor").locator(".cm-scroller");
  await nestedSourceScroller.evaluate((element) => element.scrollTo({ top: 320, left: 0 }));
  await expect
    .poll(() => nestedSourceScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(250);

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "outside workspace" }).click();
  await expect(fileTab(page, outsideWorkspacePath)).toBeVisible();
  await expect(panel.getByText("outside workspace files still open safely")).toBeVisible();
  await expect(tree.locator("[data-selected]")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "变更", exact: true })).toHaveCount(0);

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "unknown text" }).click();
  await expect(fileTab(page, unknownTextPath)).toBeVisible();
  await expect(panel.getByText("unknown extensions still render as text")).toBeVisible();
  await expect(panel.getByText("未跟踪", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "变更", exact: true }).click();
  await expect(panel.getByTestId("remote-file-diff-editor")).toContainText(
    "unknown extensions still render as text",
  );
  await panel.getByRole("button", { name: "源码", exact: true }).click();

  await fileTab(page, nestedPythonPath).click();
  await expect
    .poll(() => nestedSourceScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(250);
  await fileTab(page, unknownTextPath).click();

  const editor = panel.getByTestId("remote-file-editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("feature_enabled=false\nsaved by tab switch");
  const tabSaveResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/remote/files?") && response.request().method() === "PUT",
  );
  await fileTab(page, nestedPythonPath).click();
  expect((await tabSaveResponse).ok()).toBe(true);
  await expect
    .poll(async () => (await execRemoteSsh(remote, `cat ${shellQuote(unknownTextPath)}`)).stdout)
    .toContain("saved by tab switch");

  // Host provisioning may still be replacing its progress toast with the success toast here.
  // Wait for that real UI overlay to leave instead of bypassing pointer hit-testing: a user must
  // likewise be able to click the file tab only after a notification covering it has closed.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 45_000 });
  await fileTab(page, unknownTextPath).click();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("local draft wins explicitly");
  await execRemoteSsh(
    remote,
    `printf '%s' 'remote concurrent version' > ${shellQuote(unknownTextPath)}`,
  );
  const conflictResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/remote/files?") &&
      response.request().method() === "PUT" &&
      response.status() === 409,
  );
  await panel.getByRole("button", { name: "保存" }).click();
  await conflictResponse;
  await panel.getByRole("button", { name: /远端版本冲突/ }).click();
  const conflictDialog = page.getByRole("dialog");
  await expect(conflictDialog).toContainText("remote concurrent version");
  const overwriteResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/remote/files?") && response.request().method() === "PUT",
  );
  await conflictDialog.getByRole("button", { name: "覆盖远端" }).click();
  expect((await overwriteResponse).ok()).toBe(true);
  await expect
    .poll(async () => (await execRemoteSsh(remote, `cat ${shellQuote(unknownTextPath)}`)).stdout)
    .toBe("local draft wins explicitly");

  await agentWorkspaceTab(page).click();
  await page.getByRole("link", { name: "binary target" }).click();
  await expect(fileTab(page, binaryPath)).toBeVisible();
  await expect(panel.getByText("无法以文本方式显示此文件")).toBeVisible();
  expect((await fileTab(page, remotePath).boundingBox())!.height).toBeCloseTo(
    initialFileTabHeight,
    0,
  );

  await fileTab(page, nestedPythonPath).click();

  // Moving the browser between monitors changes its container dimensions. Exercise the user's
  // actual split, then restore it after a reload; do not fabricate Dockview JSON or resize panels
  // through private APIs, which would bypass the wrapper's proportionalLayout option.
  const originalViewport = page.viewportSize();
  if (originalViewport === null) throw new Error("Missing browser viewport");
  for (const viewport of [
    { width: 2400, height: 1200 },
    { width: 1100, height: 760 },
    originalViewport,
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const [agentBox, filesBox] = await Promise.all([
          page.getByTestId("chat-main-pane").boundingBox(),
          panel.boundingBox(),
        ]);
        if (agentBox === null || filesBox === null) return Number.POSITIVE_INFINITY;
        return Math.abs(agentBox.width / (agentBox.width + filesBox.width) - dockWidthRatio);
      })
      .toBeLessThan(0.03);
    await assertDockviewPanelsFillHost(page);
  }

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
  await assertDockviewPanelsFillHost(page);
  const restoredDockRatio =
    restoredAgentDockBox!.width / (restoredAgentDockBox!.width + restoredFilesDockBox!.width);
  expect(Math.abs(restoredDockRatio - dockWidthRatio)).toBeLessThan(0.08);
  const restoredAgentRenderer = await page.getByTestId("chat-main-pane").elementHandle();
  if (restoredAgentRenderer === null) throw new Error("Restored Agent renderer is missing");
  const restoredDockRenderer = await page.locator(".gateway-dockview").elementHandle();
  if (restoredDockRenderer === null) throw new Error("Restored Dockview renderer is missing");
  await expect(page.getByTestId("file-workspace-tab")).toHaveCount(6);
  await expect(panel.getByText("codex-gateway-nested-python")).toBeVisible();

  await execRemoteSsh(
    remote,
    `sleep 1; printf '%s\n' 'def nested_preview_marker():' '    return "remote-file-refreshed"' > ${shellQuote(nestedPythonPath)}`,
  );
  // The foreground Files panel receives App Server fs/watch changes directly; no tab switch or
  // browser polling request should be necessary to refresh the open document.
  await expect(panel.getByText("remote-file-refreshed")).toBeVisible();
  await expect(panel.getByText("已修改", { exact: true })).toBeVisible();
  await expect(panel.locator(".cm-gitChangeMarker-modified")).toBeVisible();

  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("dock-popout-group").last().click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup.getByTestId("workspace-file-panel")).toBeVisible();

  let reopenedPopouts = 0;
  page.on("popup", () => reopenedPopouts++);
  let previousAgentRenderer = restoredAgentRenderer;
  let previousDockRenderer = restoredDockRenderer;
  const alternateThreadId = `${threadId}-alternate`;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await seedGatewayThread(page, {
      hostId: host.id,
      projectId: project.id,
      host: { ...host },
      project: { ...project },
      threadId: alternateThreadId,
      currentThread: { id: alternateThreadId, name: "Alternate File Thread", cwd: projectPath },
    });
    if (cycle === 0) await expect.poll(() => popup.isClosed()).toBe(true);
    await expect(page.getByTestId("chat-main-pane")).toBeVisible();

    const alternateDockRenderer = await page.locator(".gateway-dockview").elementHandle();
    if (alternateDockRenderer === null) throw new Error("Alternate Dockview renderer is missing");
    expect(
      await previousDockRenderer.evaluate(
        (previous, current) => previous === current,
        alternateDockRenderer,
      ),
    ).toBe(false);
    await previousDockRenderer.dispose();
    previousDockRenderer = alternateDockRenderer;

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
    const [returnedAgentBox, returnedFilesBox] = await Promise.all([
      page.getByTestId("chat-main-pane").boundingBox(),
      panel.boundingBox(),
    ]);
    await assertDockviewPanelsFillHost(page);
    const returnedAgentRenderer = await page.getByTestId("chat-main-pane").elementHandle();
    if (returnedAgentRenderer === null) throw new Error("Returned Agent renderer is missing");
    const returnedDockRenderer = await page.locator(".gateway-dockview").elementHandle();
    if (returnedDockRenderer === null) throw new Error("Returned Dockview renderer is missing");

    // A workspace scope owns its entire Dockview renderer, not just the Agent subtree. Reusing the
    // root lets Dockview's renderer="always" overlay queue survive a thread change, so alternating
    // switches can attach the new Agent to stale group geometry. Requiring a fresh root on every
    // scope transition exercises Vue's normal unmount boundary and catches that race deterministically.
    expect(
      await previousDockRenderer.evaluate(
        (previous, current) => previous === current,
        returnedDockRenderer,
      ),
    ).toBe(false);
    expect(
      await previousAgentRenderer.evaluate(
        (previous, current) => previous === current,
        returnedAgentRenderer,
      ),
    ).toBe(false);
    expect(Math.abs(returnedAgentBox!.height - returnedFilesBox!.height)).toBeLessThan(2);

    await previousAgentRenderer.dispose();
    await previousDockRenderer.dispose();
    previousAgentRenderer = returnedAgentRenderer;
    previousDockRenderer = returnedDockRenderer;
  }
  await previousAgentRenderer.dispose();
  await previousDockRenderer.dispose();
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

async function assertDockviewPanelsFillHost(page: import("@playwright/test").Page) {
  const frame = page.getByTestId("workspace-dock-frame");
  const host = page.locator(".gateway-dockview");
  await expect
    .poll(async () => {
      const frameBox = await frame.boundingBox();
      const hostBox = await host.boundingBox();
      const currentAgentBox = await page.getByTestId("chat-main-pane").boundingBox();
      const currentFilesBox = await page.getByTestId("workspace-file-panel").boundingBox();
      if (!frameBox || !hostBox || !currentAgentBox || !currentFilesBox) return false;
      const frameBottom = frameBox.y + frameBox.height;
      const hostBottom = hostBox.y + hostBox.height;
      return (
        Math.abs(frameBox.y) < 2 &&
        Math.abs(hostBottom - frameBottom) < 2 &&
        Math.abs(currentAgentBox.y + currentAgentBox.height - hostBottom) < 2 &&
        Math.abs(currentFilesBox.y + currentFilesBox.height - hostBottom) < 2
      );
    })
    .toBe(true);
}
