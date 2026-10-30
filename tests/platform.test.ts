import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import nodeFs from 'node:fs';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';

import { fs, proc, stream, crypto, http as platformHttp, promisify, promisifyVoid, withTimeout, toError } from '../services/platform';

const tmpDir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'hbchannel-platform-'));
after(() => {
  nodeFs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('promise helpers', () => {
  it('promisify resolves with the callback result', async () => {
    const add = (a: number, b: number, cb: (err: unknown, result: number) => void) => {
      cb(null, a + b);
    };
    assert.equal(await promisify(add)(2, 3), 5);
  });

  it('promisify rejects with an Error for any truthy err', async () => {
    const fail = (cb: (err: unknown, result: number) => void) => {
      cb('nope', 0);
    };
    await assert.rejects(promisify(fail)(), (err: unknown) => err instanceof Error && err.message === 'nope');
  });

  it('promisifyVoid resolves on null err', async () => {
    const ok = (cb: (err: unknown) => void) => {
      cb(null);
    };
    await assert.doesNotReject(promisifyVoid(ok)());
  });

  it('withTimeout rejects a slow promise', async () => {
    const slow = new Promise<void>((resolve) => setTimeout(resolve, 200));
    await assert.rejects(withTimeout(slow, 20, 'too slow'), /too slow/);
  });

  it('withTimeout passes through a fast value', async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 1000), 7);
  });

  it('toError normalises non-errors', () => {
    assert.equal(toError(new Error('x')).message, 'x');
    assert.equal(toError('str').message, 'str');
    assert.equal(toError({ errorText: 'luna' }).message, 'luna');
  });
});

describe('fs', () => {
  const file = path.join(tmpDir, 'a.txt');

  it('writeFile / readFile round-trip (string and Buffer)', async () => {
    await fs.writeFile(file, 'hello');
    assert.equal(await fs.readFile(file, 'utf-8'), 'hello');
    assert.ok(Buffer.isBuffer(await fs.readFile(file)));
  });

  it('exists / isFile / stat', async () => {
    assert.equal(await fs.exists(file), true);
    assert.equal(await fs.isFile(file), true);
    assert.equal(await fs.isFile(tmpDir), false);
    assert.equal(await fs.exists(path.join(tmpDir, 'missing')), false);
    assert.ok((await fs.stat(file)).isFile());
  });

  it('mkdir / chmod / unlink', async () => {
    const dir = path.join(tmpDir, 'sub');
    await fs.mkdir(dir, 0o755);
    assert.equal(fs.isDirectorySync(dir), true);
    await fs.chmod(file, 0o600);
    assert.equal(nodeFs.statSync(file).mode & 0o777, 0o600);
    await fs.unlink(file);
    assert.equal(await fs.exists(file), false);
  });

  it('isNotFound identifies ENOENT', async () => {
    try {
      await fs.unlink(path.join(tmpDir, 'missing'));
      assert.fail('should have thrown');
    } catch (err: unknown) {
      assert.equal(fs.isNotFound(err), true);
    }
    assert.equal(fs.isNotFound(new Error('other')), false);
    assert.equal(fs.isNotFound('ENOENT'), false);
  });

  it('sync helpers', () => {
    const f = path.join(tmpDir, 'sync.txt');
    fs.writeFileSync(f, 'x');
    assert.equal(fs.existsSync(f), true);
    assert.equal(fs.isFileSync(f), true);
    assert.equal(fs.readFileSync(f).toString(), 'x');
    assert.equal(fs.isFileSync(path.join(tmpDir, 'nope')), false);
    assert.equal(fs.isDirectorySync(path.join(tmpDir, 'nope')), false);
  });
});

describe('proc', () => {
  it('exec returns stdout/stderr as Buffers and a null error on success', async () => {
    const result = await proc.exec('printf out; printf err >&2');
    assert.equal(result.error, null);
    assert.equal(result.stdout.toString(), 'out');
    assert.equal(result.stderr.toString(), 'err');
  });

  it('exec reports a failing command through `error`, not a rejection', async () => {
    const result = await proc.exec('exit 3');
    assert.ok(result.error);
    assert.equal(result.error.code, 3);
  });

  it('exec kills on timeout', async () => {
    const result = await proc.exec('sleep 5', { timeout: 50 });
    assert.ok(result.error);
    assert.equal(result.error.killed, true);
  });

  it('execFile resolves stdout and rejects on failure', async () => {
    assert.equal((await proc.execFile('echo', ['hi'])).trim(), 'hi');
    await assert.rejects(proc.execFile('sh', ['-c', 'exit 2']));
  });

  it('killTree kills the shell and its children', async () => {
    const child = proc.spawnShell('sleep 30; echo never');
    await new Promise((r) => setTimeout(r, 100));
    const start = Date.now();
    proc.killTree(child, 'SIGTERM');
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    assert.equal(code, null);
    assert.ok(Date.now() - start < 2000, 'close must not wait for the orphaned sleep');
  });

  it('spawnShell streams output', async () => {
    const child = proc.spawnShell('echo spawned');
    const chunks: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    assert.equal(code, 0);
    assert.equal(Buffer.concat(chunks).toString().trim(), 'spawned');
  });
});

