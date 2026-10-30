/*
 * Node.js compatibility matrix for the service.
 *
 * The service bundle runs on the TV's Node.js, which can be as old as 0.10
 * (webOS 3.x). We cannot run those binaries in CI, so instead every place
 * where the code depends on a Node.js version difference is listed here and
 * its fallback branch is exercised on the current Node.js by simulating the
 * old environment (a Buffer without .from, exec() without Buffer output, a
 * stream without destroy(), ...).
 *
 * When adding code that touches a Node API introduced after 0.10:
 *   1. put the version check / shim in services/platform,
 *   2. add a row to MATRIX below and a test for the fallback.
 * The lint rule n/no-unsupported-features/node-builtins (version >=0.10.0 in
 * eslint.config.mjs) is what flags such additions in the first place.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { proc, stream } from '../services/platform';
import { install as installBufferShim } from '../services/platform/buffer-shim';
import { install as installStringShim } from '../services/platform/string-shim';

const repoRoot = path.resolve(__dirname, '..');
const read = (rel: string): string => nodeFs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** Source with block and line comments removed (good enough for our own files). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

/**
 * The matrix. `since` is the Node.js release that made the shim unnecessary;
 * everything older than that on a TV takes the fallback path.
 */
const MATRIX = [
  { feature: 'Promise (+ .finally)', since: '0.12 / 10', shim: 'core-js/stable, imported first by platform/promise.ts' },
  {
    feature: 'Map/Set/Symbol/Object.entries/Array.prototype.find/includes',
    since: '0.12 - 7',
    shim: 'core-js/stable (babel useBuiltIns: entry)',
  },
  {
    feature: 'ES2015+ syntax (const, arrows, classes, async)',
    since: '4 - 8',
    shim: '@babel/preset-env targeting node 0.10, output verified ES5',
  },
  { feature: 'Buffer.from / alloc / allocUnsafe(Slow)', since: '4.5', shim: 'platform/buffer-shim.js' },
  {
    feature: 'String.prototype.normalize (used by node-fetch -> whatwg-url -> tr46 on every host name)',
    since: '0.12',
    shim: 'platform/string-shim.js (identity; host names are ASCII)',
  },
  {
    feature: "child_process.exec(..., { encoding: 'buffer' })",
    since: '0.12',
    shim: "platform/process.ts exec(): 'binary' encoding + re-wrap",
  },
  { feature: 'stream.destroy(err)', since: '8', shim: "platform/stream.ts destroy(): emit('error') fallback" },
  { feature: 'stream.pipeline', since: '10', shim: 'stream.pipeline-shim via platform/stream.ts pipeline()' },
  { feature: 'util.promisify', since: '8', shim: 'platform/promise.ts promisify()/settle()' },
  { feature: 'fs.promises', since: '10', shim: 'platform/fs.ts callback wrappers' },
  {
    feature: 'fetch / AbortController',
    since: '18 / 15',
    shim: 'node-fetch 2.x (last line supporting Node 4+) + stall watchdog in platform/http.ts',
  },
] as const;

describe('Node.js compatibility matrix', () => {
  it('names a shim for every row', () => {
    const rows: readonly { feature: string; since: string; shim: string }[] = MATRIX;
    for (const row of rows) {
      assert.ok(row.shim.length > 0, `${row.feature} (since ${row.since}) needs a shim entry`);
    }
  });
});

