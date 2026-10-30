/*
 * services/webos-service-remote/execbus.js drives luna-send(-pub) as a child
 * process when the service is not root. The child failing to start, or
 * exiting without ever answering, must surface as an error response on the
 * request - never as an uncaught exception (which took the whole service
 * down) or a request that hangs forever.
 *
 * luna-send-pub does not exist off the TV, so a fake one is put on PATH.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Handle from '../services/webos-service-remote/execbus';
import Subscription from '../services/webos-service-remote/subscription';

interface Body {
  payload(): string;
}

interface Msg {
  payload: Record<string, unknown>;
}

function parsed(body: Body): Record<string, unknown> {
  return JSON.parse(body.payload()) as Record<string, unknown>;
}

function waitFor<T>(attach: (resolve: (value: T) => void) => void, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`no event within ${ms}ms`));
    }, ms);
    attach((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

describe('webos-service-remote execbus (luna-send-pub child process)', () => {
  const originalPath = process.env['PATH'];
  let binDir: string;

  function fakeLunaSend(script: string): void {
    const file = path.join(binDir, 'luna-send-pub');
    nodeFs.writeFileSync(file, `#!/bin/sh\n${script}\n`);
    nodeFs.chmodSync(file, 0o755);
  }

  before(() => {
    binDir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'hbchannel-execbus-'));
    process.env['PATH'] = binDir; // nothing but our fake is reachable
  });

  after(() => {
    process.env['PATH'] = originalPath;
    nodeFs.rmSync(binDir, { recursive: true, force: true });
  });

  it('a missing luna-send-pub is an error response, not an uncaught exception', async () => {
    nodeFs.rmSync(path.join(binDir, 'luna-send-pub'), { force: true });
    const request = new Handle(true).subscribe('luna://x/y', '{}');
    const body = await waitFor<Body>((resolve) => request.on('cancel', resolve));
    const payload = parsed(body);
    assert.equal(payload['returnValue'], false);
    assert.match(String(payload['errorText']), /Unable to exec luna-send-pub: .*ENOENT/);
  });

  it('a luna-send-pub that exits without answering is an error response carrying its stderr', async () => {
    fakeLunaSend('echo "Unknown method" >&2; exit 2');
    const request = new Handle(true).subscribe('luna://x/y', '{}');
    const body = await waitFor<Body>((resolve) => request.on('cancel', resolve));
    const payload = parsed(body);
    assert.equal(payload['returnValue'], false);
    assert.match(String(payload['errorText']), /luna-send-pub exited with code 2 without a response: Unknown method/);
  });

  it('each stdout line is a response; the child is killed on cancel()', async () => {
    fakeLunaSend('echo \'{"returnValue":true,"statusValue":30,"details":{"packageId":"com.example.app"}}\'; sleep 30');
    const request = new Handle(true).subscribe('luna://x/y', '{}');
    const body = await waitFor<Body>((resolve) => request.on('response', resolve));
    assert.deepEqual(parsed(body), { returnValue: true, statusValue: 30, details: { packageId: 'com.example.app' } });
    const cancels: Body[] = [];
    request.on('cancel', (b: Body) => cancels.push(b));
    request.cancel();
    await waitFor<null>((resolve) => {
      (request as unknown as { proc: NodeJS.EventEmitter }).proc.on('close', () => {
        resolve(null);
      });
    });
    assert.equal(cancels.length, 0, 'a cancel we asked for is not reported as a failure');
  });

  it('through Subscription, the failure reaches installPackage-style consumers as a cancel with errorText', async () => {
    nodeFs.rmSync(path.join(binDir, 'luna-send-pub'), { force: true });
    const sub = new Subscription(new Handle(true), 'luna://com.webos.appInstallService/dev/install', { subscribe: true });
    const msg = await waitFor<Msg>((resolve) => sub.on('cancel', resolve));
    assert.equal(msg.payload['returnValue'], false);
    assert.match(String(msg.payload['errorText']), /Unable to exec luna-send-pub/);
  });
});
