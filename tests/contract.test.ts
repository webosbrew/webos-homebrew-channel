/*
 * Frontend <-> service contract, tested end to end.
 *
 * Every payload the frontend builds (frontend/core/service-contract.js) is
 * pushed through the real service handlers (services/handlers.ts), and every
 * response the handlers emit is fed back through the frontend's parsers. If
 * either side changes shape, this is where it shows up.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import path from 'node:path';

import { availableFlags, homebrewChannelPackageId, registerHandlers } from '../services/handlers';
import { FakeService } from './helpers/fake-luna';
import type { Payload } from './helpers/fake-luna';
import { buildIpk, createTestEnv, haveTool, serveDir } from './helpers/env';
import type { TestEnv } from './helpers/env';

// eslint-disable-next-line import/extensions
import * as contract from '../frontend/core/service-contract.js';

const INSTALL_URI = 'luna://com.webos.appInstallService/dev/install';
const REMOVE_URI = 'luna://com.webos.appInstallService/dev/remove';
const LIST_APPS_URI = 'luna://com.webos.applicationManager/dev/listApps';

/** Methods the service exposes that the frontend deliberately does not call. */
const SERVICE_ONLY_METHODS = ['checkRoot', 'elevateService', 'exec', 'registerActivity', 'spawn'];

function setup(overrides: Parameters<typeof createTestEnv>[0] = {}): { env: TestEnv; bus: FakeService; installer: FakeService } {
  const env = createTestEnv(overrides);
  const bus = new FakeService();
  const installer = new FakeService();
  registerHandlers(bus.asService(), installer.asService(), env.config);
  return { env, bus, installer };
}

describe('method and flag names agree', () => {
  const ctx = setup();
  after(() => {
    ctx.env.cleanup();
  });

  it('every method the frontend calls is registered by the service', () => {
    for (const method of Object.values<string>(contract.METHODS)) {
      assert.ok(ctx.bus.handlers.has(method), `frontend calls ${method} but the service does not register it`);
    }
  });

  it('every service method is either used by the frontend or listed as service-only', () => {
    const known = new Set([...Object.values<string>(contract.METHODS), ...SERVICE_ONLY_METHODS]);
    for (const method of ctx.bus.handlers.keys()) {
      assert.ok(known.has(method), `service registers ${method}; add it to the frontend contract or SERVICE_ONLY_METHODS`);
    }
  });

  it('the frontend and service agree on the configuration flag names', () => {
    assert.deepEqual([...contract.FLAGS].sort(), Object.keys(availableFlags).sort());
  });

  it('the service URI matches services.json', () => {
    const serviceInfo = JSON.parse(nodeFs.readFileSync(path.resolve(__dirname, '..', 'services', 'services.json'), 'utf8')) as {
      id: string;
    };
    assert.equal(contract.SERVICE_URI, `luna://${serviceInfo.id}`);
  });
});

describe('configuration round-trip', () => {
  const ctx = setup();
  after(() => {
    ctx.env.cleanup();
  });

  it('UI state -> setConfiguration -> getConfiguration -> UI state', async () => {
    const uiState = { telnetEnabled: false, sshdEnabled: true, blockUpdates: true, failsafe: false };

    const set = await ctx.bus.invoke('setConfiguration', contract.buildSetConfigurationPayload(uiState));
    assert.equal(set.last['returnValue'], true);

    const get = await ctx.bus.invoke('getConfiguration');
    const parsed = contract.parseConfigurationResponse(get.last);
    assert.equal(parsed.error, null);
    assert.equal(parsed.rootIsActive, true);
    assert.equal(parsed.rootStatusText, 'ok');
    assert.deepEqual(
      {
        telnetEnabled: parsed.telnetEnabled,
        sshdEnabled: parsed.sshdEnabled,
        blockUpdates: parsed.blockUpdates,
        failsafe: parsed.failsafe,
      },
      uiState,
    );
  });

  it('a non-root service parses as unelevated', async () => {
    const nonRoot = setup({ runningAsRoot: false });
    try {
      const get = await nonRoot.bus.invoke('getConfiguration');
      const parsed = contract.parseConfigurationResponse(get.last);
      assert.equal(parsed.rootIsActive, false);
      assert.equal(parsed.rootStatusText, 'unelevated');
    } finally {
      nonRoot.env.cleanup();
    }
  });

  it('a service error parses into an error state', async () => {
    // Make the preferences directory unwritable-by-absence so setConfiguration fails.
    const broken = setup();
    try {
      nodeFs.rmSync(broken.env.config.paths.preferencesDir, { recursive: true });
      const set = await broken.bus.invoke('setConfiguration', contract.buildSetConfigurationPayload({ sshdEnabled: true }));
      const parsed = contract.parseConfigurationResponse(set.last);
      assert.ok(parsed.error);
      assert.equal(parsed.rootIsActive, false);
    } finally {
      broken.env.cleanup();
    }
  });
});

describe('reboot / autostart / updateStartupScript payloads', () => {
  const ctx = setup({ runningAsRoot: false });
  after(() => {
    ctx.env.cleanup();
  });

  it('reboot accepts the frontend payload', async () => {
    const msg = await ctx.bus.invoke('reboot', contract.buildRebootPayload());
    assert.equal(msg.last['returnValue'], true);
  });

  it('autostart and updateStartupScript accept the empty payload the frontend sends', async () => {
    assert.equal((await ctx.bus.invoke('autostart', {})).last['returnValue'], true);
    assert.equal((await ctx.bus.invoke('updateStartupScript', {})).last['returnValue'], true);
  });
});