describe('Buffer.from/alloc shim (Node < 4.5)', () => {
  /** A Buffer-like constructor as Node 0.10/0.12 had it: no static helpers. */
  function legacyBufferCtor(): typeof Buffer {
    // Subclass the real Buffer so instances are genuine Buffers, but hide the
    // modern statics the way an old runtime would.
    const Legacy = function LegacyBuffer(this: unknown, data: unknown, encoding?: unknown): Buffer {
      if (typeof data === 'number') return Buffer.alloc(data);
      if (typeof data === 'string') return Buffer.from(data, encoding as BufferEncoding);
      if (Array.isArray(data) || data instanceof Uint8Array) return Buffer.from(data as Uint8Array);
      return Buffer.alloc(0);
    } as unknown as typeof Buffer;
    for (const key of ['from', 'alloc', 'allocUnsafe', 'allocUnsafeSlow']) {
      Object.defineProperty(Legacy, key, { value: undefined, writable: true, configurable: true });
    }
    return Legacy;
  }

  it('installs exactly the missing statics on a legacy constructor', () => {
    const Legacy = legacyBufferCtor();
    const installed = installBufferShim(Legacy);
    assert.deepEqual(installed.sort(), ['alloc', 'allocUnsafe', 'allocUnsafeSlow', 'from']);
    assert.equal(typeof Legacy.from, 'function');
    assert.equal(typeof Legacy.alloc, 'function');
  });

  it('the shimmed Buffer.from handles the encodings the service uses', () => {
    const Legacy = legacyBufferCtor();
    installBufferShim(Legacy);
    assert.equal(Legacy.from('hi').toString(), 'hi');
    assert.equal(Legacy.from('aGk=', 'base64').toString(), 'hi');
    // 'binary' round-trip is what exec() relies on for raw output on 0.10
    const raw = Buffer.from([0xff, 0x00, 0x01, 0x7f]);
    assert.ok(Legacy.from(raw.toString('binary'), 'binary').equals(raw));
    assert.equal(Legacy.alloc(3).length, 3);
    assert.equal(Legacy.from('x').toString('base64'), 'eA==');
  });

  it('leaves a modern Buffer untouched', () => {
    const before = { from: Buffer.from.bind(Buffer), alloc: Buffer.alloc.bind(Buffer) };
    assert.deepEqual(installBufferShim(Buffer), []);
    // still the native implementations: identical behaviour on a sample
    assert.ok(Buffer.from('abc').equals(before.from('abc')));
    assert.equal(Buffer.alloc(2).length, before.alloc(2).length);
    assert.equal(Buffer.from.name, 'from');
  });

  it('is loaded by the platform layer before anything else uses Buffer', () => {
    const promiseTs = read('services/platform/promise.ts');
    const firstImports = promiseTs
      .split('\n')
      .filter((l) => l.startsWith('import '))
      .slice(0, 3);
    assert.deepEqual(firstImports, ["import 'core-js/stable';", "import 'regenerator-runtime/runtime';", "import './buffer-shim';"]);
  });
});

