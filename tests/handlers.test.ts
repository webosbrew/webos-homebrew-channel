import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import path from 'node:path';

import { homebrewChannelPackageId, registerHandlers, tryRespond } from '../services/handlers';
import startupChecksums from '../services/startup-checksums.json';
import { FakeMessage, FakeService } from './helpers/fake-luna';
import { buildIpk, createTestEnv, haveTool, serveDir, sha256 } from './helpers/env';
import type { TestEnv } from './helpers/env';

const INSTALL_URI = 'luna://com.webos.appInstallService/dev/install';
const REMOVE_URI = 'luna://com.webos.appInstallService/dev/remove';
const LIST_APPS_URI = 'luna://com.webos.applicationManager/dev/listApps';
const TOAST_URI = 'luna://com.webos.notification/createToast';
const AM_CREATE_URI = 'luna://com.palm.activitymanager/create';
const AM_PAUSE_URI = 'luna://com.palm.activitymanager/pause';

function setup(overrides: Parameters<typeof createTestEnv>[0] = {}): { env: TestEnv; bus: FakeService; installer: FakeService } {
  const env = createTestEnv(overrides);
  const bus = new FakeService();
  const installer = new FakeService();
  registerHandlers(bus.asService(), installer.asService(), env.config);
  return { env, bus, installer };
}

describe('tryRespond', () => {
  it('turns a non-Error rejection into an error reply and still cancels', async () => {
    const bus = new FakeService();
    bus.register(
      'boom',
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the point is a non-Error rejection
      tryRespond(() => Promise.reject({ errorText: 'luna said no' })),
    );
    const msg = await bus.invoke('boom');
    assert.deepEqual(msg.last, { returnValue: false, errorText: 'luna said no' });
    assert.deepEqual(msg.cancelledWith, {});
  });

  it('spreads the runner result into a success reply', async () => {
    const bus = new FakeService();
    bus.register(
      'ok',
      tryRespond(() => Promise.resolve({ value: 42 })),
    );
    const msg = await bus.invoke('ok');
    assert.deepEqual(msg.last, { returnValue: true, value: 42 });
  });
});

describe('registered methods', () => {
  const { bus } = setup();
  it('registers the complete public API', () => {
    assert.deepEqual([...bus.handlers.keys()].sort(), [
      'autostart',
      'checkRoot',
      'elevateService',
      'exec',
      'getAppInfo',
      'getConfiguration',
      'install',
      'reboot',
      'registerActivity',
      'setConfiguration',
      'spawn',
      'uninstall',
      'updateStartupScript',
    ]);
  });
  it('spawn has a cancel handler, install has one too', () => {
    assert.ok(bus.handlers.get('spawn')?.cancel);
    assert.ok(bus.handlers.get('install')?.cancel);
  });
});

describe('checkRoot / getConfiguration / setConfiguration', () => {
  let ctx: ReturnType<typeof setup>;
  before(() => {
    ctx = setup();
  });
  after(() => {
    ctx.env.cleanup();
  });

  it('checkRoot reflects the configured root state', async () => {
    const msg = await ctx.bus.invoke('checkRoot', {}, { settleOn: 1 });
    assert.deepEqual(msg.last, { returnValue: true });

    const nonRoot = setup({ runningAsRoot: false });
    try {
      const m2 = await nonRoot.bus.invoke('checkRoot', {}, { settleOn: 1 });
      assert.deepEqual(m2.last, { returnValue: false });
    } finally {
      nonRoot.env.cleanup();
    }
  });

  it('getConfiguration reports every flag as false on a fresh system', async () => {
    const msg = await ctx.bus.invoke('getConfiguration');
    assert.deepEqual(msg.last, {
      returnValue: true,
      root: true,
      homebrewBaseDir: ctx.env.config.paths.homebrewBaseDir,
      telnetDisabled: false,
      failsafe: false,
      sshdEnabled: false,
      blockUpdates: false,
    });
  });

  it('setConfiguration creates and removes flag files and ignores unknown keys', async () => {
    const set = await ctx.bus.invoke('setConfiguration', { sshdEnabled: true, blockUpdates: true, bogus: true });
    assert.deepEqual(set.last, { returnValue: true, sshdEnabled: true, blockUpdates: true });
    assert.ok(nodeFs.existsSync(path.join(ctx.env.config.paths.preferencesDir, 'webosbrew_sshd_enabled')));
    assert.ok(nodeFs.existsSync(path.join(ctx.env.config.paths.preferencesDir, 'webosbrew_block_updates')));
    assert.ok(!nodeFs.existsSync(path.join(ctx.env.config.paths.preferencesDir, 'bogus')));

    const get = await ctx.bus.invoke('getConfiguration');
    assert.equal(get.last['sshdEnabled'], true);
    assert.equal(get.last['blockUpdates'], true);
    assert.equal(get.last['telnetDisabled'], false);

    const unset = await ctx.bus.invoke('setConfiguration', { sshdEnabled: false, telnetDisabled: false });
    assert.deepEqual(unset.last, { returnValue: true, sshdEnabled: false, telnetDisabled: false });
    assert.ok(!nodeFs.existsSync(path.join(ctx.env.config.paths.preferencesDir, 'webosbrew_sshd_enabled')));
  });
});