describe('install / getAppInfo / uninstall round-trip', { skip: !haveTool('ar') && 'binutils ar not available' }, () => {
  let ctx: ReturnType<typeof setup>;
  let server: { url: string; close: () => void };
  let serveRoot: string;
  let pkg: { path: string; sha256: string };
  let manifestUrl: string;
  const appId = 'com.example.app';
  const installedRecord = { id: appId, title: 'Example App', type: 'web', folderPath: '/x', version: '1.0.0' };

  before(async () => {
    ctx = setup();
    serveRoot = path.join(ctx.env.root, 'www');
    nodeFs.mkdirSync(path.join(serveRoot, 'apps'), { recursive: true });
    pkg = buildIpk(path.join(serveRoot, 'apps'), { Package: appId, Version: '1.0.0', Architecture: 'all' });
    server = await serveDir(serveRoot);
    manifestUrl = `${server.url}/apps/${appId}.manifest.json`;
  });
  after(() => {
    server.close();
    ctx.env.cleanup();
  });

  /** A manifest as the repository would serve it: relative ipkUrl, sha256 hash. */
  function repositoryManifest(): Payload {
    return {
      id: appId,
      version: '1.0.0',
      ipkUrl: path.relative(path.join(serveRoot, 'apps'), pkg.path),
      ipkHash: { sha256: pkg.sha256 },
    };
  }

  it('getAppInfo parses to null when not installed', async () => {
    ctx.installer.callScripts.set(LIST_APPS_URI, { returnValue: true, apps: [] });
    const msg = await ctx.bus.invoke('getAppInfo', contract.buildGetAppInfoPayload(appId));
    assert.equal(contract.parseAppInfoResponse(msg.last), null);
  });

  it('the frontend-built install payload drives the service to completion, and every response is understood', async () => {
    ctx.installer.subscribeScripts.set(INSTALL_URI, [
      { returnValue: true, statusValue: 10 },
      { returnValue: true, statusValue: 30, details: { packageId: appId } },
    ]);
    ctx.installer.callScripts.set(LIST_APPS_URI, { returnValue: true, apps: [installedRecord] });

    const payload = contract.buildInstallPayload(repositoryManifest(), manifestUrl, `${server.url}/apps.json`);
    const msg = await ctx.bus.invoke('install', payload);

    const events = msg.responses.map((r) => contract.classifyInstallResponse(r));
    const types = events.map((e) => e.type);

    assert.ok(!types.includes('ignore'), `frontend could not classify a service response: ${JSON.stringify(msg.responses)}`);
    assert.ok(!types.includes('error'));
    assert.deepEqual(
      events.filter((e) => e.type === 'status').map((e) => String(e.text)),
      ['Downloading…', 'Verifying…', 'Installing…'],
    );
    const progress = events.filter((e) => e.type === 'progress').map((e) => e.percent as number);
    assert.ok(progress.length >= 1, 'at least one progress event');
    assert.equal(progress[progress.length - 1], 100);
    assert.equal(types[types.length - 1], 'finished');

    // and what the frontend asks for next parses back to the installed record
    const info = await ctx.bus.invoke('getAppInfo', contract.buildGetAppInfoPayload(appId));
    assert.deepEqual(contract.parseAppInfoResponse(info.last), installedRecord);
  });

  it('a service-side install failure is classified as an error with a usable message', async () => {
    const payload = contract.buildInstallPayload({ ...repositoryManifest(), ipkHash: { sha256: '0'.repeat(64) } }, manifestUrl);
    const msg = await ctx.bus.invoke('install', payload);
    const event = contract.classifyInstallResponse(msg.last);
    assert.equal(event.type, 'error');
    assert.match(contract.formatOperationError(msg.last, 'installation'), /^An error occured during installation: Invalid file checksum/);
  });

  it('a payload the frontend would never build is rejected by the service (both sides agree on required fields)', async () => {
    assert.throws(() => contract.buildInstallPayload({ id: appId }, manifestUrl));
    const msg = await ctx.bus.invoke('install', { id: appId });
    assert.equal(msg.last['returnValue'], false);
  });

  it('uninstall round-trips including the error path', async () => {
    ctx.installer.subscribeScripts.set(REMOVE_URI, [{ returnValue: true, statusValue: 31 }]);
    const ok = await ctx.bus.invoke('uninstall', contract.buildUninstallPayload(appId));
    assert.equal(ok.last['returnValue'], true);

    ctx.installer.subscribeScripts.set(REMOVE_URI, [{ returnValue: true, statusValue: 25, details: { reason: 'app is running' } }]);
    const failed = await ctx.bus.invoke('uninstall', contract.buildUninstallPayload(appId));
    assert.equal(contract.formatOperationError(failed.last, 'removal'), 'An error occured during removal: app is running');
  });

  it('the post-self-update failure gets the reboot hint', () => {
    // What the frontend sees when the (non-root) remote bus is gone right after a self-update.
    const response = { returnValue: false, errorText: 'Error: luna-send-pub: connect ECONNREFUSED /var/run/ls2/...' };
    assert.ok(contract.formatOperationError(response, 'installation').indexOf(contract.RESTART_HINT) !== -1);
  });

  it('the Homebrew Channel package id used for self-protection matches the service', () => {
    // eslint-disable-next-line import/extensions
    const manifest = require('../frontend/core/manifest.js') as { HOMEBREW_CHANNEL_ID: string };
    assert.equal(manifest.HOMEBREW_CHANNEL_ID, homebrewChannelPackageId);
  });
});
