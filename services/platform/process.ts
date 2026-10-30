/*
 * Child process helpers.
 *
 * Only this module imports `child_process`. It hides the Node.js 0.10 quirk
 * that exec() cannot return Buffers, and exposes Promise-based variants.
 */

import { toError } from './promise';

import childProcess from 'child_process';

export type { ChildProcess, ExecException, ExecFileException, SpawnOptions } from 'child_process';

const nodeVersion = (() => {
  try {
    // Just in case there's a build/pre-release suffix.
    const core = process.versions.node.split(/[-+]/, 1)[0] as string;
    const [major = 0, minor = 0, patch = 0] = core.split('.').map((x) => parseInt(x, 10));
    return { major, minor, patch };
  } catch (err) {
    console.warn('getting nodeVersion failed:', err);
    return { major: 0, minor: 0, patch: 0 };
  }
})();

export { nodeVersion };

export const runningAsRoot: boolean = (() => {
  if (typeof process.getuid === 'undefined') {
    throw new Error('process.getuid() is missing');
  }
  return process.getuid() === 0;
})();

export interface ExecOptions {
  /** Kill the process after this many ms (0 disables). */
  timeout?: number;
  /** Largest amount of stdout/stderr (bytes) to buffer before killing the process. */
  maxBuffer?: number;
}

export interface ExecResult {
  /** null on a clean exit, otherwise the error (non-zero exit, signal, timeout, maxBuffer). */
  error: childProcess.ExecException | null;
  stdout: Buffer;
  stderr: Buffer;
}

/**
 * Runs a shell command and resolves with its output as raw bytes, whether or
 * not it succeeded. Never rejects for a failing command; check `error`.
 */
export function exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    if (nodeVersion.major !== 0 || nodeVersion.minor >= 12) {
      childProcess.exec(command, { ...options, encoding: 'buffer' }, (error, stdout, stderr) => {
        resolve({ error, stdout, stderr });
      });
    } else {
      /* Node.js v0.10.x doesn't provide callback with Buffers, so fake it */
      childProcess.exec(command, { ...options, encoding: 'binary' }, (error, stdout: string, stderr: string) => {
        resolve({ error, stdout: Buffer.from(stdout, 'binary'), stderr: Buffer.from(stderr, 'binary') });
      });
    }
  });
}

/**
 * Runs an executable with arguments and resolves with its stdout (utf-8).
 * Rejects when the process fails.
 */
export function execFile(file: string, args: readonly string[] = [], options: ExecOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, [...args], { ...options, encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        reject(toError(error));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Callback-style execFile, for the synchronous-style elevate-service CLI.
 */
export function execFileCallback(
  file: string,
  args: readonly string[],
  options: ExecOptions,
  callback: (error: childProcess.ExecFileException | null, stdout: string, stderr: string) => void,
): void {
  childProcess.execFile(file, [...args], { ...options, encoding: 'utf8' }, callback);
}

export function spawn(command: string, args: readonly string[] = [], options: childProcess.SpawnOptions = {}): childProcess.ChildProcess {
  return childProcess.spawn(command, [...args], options);
}

/**
 * Runs `command` through /bin/sh in its own process group, so that
 * killTree() can take down the shell *and* whatever it started.
 */
export function spawnShell(command: string, options: childProcess.SpawnOptions = {}): childProcess.ChildProcessWithoutNullStreams {
  return childProcess.spawn('/bin/sh', ['-c', '--', command], { ...options, stdio: 'pipe', detached: true });
}

/**
 * Signals a child started with spawnShell() together with all of its
 * descendants (its process group). Falls back to the child alone.
 */
export function killTree(child: childProcess.ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

export function fork(modulePath: string, args: readonly string[] = []): childProcess.ChildProcess {
  return childProcess.fork(modulePath, [...args]);
}