describe('exec', () => {
  let ctx: ReturnType<typeof setup>;
  before(() => {
    ctx = setup();
  });
  after(() => {
    ctx.env.cleanup();
  });

  it('rejects a missing or non-string command', async () => {
    const m1 = await ctx.bus.invoke('exec', {}, { settleOn: 1 });
    assert.deepEqual(m1.last, { returnValue: false, errorText: 'missing "command"' });
    const m2 = await ctx.bus.invoke('exec', { command: 3 }, { settleOn: 1 });
    assert.deepEqual(m2.last, { returnValue: false, errorText: '"command" is not a string' });
  });

  it('returns stdout/stderr as text and base64', async () => {
    const msg = await ctx.bus.invoke('exec', { command: 'printf hi; printf err >&2' }, { settleOn: 1 });
    assert.equal(msg.last['returnValue'], true);
    assert.equal(msg.last['stdoutString'], 'hi');
    assert.equal(msg.last['stdoutBytes'], Buffer.from('hi').toString('base64'));
    assert.equal(msg.last['stderrString'], 'err');
  });

  it('reports a non-zero exit as an error but still includes output', async () => {
    const msg = await ctx.bus.invoke('exec', { command: 'echo partial; exit 7' }, { settleOn: 1 });
    assert.equal(msg.last['returnValue'], false);
    assert.match(String(msg.last['errorText']), /exit code 7|Command failed/);
    assert.equal(msg.last['stdoutString'], 'partial\n');
  });

  it('kills a command that exceeds the timeout', async () => {
    const msg = await ctx.bus.invoke('exec', { command: 'sleep 5', timeout: 100 }, { settleOn: 1 });
    assert.equal(msg.last['returnValue'], false);
    assert.match(String(msg.last['errorText']), /killed/);
    assert.match(String(msg.last['errorText']), /timeout 100ms/);
  });
});

describe('spawn', () => {
  let ctx: ReturnType<typeof setup>;
  before(() => {
    ctx = setup();
  });
  after(() => {
    ctx.env.cleanup();
  });

  it('streams stdout/stderr events then exit and close', async () => {
    const msg = await ctx.bus.invoke('spawn', { command: 'echo out; echo err >&2; exit 2' }, { settleOn: 4 });
    const events = msg.responses.map((r) => r['event'] as string);
    assert.ok(events.includes('stdoutData'));
    assert.ok(events.includes('stderrData'));
    assert.ok(events.includes('exit'));
    assert.ok(events.includes('close'));
    const exit = msg.responses.find((r) => r['event'] === 'exit');
    assert.equal(exit?.['exitCode'], 2);
    const out = msg.responses.find((r) => r['event'] === 'stdoutData');
    assert.ok(out);
    assert.equal(out['stdoutString'], 'out\n');
    assert.equal(out['stdoutBytes'], Buffer.from('out\n').toString('base64'));
  });

  it('kills the child when the subscription is cancelled', async () => {
    const message = new FakeMessage('spawn', { command: 'sleep 30' }, 'client');
    const done = message.waitForCompletion(2, 5000);
    ctx.bus.handlers.get('spawn')?.handler(message.asMessage());
    // give the shell a moment to start, then cancel
    await new Promise((r) => setTimeout(r, 100));
    ctx.bus.cancelInvocation('spawn', message);
    await done;
    const exit = message.responses.find((r) => r['event'] === 'exit');
    assert.ok(exit, 'exit event expected after cancel');
    assert.equal(exit['exitCode'], null, 'killed by signal has no exit code');
    // `close` only fires once every holder of the stdio pipes is gone, i.e.
    // the orphaned `sleep` was killed along with the shell.
    assert.ok(
      message.responses.some((r) => r['event'] === 'close'),
      'close expected: the whole process group must be killed, not just the shell',
    );
  });
});

