/*
 * Promise support for the oldest Node.js we run on (0.10/0.12 on webOS 3.x).
 *
 * core-js provides a spec-compliant Promise (including .finally()) where the
 * runtime has none, and upgrades incomplete native ones. This module must be
 * imported before anything that captures the global Promise at load time
 * (node-fetch does), which is why every other platform module imports it
 * first.
 */

import 'core-js/stable';
import 'regenerator-runtime/runtime';
import './buffer-shim';
import './string-shim';
import './events-shim';

import { errorMessage } from '../utils';

/**
 * Normalises any rejection/throw value into an Error.
 */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(errorMessage(err));
}

/**
 * Builds a Node-style callback that settles a Promise.
 */
export function settle<R>(resolve: (value: R) => void, reject: (reason: Error) => void): (err: unknown, result: R) => void {
  return (err, result) => {
    if (err) {
      reject(toError(err));
    } else {
      resolve(result);
    }
  };
}

/**
 * Minimal `util.promisify` for Node-style `(err, result)` callbacks.
 * (util.promisify only exists from Node.js 8.)
 */
export function promisify<A extends any[], R>(
  fn: (...args: [...A, (err: unknown, result: R) => void]) => void,
): (...args: A) => Promise<R> {
  return (...args: A) =>
    new Promise<R>((resolve, reject) => {
      fn(...args, settle(resolve, reject));
    });
}

/**
 * Variant for callbacks that report only an error (fs.unlink, fs.chmod, ...).
 */
export function promisifyVoid<A extends any[]>(fn: (...args: [...A, (err: unknown) => void]) => void): (...args: A) => Promise<void> {
  return (...args: A) =>
    new Promise<void>((resolve, reject) => {
      fn(...args, (err: unknown) => {
        if (err) {
          reject(toError(err));
        } else {
          resolve();
        }
      });
    });
}

/**
 * Rejects after `ms` unless `promise` settles first.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string = `Timed out after ${ms}ms`): Promise<T> {
  if (ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(toError(err));
      },
    );
  });
}
