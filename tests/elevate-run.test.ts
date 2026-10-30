import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { elevate, resolveNames } from '../services/elevate-run';
import type { LunaRoots } from '../services/elevate-run';

const SERVICE = 'org.webosbrew.hbchannel.service';
const APP = 'org.webosbrew.hbchannel';

/** elevate() refuses to reference a launcher that does not exist, so create one. */
function mkLauncher(base: string): string {
  const launcher = path.join(base, 'bundle', 'run-js-service');
  nodeFs.mkdirSync(path.dirname(launcher), { recursive: true });
  nodeFs.writeFileSync(launcher, '#!/bin/sh\n', { mode: 0o755 });
  return launcher;
}

function mkroots(base: string): LunaRoots {
  return {
    legacyDev: path.join(base, 'palm', 'ls2-dev'),
    legacyNonDev: path.join(base, 'palm', 'ls2'),
    dev: path.join(base, 'luna-service2-dev'),
    nonDev: path.join(base, 'luna-service2'),
  };
}

function write(file: string, contents: string): void {
  nodeFs.mkdirSync(path.dirname(file), { recursive: true });
  nodeFs.writeFileSync(file, contents);
}

function read(file: string): string {
  return nodeFs.readFileSync(file, 'utf8');
}

function readJson(file: string): any {
  return JSON.parse(read(file));
}

describe('resolveNames', () => {
  it('defaults to the Homebrew Channel service', () => {
    assert.deepEqual(resolveNames([]), { serviceName: SERVICE, appName: APP });
  });
  it('accepts the app id as an alias for the service', () => {
    assert.deepEqual(resolveNames([APP]), { serviceName: SERVICE, appName: APP });
  });
  it('derives appName from a service name', () => {
    assert.deepEqual(resolveNames(['com.example.foo.service']), { serviceName: 'com.example.foo.service', appName: 'com.example.foo' });
  });
  it('accepts an explicit appName', () => {
    assert.deepEqual(resolveNames(['com.example.svc', 'com.example']), { serviceName: 'com.example.svc', appName: 'com.example' });
  });
});