describe('reboot / elevateService', () => {
  let ctx: ReturnType<typeof setup>;
  before(() => {
    ctx = setup();
  });
  after(() => {
    ctx.env.cleanup();
  });

  it('reboot runs the configured command', async () => {
    const msg = await ctx.bus.invoke('reboot');
    assert.deepEqual(msg.last, { returnValue: true });
  });

  it('reboot reports a failing command', async () => {
    const failing = setup({ rebootCommand: 'false' });
    try {
      const msg = await failing.bus.invoke('reboot');
      assert.equal(msg.last['returnValue'], false);
    } finally {
      failing.env.cleanup();
    }
  });

  it('elevateService validates id', async () => {
    assert.equal((await ctx.bus.invoke('elevateService', {})).last['errorText'], 'missing "id"');
    assert.equal((await ctx.bus.invoke('elevateService', { id: 1 })).last['errorText'], '"id" is not a string');
    assert.equal((await ctx.bus.invoke('elevateService', { id: '' })).last['errorText'], '"id" is empty');
  });

  it('elevateService runs the bundled elevate-service with the id', async () => {
    const msg = await ctx.bus.invoke('elevateService', { id: 'com.example.svc' });
    assert.deepEqual(msg.last, { returnValue: true });
    assert.equal(nodeFs.readFileSync(path.join(ctx.env.root, 'elevate-calls.log'), 'utf8'), 'com.example.svc\n');
  });

  it('elevateService refuses when not root', async () => {
    const nonRoot = setup({ runningAsRoot: false });
    try {
      const msg = await nonRoot.bus.invoke('elevateService', { id: 'x' });
      assert.deepEqual(msg.last, { returnValue: false, errorText: 'not running as root' });
    } finally {
      nonRoot.env.cleanup();
    }
  });
});

describe('getAppInfo / uninstall', () => {
  let ctx: ReturnType<typeof setup>;
  before(() => {
    ctx = setup();
    ctx.installer.callScripts.set(LIST_APPS_URI, {
      returnValue: true,
      apps: [{ id: 'com.example.app', title: 'Example', type: 'web', folderPath: '/x' }],
    });
  });
  after(() => {
    ctx.env.cleanup();
  });

  it('getAppInfo finds an installed app via the installer client', async () => {
    const msg = await ctx.bus.invoke('getAppInfo', { id: 'com.example.app' });
    assert.equal(msg.last['returnValue'], true);
    assert.equal(msg.last['appId'], 'com.example.app');
    assert.equal((msg.last['appInfo'] as { title: string }).title, 'Example');
  });

  it('getAppInfo errors for unknown or missing ids', async () => {
    assert.match(String((await ctx.bus.invoke('getAppInfo', { id: 'nope' })).last['errorText']), /Invalid appId/);
    assert.match(String((await ctx.bus.invoke('getAppInfo', {})).last['errorText']), /missing/);
  });

  it('uninstall validates id', async () => {
    assert.equal((await ctx.bus.invoke('uninstall', {})).last['errorText'], 'missing "id"');
    assert.equal((await ctx.bus.invoke('uninstall', { id: 5 })).last['errorText'], '"id" is not a string');
  });

  it('uninstall succeeds on statusValue 31 and cancels the subscription', async () => {
    ctx.installer.subscribeScripts.set(REMOVE_URI, [
      { returnValue: true, statusValue: 20 },
      { returnValue: true, statusValue: 31 },
    ]);
    const msg = await ctx.bus.invoke('uninstall', { id: 'com.example.app' });
    assert.deepEqual(msg.last, { returnValue: true, statusText: 'Finished.' });
    const sub = ctx.installer.subscriptions.find((s) => s.uri === REMOVE_URI);
    assert.ok(sub);
    assert.equal(sub.args['id'], 'com.example.app');
    assert.equal(sub.cancelled, true);
  });

  it('uninstall reports statusValue 25 with its reason', async () => {
    ctx.installer.subscribeScripts.set(REMOVE_URI, [{ returnValue: true, statusValue: 25, details: { reason: 'app is running' } }]);
    const msg = await ctx.bus.invoke('uninstall', { id: 'com.example.app' });
    assert.deepEqual(msg.last, { returnValue: false, errorText: 'app is running' });
  });

  it('uninstall reports returnValue:false responses', async () => {
    ctx.installer.subscribeScripts.set(REMOVE_URI, [{ returnValue: false, errorCode: -1, errorText: 'denied' }]);
    const msg = await ctx.bus.invoke('uninstall', { id: 'com.example.app' });
    assert.deepEqual(msg.last, { returnValue: false, errorText: '-1: denied' });
  });

  it('uninstall survives details:null (regression)', async () => {
    ctx.installer.subscribeScripts.set(REMOVE_URI, [
      { returnValue: true, statusValue: 1, details: null },
      { returnValue: true, statusValue: 31 },
    ]);
    const msg = await ctx.bus.invoke('uninstall', { id: 'com.example.app' });
    assert.equal(msg.last['returnValue'], true);
  });
});