describe('stream', () => {
  it('pipeline resolves when data flows through', async () => {
    const src = new PassThrough();
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (d: Buffer) => chunks.push(d));
    src.end('abc');
    await stream.pipeline(src, sink);
    assert.equal(Buffer.concat(chunks).toString(), 'abc');
  });

  it('destroy fails a pipeline with the given error', async () => {
    const src = new PassThrough();
    const sink = new PassThrough();
    const p = stream.pipeline(src, sink);
    stream.destroy(src, new Error('boom'));
    await assert.rejects(p, /boom/);
  });

  it('destroy falls back to emitting on streams without destroy()', () => {
    // Simulate a pre-Node 8 stream: an EventEmitter-like object without destroy().
    const fake = new PassThrough() as unknown as Record<string, unknown>;
    fake['destroy'] = undefined;
    const seen: Error[] = [];
    (fake as unknown as NodeJS.ReadableStream).on('error', (e: Error) => {
      seen.push(e);
    });
    stream.destroy(fake as unknown as NodeJS.ReadableStream, new Error('emitted'));
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.message, 'emitted');
  });
});

describe('crypto', () => {
  it('hashString matches node', () => {
    assert.equal(crypto.hashString('abc'), createHash('sha256').update('abc').digest('hex'));
  });

  it('hashFile matches node', async () => {
    const f = path.join(tmpDir, 'hash.bin');
    const data = Buffer.alloc(100000, 7);
    nodeFs.writeFileSync(f, data);
    assert.equal(await crypto.hashFile(f), createHash('sha256').update(data).digest('hex'));
  });
});

describe('http.downloadToFile', () => {
  function serve(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('no address');
        resolve({ url: `http://127.0.0.1:${address.port}`, close: () => server.close() });
      });
    });
  }

  it('downloads a file and reports progress', async () => {
    const body = Buffer.alloc(64 * 1024, 1);
    const srv = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': body.length });
      res.end(body);
    });
    try {
      const target = path.join(tmpDir, 'dl.bin');
      const progress: number[] = [];
      await platformHttp.downloadToFile(`${srv.url}/file`, target, {
        timeout: 5000,
        onProgress: (pct) => progress.push(pct),
      });
      assert.ok(nodeFs.readFileSync(target).equals(body));
      assert.ok(progress.length >= 1);
      assert.equal(progress[progress.length - 1], 100);
    } finally {
      srv.close();
    }
  });

  it('rejects on HTTP error status', async () => {
    const srv = await serve((_req, res) => {
      res.writeHead(404);
      res.end('nope');
    });
    try {
      await assert.rejects(platformHttp.downloadToFile(`${srv.url}/x`, path.join(tmpDir, 'never.bin')), /404/);
    } finally {
      srv.close();
    }
  });

  it('rejects when the body stalls', async () => {
    let socketHold: http.ServerResponse | null = null;
    const srv = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': 1000 });
      res.write(Buffer.alloc(10));
      socketHold = res; // never finish
    });
    try {
      const start = Date.now();
      await assert.rejects(platformHttp.downloadToFile(`${srv.url}/slow`, path.join(tmpDir, 'stall.bin'), { timeout: 150 }), /stalled/);
      assert.ok(Date.now() - start < 2000);
    } finally {
      (socketHold as http.ServerResponse | null)?.destroy();
      srv.close();
    }
  });

  it('rejects when headers never arrive', async () => {
    const srv = await serve(() => {
      /* never respond */
    });
    try {
      await assert.rejects(platformHttp.downloadToFile(`${srv.url}/hang`, path.join(tmpDir, 'hang.bin'), { timeout: 150 }), /timeout/i);
    } finally {
      srv.close();
    }
  });
});