describe('String.prototype.normalize missing (Node 0.10)', () => {
  it('installs an identity normalize() on a prototype that lacks it', () => {
    const proto: { normalize?: (form?: string) => string } = {};
    assert.equal(installStringShim(proto), true);
    assert.equal(typeof proto.normalize, 'function');
    // tr46 calls `domain.normalize('NFC')`; the TV only ever sees ASCII host names.
    assert.equal(String.prototype.normalize.call('repo.webosbrew.org', 'NFC'), 'repo.webosbrew.org');
    assert.equal(proto.normalize?.call('127.0.0.1', 'NFC'), '127.0.0.1');
  });

  it('leaves a native normalize() alone', () => {
    assert.equal(installStringShim(String.prototype), false);
    assert.equal('e\u0301'.normalize('NFC'), '\u00e9', 'native behaviour intact');
  });

  it('is loaded by the platform layer with the other shims', () => {
    const promiseTs = read('services/platform/promise.ts');
    assert.match(promiseTs, /^import '\.\/string-shim';$/m);
  });

  it('the service bundle actually contains a normalize() call site (so the shim is load-bearing)', () => {
    const bundle = path.join(repoRoot, 'dist', 'services', 'service.js');
    if (!nodeFs.existsSync(bundle)) {
      // bundle.test.ts builds it; when run in isolation, build here
      execFileSync('npx', ['webpack', '--env', 'production'], { cwd: repoRoot, stdio: 'pipe', timeout: 180000 });
    }
    const src = nodeFs.readFileSync(bundle, 'utf8');
    assert.match(src, /\.normalize\(/, 'node-fetch/tr46 normalize() call expected in the bundle');
    assert.match(
      src,
      /normalize=function normalize\(\)\{return String\(this\)\}|normalize=function\(\)\{return String\(this\)\}/,
      'shim present in bundle',
    );
  });
});

describe("child_process.exec without { encoding: 'buffer' } (Node 0.10)", () => {
  const v010 = { major: 0, minor: 10, patch: 48 };
  const v012 = { major: 0, minor: 12, patch: 18 };

  it('detects which path to take from the version', () => {
    assert.equal(proc.execSupportsBufferEncoding(v010), false);
    assert.equal(proc.execSupportsBufferEncoding(v012), true);
    assert.equal(proc.execSupportsBufferEncoding({ major: 8, minor: 17, patch: 0 }), true);
    assert.equal(proc.execSupportsBufferEncoding(), true, 'the build Node is modern');
  });

  it('parses version strings as the TV reports them', () => {
    assert.deepEqual(proc.parseNodeVersion('v0.10.48'), { major: 0, minor: 10, patch: 48 });
    assert.deepEqual(proc.parseNodeVersion('0.12.2'), { major: 0, minor: 12, patch: 2 });
    assert.deepEqual(proc.parseNodeVersion('8.17.0-pre+build'), { major: 8, minor: 17, patch: 0 });
    assert.deepEqual(proc.parseNodeVersion('garbage'), { major: 0, minor: 0, patch: 0 });
  });

  it("the 'binary' fallback yields byte-identical output to the modern path", async () => {
    // bytes that are not valid UTF-8, to prove nothing is decoded on the way
    const cmd = "printf '\\377\\000\\001hello\\376' ; printf '\\200err' >&2";
    const modern = await proc.exec(cmd, {}, v012);
    const legacy = await proc.exec(cmd, {}, v010);
    assert.equal(modern.error, null);
    assert.equal(legacy.error, null);
    assert.ok(Buffer.isBuffer(legacy.stdout));
    assert.ok(legacy.stdout.equals(modern.stdout), 'stdout differs between paths');
    assert.ok(legacy.stderr.equals(modern.stderr), 'stderr differs between paths');
    assert.deepEqual([...legacy.stdout.subarray(0, 3)], [0xff, 0x00, 0x01]);
  });

  it('the fallback reports failures, timeouts and maxBuffer the same way', async () => {
    const failed = await proc.exec('echo out; exit 4', {}, v010);
    assert.equal(failed.error?.code, 4);
    assert.equal(failed.stdout.toString(), 'out\n');

    const killed = await proc.exec('sleep 5', { timeout: 100 }, v010);
    assert.equal(killed.error?.killed, true);

    const overflow = await proc.exec('head -c 5000 /dev/zero', { maxBuffer: 1024 }, v010);
    assert.ok(overflow.error, 'maxBuffer exceeded must surface as an error');
  });
});

describe('stream.destroy() missing (Node < 8)', () => {
  it('destroy() falls back to emitting the error and still fails the pipeline', async () => {
    const src = new PassThrough() as unknown as Record<string, unknown>;
    src['destroy'] = undefined; // as on Node < 8
    const sink = new PassThrough();
    const p = stream.pipeline(src as unknown as NodeJS.ReadableStream, sink);
    stream.destroy(src as unknown as NodeJS.ReadableStream, new Error('stalled'));
    await assert.rejects(p, /stalled/);
  });

  it('destroy() uses the native method when present', async () => {
    const src = new PassThrough();
    const sink = new PassThrough();
    const p = stream.pipeline(src, sink);
    stream.destroy(src, new Error('native'));
    await assert.rejects(p, /native/);
    assert.equal(src.destroyed, true);
  });
});

describe('APIs newer than Node 0.10 are not used directly', () => {
  const serviceFiles = nodeFs
    .readdirSync(path.join(repoRoot, 'services'), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
    .map((f) => path.join('services', f));

  it('source never references the modern APIs the shims replace', () => {
    const forbidden: [RegExp, string][] = [
      [/\bfs\.promises\b/, 'fs.promises (Node 10)'],
      [/\butil\.promisify\b/, 'util.promisify (Node 8) - use platform/promise promisify()'],
      // `stream.pipeline(` in app code is our platform namespace; Node's would be imported from 'stream'.
      [
        /import\s*\{[^}]*\bpipeline\b[^}]*\}\s*from\s*'(node:)?stream'|require\(['"](node:)?stream['"]\)\.pipeline/,
        'stream.pipeline (Node 10) - use platform/stream pipeline()',
      ],
      [/\bAbortController\b/, 'AbortController (Node 15)'],
      [/\bqueueMicrotask\b/, 'queueMicrotask (Node 11)'],
      [/\bfs\.(rmSync|mkdtempSync|cpSync|opendirSync)\b/, 'fs sync helpers newer than 0.10'],
      [/\bBuffer\.(from|alloc|allocUnsafe)\b/, 'Buffer statics outside platform/ (shimmed, but keep the dependency in platform/)'],
    ];
    for (const file of serviceFiles) {
      const src = stripComments(read(file));
      for (const [pattern, what] of forbidden) {
        // The platform layer is where the shimmed Buffer statics are allowed (and defined).
        if (file.startsWith(path.join('services', 'platform') + path.sep) && pattern.source.includes('Buffer')) continue;
        assert.doesNotMatch(src, pattern, `${file} uses ${what}`);
      }
    }
  });

  it('every platform module loads the polyfills before third-party code', () => {
    const platformDir = path.join(repoRoot, 'services', 'platform');
    for (const file of nodeFs.readdirSync(platformDir).filter((f) => f.endsWith('.ts') && f !== 'promise.ts' && f !== 'index.ts')) {
      const src = nodeFs.readFileSync(path.join(platformDir, file), 'utf8');
      const imports = src.split('\n').filter((l) => /^import .* from '|^import '/.test(l));
      assert.ok(imports.length > 0, `${file} has imports`);
      assert.match(
        imports[0] as string,
        /from '\.\/promise'|'\.\/promise'/,
        `${file}: first import must be ./promise (polyfills), got: ${imports[0]}`,
      );
    }
    const index = read('services/platform/index.ts');
    assert.match(index.split('\n').find((l) => l.startsWith('import ')) ?? '', /'\.\/promise'/);
  });
});

describe('build configuration pins the TV runtime', () => {
  it('babel targets Node.js 0.10 with core-js 3 entry polyfills', () => {
    const babel = JSON.parse(read('babel.config.json')) as { presets: unknown[] };
    const env = babel.presets.find((p) => Array.isArray(p) && p[0] === '@babel/env') as [string, Record<string, any>] | undefined;
    assert.ok(env, '@babel/env preset present');
    assert.deepEqual(env[1]['targets'], { node: '0.10' });
    assert.equal(env[1]['useBuiltIns'], 'entry');
    assert.equal(String(env[1]['corejs']), '3');
  });

  it('webpack targets node0.10 and leaves webos-service external', () => {
    const webpack = read('webpack.config.js');
    assert.match(webpack, /target:\s*'node0\.10'/);
    assert.match(webpack, /'webos-service':\s*'commonjs2 webos-service'/);
  });

  it('TypeScript emits ES5', () => {
    const tsconfig = JSON.parse(read('tsconfig.json')) as { compilerOptions: Record<string, unknown> };
    assert.equal(tsconfig.compilerOptions['target'], 'es5');
  });

  it('eslint gates Node built-ins at >=0.10.0 for the service', () => {
    const eslint = read('eslint.config.mjs');
    assert.match(eslint, /no-unsupported-features\/node-builtins/);
    assert.match(eslint, /version: '>=0\.10\.0'/);
  });
});
