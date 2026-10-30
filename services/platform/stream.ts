/*
 * Stream helpers that paper over differences between Node.js versions.
 */

import { toError } from './promise';

import pipelineShim from 'stream.pipeline-shim';

type Stream = NodeJS.ReadableStream | NodeJS.WritableStream | NodeJS.ReadWriteStream;

/**
 * stream.pipeline() with a Promise interface.
 * (stream.pipeline itself only exists from Node.js 10.)
 */
export function pipeline(source: NodeJS.ReadableStream, ...rest: Stream[]): Promise<void> {
  return new Promise((resolve, reject) => {
    (pipelineShim as (...args: unknown[]) => void)(source, ...rest, (err: unknown) => {
      if (err) {
        reject(toError(err));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Tears a stream down with an error.
 * stream.destroy() only exists from Node.js 8; older streams get the error
 * emitted directly, which has the same effect inside a pipeline.
 */
export function destroy(stream: Stream, err: Error): void {
  const s = stream as Stream & { destroy?: (error?: Error) => void };
  if (typeof s.destroy === 'function') {
    s.destroy(err);
  } else {
    s.emit('error', err);
  }
}