describe('elevate() on a webOS 4.x+ layout', () => {
  let base: string;
  let roots: LunaRoots;
  let serviceFile: string;
  let roleFile: string;
  let manifestFile: string;
  let clientPermFile: string;
  let apiPublic: string;
  let apiLunabus: string;
  let RUN_JS: string;

  before(() => {
    base = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'hbchannel-elevate-'));
    roots = mkroots(base);
    RUN_JS = mkLauncher(base);
    const dev = roots.dev;
    serviceFile = path.join(dev, 'services.d', `${SERVICE}.service`);
    roleFile = path.join(dev, 'roles.d', `${SERVICE}.service.json`);
    manifestFile = path.join(dev, 'manifests.d', `${APP}.json`);
    clientPermFile = path.join(dev, 'client-permissions.d', `${SERVICE}.root.json`);
    apiPublic = path.join(dev, 'api-permissions.d', `${SERVICE}.api.public.json`);
    apiLunabus = path.join(dev, 'api-permissions.d', `${SERVICE}.api.lunabus.query.json`);

    write(
      serviceFile,
      `[D-BUS Service]\nName=${SERVICE}\nExec=/usr/bin/run-js-service -n /media/developer/apps/usr/palm/services/${SERVICE}\nType=dynamic\n`,
    );
    write(
      roleFile,
      JSON.stringify({
        appId: SERVICE,
        type: 'regular',
        allowedNames: [SERVICE],
        trustLevel: 'dev',
        permissions: [{ service: SERVICE, inbound: ['*'], outbound: ['com.webos.service.applicationmanager'] }],
      }),
    );
    write(
      manifestFile,
      JSON.stringify({
        version: '1.0.0',
        id: APP,
        serviceFiles: [serviceFile],
        roleFiles: [roleFile],
        clientPermissionFiles: [path.join(dev, 'client-permissions.d', `${SERVICE}.json`)],
        apiPermissionFiles: [path.join(dev, 'api-permissions.d', `${SERVICE}.json`)],
      }),
    );
    // Directories the permission files go into must exist (ls2 creates them).
    nodeFs.mkdirSync(path.dirname(clientPermFile), { recursive: true });
    nodeFs.mkdirSync(path.dirname(apiPublic), { recursive: true });
  });
  after(() => {
    nodeFs.rmSync(base, { recursive: true, force: true });
  });

  it('patches everything on the first run and reports a change', () => {
    const changed = elevate(SERVICE, APP, { roots, runJsServicePath: RUN_JS });
    assert.equal(changed, true);

    // service: our launcher
    assert.match(read(serviceFile), new RegExp(`^Exec=${RUN_JS.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} -n `, 'm'));
    assert.doesNotMatch(read(serviceFile), /^Exec=\/usr\/bin\/run-js-service/m);

    // role: wildcard names + permissions
    const role = readJson(roleFile);
    assert.ok(role.allowedNames.includes('*'));
    assert.ok(role.allowedNames.includes('com.webos.service.capture.client*'));
    assert.ok(role.permissions.some((p: any) => p.service === '*'));
    assert.ok(role.permissions[0].outbound.includes('*'));

    // permission files created
    assert.deepEqual(readJson(clientPermFile), { [`${SERVICE}*`]: ['all'] });
    assert.deepEqual(readJson(apiPublic), { public: [`${SERVICE}/*`] });
    assert.deepEqual(readJson(apiLunabus), { 'lunabus.query': [`${SERVICE}/*`] });

    // manifest references them
    const manifest = readJson(manifestFile);
    assert.ok(manifest.clientPermissionFiles.includes(clientPermFile));
    assert.ok(manifest.apiPermissionFiles.includes(apiPublic));
    assert.ok(manifest.apiPermissionFiles.includes(apiLunabus));
  });

  it('is idempotent: a second run changes nothing', () => {
    const snapshot = [serviceFile, roleFile, manifestFile, clientPermFile, apiPublic, apiLunabus].map(read);
    const changed = elevate(SERVICE, APP, { roots, runJsServicePath: RUN_JS });
    assert.equal(changed, false);
    assert.deepEqual([serviceFile, roleFile, manifestFile, clientPermFile, apiPublic, apiLunabus].map(read), snapshot);
  });

  it('skips a root with no service file entirely', () => {
    // nonDev root exists but has no service file for us
    nodeFs.mkdirSync(path.join(roots.nonDev, 'client-permissions.d'), { recursive: true });
    const changed = elevate(SERVICE, APP, { roots, runJsServicePath: RUN_JS });
    assert.equal(changed, false);
    assert.ok(!nodeFs.existsSync(path.join(roots.nonDev, 'client-permissions.d', `${SERVICE}.root.json`)));
  });

  it('refuses to patch a JS service when the launcher is missing', () => {
    const svc = 'com.example.js.service';
    const file = path.join(roots.dev, 'services.d', `${svc}.service`);
    write(file, 'Exec=/usr/bin/run-js-service -n /x\n');
    const changed = elevate(svc, 'com.example.js', { roots, runJsServicePath: path.join(base, 'nope', 'run-js-service') });
    assert.equal(read(file), 'Exec=/usr/bin/run-js-service -n /x\n');
    // permission files are still created for the service, so a change is reported
    assert.equal(typeof changed, 'boolean');
  });

  it('does not touch an unrelated service', () => {
    const other = 'com.example.other.service';
    const otherFile = path.join(roots.dev, 'services.d', `${other}.service`);
    write(otherFile, 'Exec=/usr/bin/run-js-service -n /x\n');
    elevate(SERVICE, APP, { roots, runJsServicePath: RUN_JS });
    assert.equal(read(otherFile), 'Exec=/usr/bin/run-js-service -n /x\n');
  });
});