describe('install', { skip: !haveTool('ar') && 'binutils ar not available' }, () => {
  let ctx: ReturnType<typeof setup>;
  let server: { url: string; close: () => void };
  let pkg: { path: string; sha256: string };
  let hbcPkg: { path: string; sha256: string };
  let serveRoot: string;

  before(async () => {
    ctx = setup();
    serveRoot = path.join(ctx.env.root, 'www');
    nodeFs.mkdirSync(serveRoot);
    pkg = buildIpk(serveRoot, { Package: 'com.example.app', Version: '1.0.0', Architecture: 'all' });
    hbcPkg = buildIpk(serveRoot, { Package: homebrewChannelPackageId, Version: '9.9.9', Architecture: 'all' });
    server = await serveDir(serveRoot);
    ctx.installer.callScripts.set(LIST_APPS_URI, {
      returnValue: true,
      apps: [{ id: 'com.example.app', title: 'Example App', type: 'web', folderPath: '/x' }],
    });
  });
  after(() => {
    server.close();
    ctx.env.cleanup();
  });

  function urlFor(p: { path: string }): string {
    return `${server.url}/${path.relative(serveRoot, p.path)}`;
  }

  function tmpLeftovers(): string[] {
    return nodeFs.readdirSync(ctx.env.config.paths.tmpDir).filter((f) => f.startsWith('.hbchannel-incoming-'));
  }

  it('validates the payload', async () => {
    assert.match(String((await ctx.bus.invoke('install', {})).last['errorText']), /ipkUrl/);
    assert.match(String((await ctx.bus.invoke('install', { ipkUrl: 'http://x' })).last['errorText']), /ipkHash/);
  });

  it('downloads, verifies, installs, toasts, and cleans up', async () => {
    ctx.installer.subscribeScripts.set(INSTALL_URI, [
      { returnValue: true, statusValue: 10 },
      { returnValue: true, statusValue: 30, details: { packageId: 'com.example.app' } },
    ]);

    const msg = await ctx.bus.invoke('install', { ipkUrl: urlFor(pkg), ipkHash: pkg.sha256, id: 'com.example.app' });

    assert.deepEqual(msg.last, { returnValue: true, statusText: 'Finished.', finished: true });
    const statuses = msg.responses.map((r) => r['statusText'] as string | undefined);
    assert.ok(statuses.includes('Downloading…'));
    assert.ok(statuses.includes('Verifying…'));
    assert.ok(statuses.includes('Installing…'));

    const sub = ctx.installer.subscriptions.find((s) => s.uri === INSTALL_URI);
    assert.ok(sub);
    assert.equal(sub.args['id'], 'com.example.app');
    assert.ok(String(sub.args['ipkUrl']).startsWith(ctx.env.config.paths.tmpDir));
    assert.equal(sub.cancelled, true);

    assert.deepEqual(ctx.bus.toasts(), ['Application installed: Example App']);
    assert.deepEqual(tmpLeftovers(), [], 'temporary package should be removed');
  });

  it('rejects a checksum mismatch and removes the download', async () => {
    const msg = await ctx.bus.invoke('install', { ipkUrl: urlFor(pkg), ipkHash: sha256('something else') });
    assert.equal(msg.last['returnValue'], false);
    assert.match(String(msg.last['errorText']), /Invalid file checksum/);
    assert.deepEqual(tmpLeftovers(), []);
    assert.equal(ctx.installer.subscriptions.filter((s) => s.uri === INSTALL_URI).length, 1, 'no new install attempted');
  });

  it('reports HTTP errors and removes nothing it did not write', async () => {
    const msg = await ctx.bus.invoke('install', { ipkUrl: `${server.url}/missing.ipk`, ipkHash: pkg.sha256 });
    assert.equal(msg.last['returnValue'], false);
    assert.match(String(msg.last['errorText']), /404/);
    assert.deepEqual(tmpLeftovers(), []);
  });

  it('surfaces appInstallService failures', async () => {
    ctx.installer.subscribeScripts.set(INSTALL_URI, [
      { returnValue: true, statusValue: 1, details: { errorCode: -5, reason: 'FAILED_IPKG_INSTALL' } },
    ]);
    const msg = await ctx.bus.invoke('install', { ipkUrl: urlFor(pkg), ipkHash: pkg.sha256 });
    assert.deepEqual(msg.last, { returnValue: false, errorText: '-5: FAILED_IPKG_INSTALL' });
    assert.deepEqual(tmpLeftovers(), []);
  });

  it('falls back to the package id in the toast when appinfo lookup fails', async () => {
    ctx.installer.subscribeScripts.set(INSTALL_URI, [{ returnValue: true, statusValue: 30, details: { packageId: 'com.other.app' } }]);
    ctx.bus.calls.length = 0;
    const msg = await ctx.bus.invoke('install', { ipkUrl: urlFor(pkg), ipkHash: pkg.sha256 });
    assert.equal(msg.last['returnValue'], true);
    assert.deepEqual(ctx.bus.toasts(), ['Application installed: com.other.app']);
  });

  it('hands a Homebrew Channel package to self-update and keeps the file', async () => {
    ctx.bus.calls.length = 0;
    const msg = await ctx.bus.invoke('install', { ipkUrl: urlFor(hbcPkg), ipkHash: hbcPkg.sha256 });
    assert.deepEqual(msg.last, { returnValue: true, statusText: 'Self-update' });
    assert.equal(ctx.env.selfUpdates.length, 1);
    const handedOver = ctx.env.selfUpdates[0] as string;
    assert.ok(nodeFs.existsSync(handedOver), 'package must survive for the detached installer');
    assert.equal(sha256(nodeFs.readFileSync(handedOver)), hbcPkg.sha256);
    assert.deepEqual(ctx.bus.toasts(), ['Performing self-update...']);
    assert.equal(ctx.installer.subscriptions.filter((s) => s.uri === INSTALL_URI).length, 3, 'no in-process install for self-update');
  });

  it('does not self-update when not running as root', async () => {
    const nonRoot = setup({ runningAsRoot: false });
    nonRoot.installer.subscribeScripts.set(INSTALL_URI, [
      { returnValue: true, statusValue: 30, details: { packageId: homebrewChannelPackageId } },
    ]);
    nonRoot.installer.callScripts.set(LIST_APPS_URI, { returnValue: true, apps: [] });
    try {
      const msg = await nonRoot.bus.invoke('install', { ipkUrl: urlFor(hbcPkg), ipkHash: hbcPkg.sha256 });
      assert.equal(msg.last['finished'], true);
      assert.equal(nonRoot.env.selfUpdates.length, 0);
    } finally {
      nonRoot.env.cleanup();
    }
  });
});

