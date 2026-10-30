/*
 * Filesystem access for the service.
 *
 * Only this module imports Node's `fs`; everything else goes through these
 * functions so the implementation can be swapped (fs.promises on newer Node,
 * a different runtime, test doubles) in one place.
 */

import { settle, toError } from './promise';

import nodeFs from 'fs';

export type { Stats, WriteFileOptions, Mode } from 'fs';

function voidCallback(resolve: () => void, reject: (reason: Error) => void): (err: NodeJS.ErrnoException | null) => void {
  return (err) => {
    if (err) {
      reject(toError(err));
    } else {
      resolve();
    }
  };
}

export const stat: (path: string) => Promise<nodeFs.Stats> = (path) =>
  new Promise((resolve, reject) => {
    nodeFs.stat(path, settle(resolve, reject));
  });

export const unlink: (path: string) => Promise<void> = (path) =>
  new Promise((resolve, reject) => {
    nodeFs.unlink(path, voidCallback(resolve, reject));
  });

export const chmod: (path: string, mode: nodeFs.Mode) => Promise<void> = (path, mode) =>
  new Promise((resolve, reject) => {
    nodeFs.chmod(path, mode, voidCallback(resolve, reject));
  });

export const mkdir: (path: string, mode?: nodeFs.Mode) => Promise<void> = (path, mode) =>
  new Promise((resolve, reject) => {
    const cb = voidCallback(resolve, reject);
    if (mode === undefined) {
      nodeFs.mkdir(path, cb);
    } else {
      nodeFs.mkdir(path, mode, cb);
    }
  });

export const readFile: {
  (path: string): Promise<Buffer>;
  (path: string, encoding: BufferEncoding): Promise<string>;
} = ((path: string, encoding?: BufferEncoding) =>
  new Promise<Buffer | string>((resolve, reject) => {
    if (encoding === undefined) {
      nodeFs.readFile(path, settle(resolve, reject));
    } else {
      nodeFs.readFile(path, { encoding }, settle(resolve, reject));
    }
  })) as {
  (path: string): Promise<Buffer>;
  (path: string, encoding: BufferEncoding): Promise<string>;
};

export const writeFile: (path: string, contents: string | Buffer, options?: nodeFs.WriteFileOptions) => Promise<void> = (
  path,
  contents,
  options,
) =>
  new Promise((resolve, reject) => {
    const cb = voidCallback(resolve, reject);
    if (options === undefined) {
      nodeFs.writeFile(path, contents, cb);
    } else {
      nodeFs.writeFile(path, contents, options, cb);
    }
  });

export const createReadStream = (path: string): NodeJS.ReadableStream => nodeFs.createReadStream(path);
export const createWriteStream = (path: string): NodeJS.WritableStream => nodeFs.createWriteStream(path);

/* Synchronous variants, for the elevate-service CLI. */
export const existsSync = (path: string): boolean => nodeFs.existsSync(path);
export const statSync = (path: string): nodeFs.Stats => nodeFs.statSync(path);
export const readFileSync = (path: string): Buffer => nodeFs.readFileSync(path);
export const writeFileSync = (path: string, contents: string | Buffer): void => {
  nodeFs.writeFileSync(path, contents);
};

/**
 * Check whether a path exists (any type).
 */
export function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/**
 * Check whether a path is a regular file.
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function isFileSync(path: string): boolean {
  try {
    return nodeFs.statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isDirectorySync(path: string): boolean {
  try {
    return nodeFs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Type guard for Node.js system errors (ones with a `code`, like ENOENT).
 */
export function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error;
}

/**
 * True when `err` is a "no such file" error.
 */
export function isNotFound(err: unknown): boolean {
  return isNodeError(err) && err.code === 'ENOENT';
}
