/*
 * Small, dependency-free helpers shared by the service entry points.
 * Kept separate so they can be unit-tested without a webOS environment.
 */

/**
 * Returns a human-readable message for any thrown/rejected value.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err !== null && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj['errorText'] === 'string') {
      return obj['errorText'];
    }
    if (typeof obj['message'] === 'string') {
      return obj['message'];
    }
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return String(err);
}

/**
 * Type guard for Node.js system errors (ones with a `code`, like ENOENT).
 */
export function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error;
}

/**
 * Parses a Debian-style control file ("Key: value" lines) into an object.
 *
 * Continuation lines (starting with whitespace) are appended to the previous
 * field, as in the Debian control format. Lines without a separator are
 * ignored.
 */
export function parseControlFile(control: string): Record<string, string> {
  const result: Record<string, string> = {};
  let lastKey: string | null = null;

  for (const rawLine of control.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.length) {
      continue;
    }

    if (/^\s/.test(line) && lastKey !== null) {
      result[lastKey] = `${result[lastKey] ?? ''}\n${line.trim()}`;
      continue;
    }

    const sep = line.indexOf(':');
    if (sep <= 0) {
      continue;
    }

    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    result[key] = value;
    lastKey = key;
  }

  return result;
}
