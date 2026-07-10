import Busboy, { type BusboyFileStream } from "@fastify/busboy";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createError, type H3Event } from "h3";

const MAX_UPLOAD_FILES = 8;
const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024;

export interface ParsedUploadFile {
  originalName: string;
  mimeType: string | null;
  localPath: string;
  safeName: string;
  size: number;
}

export function streamMultipartUploads(event: H3Event, tempDir: string) {
  return new Promise<ParsedUploadFile[]>((resolve, reject) => {
    const parser = new Busboy({
      headers: event.node.req.headers as { "content-type": string },
      limits: {
        files: MAX_UPLOAD_FILES,
        fileSize: MAX_UPLOAD_FILE_BYTES,
        fields: 0,
        parts: MAX_UPLOAD_FILES,
      },
    });
    const files: ParsedUploadFile[] = [];
    const writes: Promise<void>[] = [];
    let limitError: Error | null = null;
    let writeError: unknown = null;
    let settled = false;

    const settle = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      event.node.req.off("aborted", handleAbort);
      if (error) {
        reject(error);
      } else {
        resolve(files);
      }
    };
    const handleAbort = () => {
      const error = createError({ statusCode: 499, statusMessage: "Upload request was aborted" });
      parser.destroy(error);
      settle(error);
    };

    parser.on("file", (fieldName, stream, filename, _encoding, mimeType) => {
      if (fieldName !== "files" || !filename) {
        stream.resume();
        return;
      }
      const originalName = basename(filename);
      const safeName = `${randomUUID()}${extname(originalName)}`;
      const localPath = join(tempDir, safeName);
      const file: ParsedUploadFile = {
        originalName,
        mimeType: mimeType || null,
        localPath,
        safeName,
        size: 0,
      };
      stream.on("data", (chunk: Buffer) => {
        file.size += chunk.length;
      });
      stream.once("limit", () => {
        limitError = uploadLimitError(
          `Upload file exceeds ${Math.round(MAX_UPLOAD_FILE_BYTES / 1024 / 1024)} MB`,
        );
      });
      writes.push(
        writeUpload(stream, localPath).catch((error) => {
          writeError ??= error;
        }),
      );
      files.push(file);
    });
    parser.once("filesLimit", () => {
      limitError = uploadLimitError(`Upload accepts at most ${MAX_UPLOAD_FILES} files`);
    });
    parser.once("partsLimit", () => {
      limitError ??= uploadLimitError(`Upload accepts at most ${MAX_UPLOAD_FILES} parts`);
    });
    parser.once("error", settle);
    parser.once("finish", () => {
      void Promise.all(writes).then(() => settle(limitError ?? writeError));
    });
    event.node.req.once("aborted", handleAbort);
    event.node.req.pipe(parser);
  });
}

async function writeUpload(stream: BusboyFileStream, localPath: string) {
  await pipeline(stream, createWriteStream(localPath, { mode: 0o600 }));
}

function uploadLimitError(message: string) {
  return createError({ statusCode: 413, statusMessage: message });
}
