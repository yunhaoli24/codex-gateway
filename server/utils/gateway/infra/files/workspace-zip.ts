import { posix } from "node:path";
import { addAbortSignal, Readable } from "node:stream";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { createError } from "h3";
import type { FileEntryWithStats, SFTPWrapper } from "ssh2";
import { classifyRemoteDirectoryError } from "./remote-file-errors";
import { isWithinDirectory, realPathFor } from "./workspace-paths";

const MAX_ZIP_ENTRIES = 10_000;
const MAX_ZIP_INPUT_BYTES = 2 * 1024 * 1024 * 1024;

interface ZipEntry {
  path: string;
  name: string;
  directory: boolean;
}

export async function openWorkspaceZip(
  sftp: SFTPWrapper,
  projectRoot: string,
  treeRoot: string,
  path: string,
  signal: AbortSignal,
) {
  const resolveDirectory = (input: string) =>
    realPathFor(sftp, input).catch((error: unknown) => {
      throw classifyRemoteDirectoryError(error, input, input);
    });
  const [project, root, folder] = await Promise.all([
    resolveDirectory(projectRoot),
    resolveDirectory(treeRoot),
    resolveDirectory(path),
  ]);
  if (!isWithinDirectory(project, root) || !isWithinDirectory(root, folder)) {
    throw outsideWorkspace();
  }

  const entries: ZipEntry[] = [];
  let totalBytes = 0;
  function add(entry: ZipEntry, size: number) {
    totalBytes += size;
    if (entries.length >= MAX_ZIP_ENTRIES || totalBytes > MAX_ZIP_INPUT_BYTES) {
      throw zipTooLarge();
    }
    entries.push(entry);
  }

  // Use the lstat-like attributes from SFTP readdir. Links and special files are omitted.
  async function visit(directory: string, name: string) {
    signal.throwIfAborted();
    if ((await realPathFor(sftp, directory)) !== directory) throw outsideWorkspace();
    add({ path: directory, name: `${name}/`, directory: true }, 0);
    for (const { filename, attrs } of await readDirectory(sftp, directory)) {
      if (filename === "." || filename === ".." || (!attrs.isDirectory() && !attrs.isFile())) {
        continue;
      }
      const child = posix.join(directory, zipPathPart(filename));
      const childName = `${name}/${filename}`;
      if (attrs.isDirectory()) await visit(child, childName);
      else add({ path: child, name: childName, directory: false }, attrs.size);
    }
  }

  await visit(folder, zipPathPart(posix.basename(path) || "folder"));
  return Readable.from(zipEntries(sftp, entries, signal), { objectMode: false });
}

async function* zipEntries(sftp: SFTPWrapper, entries: ZipEntry[], signal: AbortSignal) {
  const output: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    output.push(chunk);
  });
  let bytes = 0;
  try {
    for (const entry of entries) {
      signal.throwIfAborted();
      const member = entry.directory
        ? new ZipPassThrough(entry.name)
        : new ZipDeflate(entry.name, { level: 3 });
      zip.add(member);
      yield* output.splice(0);
      if (!entry.directory) {
        // Recheck the path immediately before opening it in case a parent or file became a link.
        if ((await realPathFor(sftp, entry.path)) !== entry.path) throw outsideWorkspace();
        const file = addAbortSignal(signal, sftp.createReadStream(entry.path));
        for await (const chunk of file as AsyncIterable<Uint8Array>) {
          bytes += chunk.length;
          if (bytes > MAX_ZIP_INPUT_BYTES) throw zipTooLarge();
          member.push(chunk);
          yield* output.splice(0);
        }
      }
      member.push(new Uint8Array(), true);
      yield* output.splice(0);
    }
    zip.end();
    yield* output.splice(0);
  } finally {
    zip.terminate();
  }
}

function readDirectory(sftp: SFTPWrapper, path: string) {
  return new Promise<FileEntryWithStats[]>((resolve, reject) =>
    sftp.readdir(path, (error, entries) =>
      error ? reject(classifyRemoteDirectoryError(error, path, path)) : resolve(entries),
    ),
  );
}

function zipPathPart(name: string) {
  // ZIP entry paths use forward slashes, and must not be interpreted as drive or parent paths.
  if (name === "" || name === "." || name === ".." || /[/:\\\0]/.test(name)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Folder contains a name that cannot be stored safely in a ZIP",
    });
  }
  return name;
}

export function outsideWorkspace() {
  return createError({ statusCode: 403, statusMessage: "Folder is outside the project" });
}

function zipTooLarge() {
  return createError({
    statusCode: 413,
    statusMessage: "Folder ZIP is limited to 2 GiB and 10,000 entries",
  });
}