describe('updateStartupScript', () => {
  let ctx: ReturnType<typeof setup>;
  let bundledStartup: Buffer;
  const oldShipped = (): Buffer => {
    // The oldest startup.sh we ever shipped, reconstructed from git so the
    // checksum is guaranteed to be in startup-checksums.json.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const first = startupChecksums[0] as { commit: string; sha256: string };
    const contents = execFileSync('git', ['show', `${first.commit}:services/startup.sh`], { cwd: path.resolve(__dirname, '..') });
    assert.equal(sha256(contents), first.sha256);
    return contents;
  };

  before(() => {
    ctx = setup();
    bundledStartup = nodeFs.readFileSync(path.join(ctx.env.config.paths.serviceDir, 'startup.sh'));
  });
  after(() => {
    ctx.env.cleanup();
  });

  const v2Path = (): string => path.join(ctx.env.config.paths.webosbrewDir, 'startup.sh');

  it('does nothing when not root', async () => {
    const nonRoot = setup({ runningAsRoot: false });
    try {
      const msg = await nonRoot.bus.invoke('updateStartupScript');
      assert.deepEqual(msg.last, { returnValue: true, statusText: 'Not running as root.' });
    } finally {
      nonRoot.env.cleanup();
    }
  });

  it('reports nothing changed on a system without any startup hook', async () => {
    const msg = await ctx.bus.invoke('updateStartupScript');
    assert.deepEqual(msg.last, { returnValue: true, statusText: 'Nothing changed', messages: [] });
    assert.deepEqual(ctx.bus.toasts(), []);
  });

  it('upgrades a known older startup.sh (RootMyTV v2 layout)', async () => {
    nodeFs.mkdirSync(ctx.env.config.paths.webosbrewDir, { recursive: true });
    nodeFs.writeFileSync(v2Path(), oldShipped());
    const msg = await ctx.bus.invoke('updateStartupScript');
    assert.equal(msg.last['returnValue'], true);
    assert.deepEqual(msg.last['messages'], [`${v2Path()} updated!`]);
    assert.ok(nodeFs.readFileSync(v2Path()).equals(bundledStartup));
    assert.equal(nodeFs.statSync(v2Path()).mode & 0o111, 0o111, 'copied script is executable');
    assert.equal(ctx.bus.toasts().length, 1);
  });

  it('leaves a current startup.sh alone', async () => {
    ctx.bus.calls.length = 0;
    const msg = await ctx.bus.invoke('updateStartupScript');
    assert.equal(msg.last['statusText'], 'Nothing changed');
  });

  it('warns about, but does not overwrite, a user-modified startup.sh', async () => {
    const custom = Buffer.concat([bundledStartup, Buffer.from('\n# my tweak\n')]);
    nodeFs.writeFileSync(v2Path(), custom);
    ctx.bus.calls.length = 0;
    const msg = await ctx.bus.invoke('updateStartupScript');
    assert.deepEqual(msg.last['messages'], [`${v2Path()} has been manually modified!`]);
    assert.ok(nodeFs.readFileSync(v2Path()).equals(custom));
    nodeFs.rmSync(ctx.env.config.paths.webosbrewDir, { recursive: true });
  });

  it('upgrades a known older startup.sh installed as start-devmode.sh (RootMyTV v1)', async () => {
    const devmode = ctx.env.config.paths.startDevmode;
    nodeFs.writeFileSync(devmode, oldShipped());
    ctx.bus.calls.length = 0;
    const msg = await ctx.bus.invoke('updateStartupScript');
    assert.deepEqual(msg.last['messages'], [`${devmode} updated!`]);
    assert.ok(nodeFs.readFileSync(devmode).equals(bundledStartup));
  });

  it('warns about a modified webosbrew start-devmode.sh but ignores the stock one', async () => {
    const devmode = ctx.env.config.paths.startDevmode;
    nodeFs.writeFileSync(devmode, '#!/bin/sh\n# org.webosbrew custom hook\n');
    ctx.bus.calls.length = 0;
    let msg = await ctx.bus.invoke('updateStartupScript');
    assert.deepEqual(msg.last['messages'], [`${devmode} has been manually modified!`]);

    nodeFs.writeFileSync(devmode, '#!/bin/sh\n# LG stock devmode script\n');
    msg = await ctx.bus.invoke('updateStartupScript');
    assert.equal(msg.last['statusText'], 'Nothing changed');
  });
});

