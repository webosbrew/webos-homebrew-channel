/*
 * Platform layer: the only place the service touches Node.js built-ins and
 * third-party runtime packages.
 *
 * Application code (service.ts, elevate-service.ts, webos-service-remote)
 * imports from here instead of from `fs`, `child_process`, `node-fetch`,
 * etc. - enforced by the no-restricted-imports rule in eslint.config.mjs.
 * Keeping that boundary means a dependency can be replaced, or a newer
 * package transpiled in, by changing one file in this directory.
 *
 * Everything here must work on Node.js 0.10 after Babel/core-js processing.
 */

import './promise';

export * as fs from './fs';
export * as proc from './process';
export * as stream from './stream';
export * as http from './http';
export * as crypto from './crypto';
export { promisify, promisifyVoid, settle, toError, withTimeout } from './promise';
