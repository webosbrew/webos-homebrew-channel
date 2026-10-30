/*
 * HTTP(S) client for the service.
 *
 * Only this module imports node-fetch. It makes HTTPS requests trust the
 * Mozilla CA bundle shipped in ../certs (the TV's own store is usually
 * outdated or empty) and provides a download helper with progress reporting
 * and a stall watchdog.
 *
 * node-fetch 2.x is the newest fetch implementation that runs on Node.js
 * 0.10/0.12; swapping it for something else means changing only this file.
 */

import './promise';

import http from 'http';
import https from 'https';
import path from 'path';

import { loadCertDir } from '@throwaway96/node-load-cert-dir';
import fetch from 'node-fetch';
import progressStream from 'progress-stream';

import { createWriteStream } from './fs';
import { destroy, pipeline } from './stream';

export type Response = fetch.Response;
export type RequestInit = fetch.RequestInit;

let certsDir = path.join(__dirname, 'certs');
let defaultHttpsAgent: https.Agent | null = null;

export interface HttpConfig {
  /** Directory of PEM files to trust for HTTPS. Defaults to <bundle dir>/certs. */
  certsDir?: string;
}

/**
 * Overrides defaults. Must be called before the first HTTPS request.
 */
export function configure(config: HttpConfig): void {
  if (config.certsDir !== undefined) {
    certsDir = config.certsDir;
    defaultHttpsAgent = null;
  }
}

/** Created lazily so plain-HTTP use never touches the cert directory. */
function getHttpsAgent(): https.Agent {
  defaultHttpsAgent ??= new https.Agent({ ca: loadCertDir(certsDir, { logLevel: 0 }) });
  return defaultHttpsAgent;
}

export interface FetchOptions {
  /** Give up if response headers have not arrived after this many ms (0 disables). */
  timeout?: number;
}

/**
 * fetch() that trusts our CA bundle. Certs are loaded on first use.
 */
export function fetchUrl(url: string, options: FetchOptions = {}): Promise<fetch.Response> {
  const init: fetch.RequestInit = {
    agent: (parsedURL: URL): http.RequestOptions['agent'] => (parsedURL.protocol === 'http:' ? http.globalAgent : getHttpsAgent()),
  };
  if (options.timeout !== undefined) {
    init.timeout = options.timeout;
  }

  return fetch(url, init);
}

export interface DownloadOptions {
  /**
   * Abort when no response headers arrive, or no body data flows, for this
   * many ms (0 disables).
   */
  timeout?: number;
  /** Called at most every ~300ms with the percentage transferred (0-100). */
  onProgress?: (percentage: number, transferred: number, length: number) => void;
}

/**
 * Downloads `url` to `targetPath`.
 *
 * Rejects on HTTP errors, network errors, and stalled transfers. The caller is
 * responsible for removing a partially written file on failure.
 */
export async function downloadToFile(url: string, targetPath: string, options: DownloadOptions = {}): Promise<void> {
  const timeout = options.timeout ?? 0;

  const res = await fetchUrl(url, { timeout });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  const length = parseInt(res.headers.get('content-length') ?? '0', 10);
  const progress = progressStream({ length, time: 300 /* ms */ });

  // node-fetch's timeout only covers the wait for headers; watch the body
  // ourselves so a stalled transfer doesn't hang forever.
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const resetStallTimer = (): void => {
    clearTimeout(stallTimer);
    if (timeout > 0) {
      stallTimer = setTimeout(() => {
        destroy(res.body, new Error(`Download stalled (no data for ${timeout / 1000}s)`));
      }, timeout);
    }
  };

  progress.on('progress', (p) => {
    resetStallTimer();
    options.onProgress?.(p.percentage, p.transferred, p.length);
  });

  resetStallTimer();
  try {
    await pipeline(res.body, progress, createWriteStream(targetPath));
  } finally {
    clearTimeout(stallTimer);
  }
}
