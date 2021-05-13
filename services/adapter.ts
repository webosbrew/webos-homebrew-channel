import fs from 'fs';
import fetch from 'node-fetch';
import pipeline from 'stream.pipeline-shim';
import child_process from 'child_process';
import * as Bluebird from 'bluebird';
import 'core-js/stable';
import 'regenerator-runtime/runtime';

import './buffer-shim';

// Monkey-patch fetch Promise with Bluebird's.
// @ts-ignore
fetch.Promise = Bluebird.Promise;

export const asyncPipeline = Bluebird.Promise.promisifyAll(pipeline);
export const asyncExecFile = Bluebird.Promise.promisifyAll(child_process.execFile);
export const asyncAccess = Bluebird.Promise.promisify(fs.access);
export const asyncUnlink = Bluebird.Promise.promisify(fs.unlink);
export const asyncWriteFile = Bluebird.Promise.promisify(fs.writeFile);