describe('autostart / registerActivity', () => {
  let ctx: ReturnType<typeof setup>;
  before(() => {
    ctx = setup();
    // Make the bundled startup.sh harmless: autostart copies and runs it.
    nodeFs.writeFileSync(
      path.join(ctx.env.config.paths.serviceDir, 'startup.sh'),
      `#!/bin/sh\necho "ran $SKIP_ELEVATION $SERVICE_DIR $PWD" > "${ctx.env.root}/startup-ran.log"\n`,
    );
  });
  after(() => {
    ctx.env.cleanup();
  });

  it('registerActivity creates the boot activity', async () => {
    const msg = await ctx.bus.invoke('registerActivity');
    assert.equal(msg.last['returnValue'], true);
    const call = ctx.bus.callsTo(AM_CREATE_URI)[0];
    assert.ok(call);
    const activity = call.args['activity'] as { name: string; callback: { method: string }; trigger: { method: string } };
    assert.equal(activity.name, `${homebrewChannelPackageId}.service.autostart`);
    assert.equal(activity.callback.method, 'luna://org.webosbrew.hbchannel.service/autostart');
    assert.equal(activity.trigger.method, 'luna://com.webos.bootManager/getBootStatus');
    assert.equal(call.args['replace'], true);
  });

  it('does nothing as non-root', async () => {
    const nonRoot = setup({ runningAsRoot: false });
    try {
      const msg = await nonRoot.bus.invoke('autostart');
      assert.deepEqual(msg.last, { returnValue: true, message: 'Not running as root.' });
    } finally {
      nonRoot.env.cleanup();
    }
  });

  it('installs startup.sh on first run, executes it, and registers the activity when called by the app', async () => {
    ctx.bus.calls.length = 0;
    const msg = await ctx.bus.invoke('autostart', {}, { sender: 'org.webosbrew.hbchannel' });
    assert.equal(msg.last['returnValue'], true);
    const installed = path.join(ctx.env.config.paths.webosbrewDir, 'startup.sh');
    assert.ok(nodeFs.existsSync(installed));
    assert.equal(nodeFs.statSync(installed).mode & 0o111, 0o111);
    assert.equal(ctx.bus.callsTo(AM_CREATE_URI).length, 1, 'activity registered for app-initiated call');
    assert.equal(ctx.bus.callsTo(AM_PAUSE_URI).length, 0);

    // the detached script runs asynchronously
    const log = path.join(ctx.env.root, 'startup-ran.log');
    for (let i = 0; i < 50 && !nodeFs.existsSync(log); i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.equal(nodeFs.readFileSync(log, 'utf8'), `ran true ${ctx.env.config.paths.serviceDir} ${ctx.env.config.paths.homeDir}\n`);
  });

  it('pauses the activity instead of re-registering when called by ActivityManager', async () => {
    ctx.bus.calls.length = 0;
    await ctx.bus.invoke('autostart', {}, { sender: 'com.webos.service.activitymanager' });
    // pause is fire-and-forget; let it land
    await new Promise((r) => setImmediate(r));
    assert.equal(ctx.bus.callsTo(AM_PAUSE_URI).length, 1);
    assert.equal(ctx.bus.callsTo(AM_CREATE_URI).length, 0);
  });

  it('is a no-op once startup.sh has run this boot', async () => {
    nodeFs.writeFileSync(ctx.env.config.paths.startupOnceFlag, '');
    const msg = await ctx.bus.invoke('autostart', {}, { sender: 'org.webosbrew.hbchannel' });
    assert.deepEqual(msg.last, { returnValue: true, message: 'Startup script already executed.' });
  });
});

describe('toast wiring', () => {
  it('createToast calls use our package id as sourceId', async () => {
    const ctx = setup();
    try {
      ctx.installer.subscribeScripts.set(REMOVE_URI, [{ returnValue: true, statusValue: 31 }]);
      // updateStartupScript with a modified script produces a toast
      nodeFs.mkdirSync(ctx.env.config.paths.webosbrewDir, { recursive: true });
      nodeFs.writeFileSync(path.join(ctx.env.config.paths.webosbrewDir, 'startup.sh'), '#!/bin/sh\n# different\n');
      await ctx.bus.invoke('updateStartupScript');
      const toast = ctx.bus.callsTo(TOAST_URI)[0];
      assert.equal(toast?.args['sourceId'], homebrewChannelPackageId);
    } finally {
      ctx.env.cleanup();
    }
  });
});
