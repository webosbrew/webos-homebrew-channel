// import 'core-js/stable';
// import 'regenerator-runtime/runtime';
import './buffer-shim';

import fs from 'fs';
import fetch from 'node-fetch';
import pipeline from 'stream.pipeline-shim';
import { execFile, ExecFileOptions } from 'child_process';
import * as Bluebird from 'bluebird';

// Monkey-patch fetch Promise with Bluebird's.
// @ts-ignore
fetch.Promise = Bluebird.Promise;

// Sadly these need to be manually typed according to
// https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node
// since types infered from Bluebird.Promise.promisify are wrong.
export const asyncPipeline: (
  ...args: ReadonlyArray<NodeJS.ReadableStream | NodeJS.WritableStream | NodeJS.ReadWriteStream>
) => Promise<void> = Bluebird.Promise.promisify(pipeline);
export const asyncExecFile: (file: string, args?: ReadonlyArray<string>, options?: ExecFileOptions) => Promise<string> =
  Bluebird.Promise.promisify(execFile);
export const asyncStat: (path: string) => Promise<fs.Stats> = Bluebird.Promise.promisify(fs.stat);
export const asyncUnlink: (path: string) => Promise<void> = Bluebird.Promise.promisify(fs.unlink);
export const asyncWriteFile: (path: string, contents: string, options?: fs.WriteFileOptions) => Promise<void> = Bluebird.Promise.promisify(
  fs.writeFile,
);