describe('elevate() on a native service', () => {
  let base: string;
  before(() => {
    base = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'hbchannel-elevate-native-'));
  });
  after(() => {
    nodeFs.rmSync(base, { recursive: true, force: true });
  });

  it('strips the jailer and leaves JS-only files alone', () => {
    const roots = mkroots(base);
    const RUN_JS = mkLauncher(base);
    const svc = 'com.example.native.service';
    const file = path.join(roots.nonDev, 'services.d', `${svc}.service`);
    write(
      file,
      `Exec=/usr/bin/jailer -t native_devmode -i ${svc} -p /media/developer/apps/usr/palm/services/${svc} /media/developer/apps/usr/palm/services/${svc}/native-bin\n`,
    );
    const changed = elevate(svc, 'com.example.native', { roots, runJsServicePath: RUN_JS });
    assert.equal(changed, true);
    assert.equal(read(file), `Exec=/media/developer/apps/usr/palm/services/${svc}/native-bin\n`);
    assert.equal(elevate(svc, 'com.example.native', { roots, runJsServicePath: RUN_JS }), false);
  });
});

describe('elevate() on a legacy (webOS <3) layout', () => {
  let base: string;
  before(() => {
    base = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'hbchannel-elevate-legacy-'));
  });
  after(() => {
    nodeFs.rmSync(base, { recursive: true, force: true });
  });

  it('patches pub/prv service and role files', () => {
    const roots = mkroots(base);
    const RUN_JS = mkLauncher(base);
    const pubSvc = path.join(roots.legacyDev, 'services', 'pub', `${SERVICE}.service`);
    const prvSvc = path.join(roots.legacyDev, 'services', 'prv', `${SERVICE}.service`);
    const pubRole = path.join(roots.legacyDev, 'roles', 'pub', `${SERVICE}.json`);
    const prvRole = path.join(roots.legacyDev, 'roles', 'prv', `${SERVICE}.json`);
    for (const f of [pubSvc, prvSvc])
      write(f, `[D-BUS Service]\nName=${SERVICE}\nExec=/usr/bin/run-js-service -n /media/cryptofs/apps/usr/palm/services/${SERVICE}\n`);
    const legacyRole = {
      role: { exeName: '/usr/bin/run-js-service', type: 'regular', allowedNames: [SERVICE] },
      permissions: [{ service: SERVICE, inbound: ['*'], outbound: ['*'] }],
    };
    for (const f of [pubRole, prvRole]) write(f, JSON.stringify(legacyRole));

    const changed = elevate(SERVICE, APP, { roots, runJsServicePath: RUN_JS });
    assert.equal(changed, true);
    for (const f of [pubSvc, prvSvc]) assert.ok(read(f).includes(`Exec=${RUN_JS} -n `), f);
    for (const f of [pubRole, prvRole]) assert.ok(readJson(f).role.allowedNames.includes('*'), f);

    assert.equal(elevate(SERVICE, APP, { roots, runJsServicePath: RUN_JS }), false);
  });

  it('finds a legacy service and still creates 3.x+ permission files when that root exists', () => {
    const roots = mkroots(base);
    const RUN_JS = mkLauncher(base);
    // legacy dev already set up by the previous test; add a modern dev root with permission dirs but no service file
    const clientPermDir = path.join(roots.dev, 'client-permissions.d');
    const apiPermDir = path.join(roots.dev, 'api-permissions.d');
    nodeFs.mkdirSync(clientPermDir, { recursive: true });
    nodeFs.mkdirSync(apiPermDir, { recursive: true });
    const changed = elevate(SERVICE, APP, { roots, runJsServicePath: RUN_JS });
    assert.equal(changed, true);
    assert.ok(nodeFs.existsSync(path.join(clientPermDir, `${SERVICE}.root.json`)));
    assert.ok(nodeFs.existsSync(path.join(apiPermDir, `${SERVICE}.api.public.json`)));
  });
});
