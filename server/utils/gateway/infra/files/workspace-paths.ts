import { posix } from "node:path";
import type { SFTPWrapper } from "ssh2";

export function isWithinDirectory(root: string, path: string) {
  const relative = posix.relative(root, path);
  return relative !== ".." && !relative.startsWith("../") && !posix.isAbsolute(relative);
}

export function realPathFor(sftp: SFTPWrapper, path: string) {
  return new Promise<string>((resolve, reject) =>
    sftp.realpath(path, (error, resolved) => (error ? reject(error) : resolve(resolved))),
  );
}
