/*
 * Checks on the BUILT service bundles - what actually ships to the TV.
 *
 * The rest of the suite exercises the TypeScript source on a modern Node.js;
 * this file builds dist/services with webpack and verifies the output is
 * something the TV's Node.js 0.10+ can load: strict ES5, and the legacy smoke
 * harness (tests/legacy/smoke.js) passes against it.
 *
 * Node.js-version-specific behaviour (Buffer shim, exec encoding, stream
 * destroy, ...) is covered by tests/node-compat.test.ts, which exercises each
 * fallback on the current Node.js.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';

import * as acorn from 'acorn';

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist', 'services');

function parsesAsEs5(file: string): void {
  let source = nodeFs.readFileSync(file, 'utf8');
  if (source.startsWith('#!')) {
    source = source.slice(source.indexOf('\n'));
  }
  assert.doesNotThrow(() => acorn.parse(source, { ecmaVersion: 5, sourceType: 'script' }), `${path.relative(repoRoot, file)} must be ES5`);
}

describe('service bundles', () => {
  before(() => {
    execFileSync('npx', ['webpack', '--env', 'production'], { cwd: repoRoot, stdio: 'pipe', timeout: 180000 });
  });

  it('are produced', () => {
    assert.ok(nodeFs.existsSync(path.join(distDir, 'service.js')));
    assert.ok(nodeFs.existsSync(path.join(distDir, 'elevate-service')));
  });

  it('elevate-service is an executable script with a node shebang', () => {
    const file = path.join(distDir, 'elevate-service');
    assert.ok(nodeFs.readFileSync(file, 'utf8').startsWith('#!/usr/bin/env node'));
    assert.equal(nodeFs.statSync(file).mode & 0o111, 0o111);
  });

  it('parse as ECMAScript 5 (the TV webviews/Node.js 0.10 accept nothing newer)', () => {
    parsesAsEs5(path.join(distDir, 'service.js'));
    parsesAsEs5(path.join(distDir, 'elevate-service'));
  });

  it('do not reach for Node.js APIs newer than 0.10 without a shim', () => {
    const source = nodeFs.readFileSync(path.join(distDir, 'service.js'), 'utf8');
    // Things Babel/core-js cannot polyfill. Buffer.from/alloc are shimmed by
    // platform/buffer-shim.js and queueMicrotask is polyfilled by core-js,
    // which is why they are not listed.
    for (const api of [
      'fs.promises',
      'util.promisify',
      'require("stream").pipeline',
      'fs.rmSync',
      'fs.mkdtempSync',
      'AbortController',
      'require("worker_threads")',
    ]) {
      assert.ok(!source.includes(api), `bundle references ${api}`);
    }
  });

  it('only depend on webos-service at runtime', () => {
    const source = nodeFs.readFileSync(path.join(distDir, 'service.js'), 'utf8');
    const externals = [...source.matchAll(/require\("([^"./][^"]*)"\)/g)]
      .map((m) => m[1])
      .filter((name) => !require('node:module').builtinModules.includes(name));
    // node-fetch 2 optionally loads "encoding" for non-UTF-8 bodies, guarded by try/catch.
    assert.match(source, /try\{[^}]*require\("encoding"\)[^}]*\}catch/);
    assert.deepEqual([...new Set(externals)].sort(), ['encoding', 'webos-service']);
  });
});

describe('legacy smoke harness', () => {
  it('is itself strict ES5 so it can run on Node.js 0.10', () => {
    parsesAsEs5(path.join(repoRoot, 'tests', 'legacy', 'smoke.js'));
    parsesAsEs5(path.join(repoRoot, 'tests', 'legacy', 'stubs', 'webos-service', 'index.js'));
  });

  it('passes against the freshly built bundle under the current Node.js', () => {
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'tests', 'legacy', 'smoke.js'), distDir], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60000,
    });
    const summary = result.stdout.split('\n').filter((l) => l.startsWith('# node') || l.startsWith('not ok'));
    assert.equal(result.status, 0, `smoke harness failed:\n${summary.join('\n')}\n${result.stderr.slice(-2000)}`);
    assert.match(result.stdout, /# node v\d+.*: \d+ passed, 0 failed/);
  });
});
