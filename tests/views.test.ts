/*
 * The Enyo views, running for real inside jsdom.
 *
 * These tests instantiate the actual kinds from frontend/views, let Enyo
 * render them, and drive them the way the TV does: Luna responses arrive
 * through a fake PalmServiceBridge (so webOS.js, ServiceRequest and
 * LunaService all run), repository feeds and manifests are fetched from a
 * local HTTP server through Enyo's Ajax, and user actions are Enyo events.
 * What they check is the wiring: that a toggle really calls the right
 * handler, that a response really lands in the right binding, that a tap
 * really sends the right payload.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createEnyoEnv } from './helpers/enyo-env';
import type { EnyoEnv } from './helpers/enyo-env';
import { serveDir } from './helpers/env';

// eslint-disable-next-line import/extensions
import * as contract from '../frontend/core/service-contract.js';

const HBC = contract.SERVICE_URI;
const APP_MANAGER = 'luna://com.webos.applicationManager';

let env: EnyoEnv;
let www: string;
let server: { url: string; close: () => void };

before(async () => {
  env = createEnyoEnv();
  www = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'hbchannel-www-'));
  server = await serveDir(www);
});
after(() => {
  env.destroyAll();
  server.close();
  nodeFs.rmSync(www, { recursive: true, force: true });
});

function serveJson(name: string, data: unknown): string {
  nodeFs.writeFileSync(path.join(www, name), JSON.stringify(data));
  return `${server.url}/${name}`;
}

function serveText(name: string, text: string): string {
  nodeFs.writeFileSync(path.join(www, name), text);
  return `${server.url}/${name}`;
}

/** A kind that hosts a panel and records onRequestPushPanel events. */
function host(childKind: any, childProps: Record<string, any> = {}): { host: any; child: any; pushed: Record<string, any>[] } {
  const kind = env.load('enyo/kind');
  const Control = env.load('enyo/Control');
  const pushed: Record<string, any>[] = [];
  const Host = kind({
    kind: Control,
    components: [{ kind: childKind, name: 'child', onRequestPushPanel: 'pushed', ...childProps }],
    pushed(_sender: unknown, ev: Record<string, any>) {
      pushed.push(ev['panel'] as Record<string, any>);
      return true;
    },
  });
  const instance = env.render(Host);
  return { host: instance, child: instance.$.child, pushed };
}

describe('SettingsPanel', () => {
  it('requests the configuration on creation and shows the app version', () => {
    env.bus.reset();
    const Settings = env.load('./views/SettingsPanel.js');
    const panel = env.render(Settings);
    const call = env.bus.last(HBC, 'getConfiguration');
    assert.deepEqual(call.parameters, {});
    assert.equal(panel.$.version.get('text'), env.appInfo['version']);
    assert.equal(panel.$.rootStatus.get('text'), 'pending...');
    assert.equal(panel.$.sshd.get('disabled'), true, 'toggles disabled until root status is known');
    panel.destroy();
  });

  it('maps the configuration response onto the toggles (telnet inverted) and enables them when root', async () => {
    env.bus.reset();
    const Settings = env.load('./views/SettingsPanel.js');
    const panel = env.render(Settings);
    env.bus
      .last(HBC, 'getConfiguration')
      .succeed({ returnValue: true, root: true, telnetDisabled: true, sshdEnabled: true, blockUpdates: false, failsafe: true });
    await env.flush();
    assert.equal(panel.$.rootStatus.get('text'), 'ok');
    assert.equal(panel.$.telnet.get('checked'), false);
    assert.equal(panel.$.sshd.get('checked'), true);
    assert.equal(panel.$.blockUpdates.get('checked'), false);
    assert.equal(panel.$.failsafe.get('checked'), true);
    for (const name of ['telnet', 'sshd', 'blockUpdates', 'failsafe']) {
      assert.equal(panel.$[name].get('disabled'), false, `${name} enabled`);
    }
    panel.destroy();
  });

  it('shows the error and keeps toggles disabled when the service is unreachable', async () => {
    env.bus.reset();
    const Settings = env.load('./views/SettingsPanel.js');
    const panel = env.render(Settings);
    env.bus
      .last(HBC, 'getConfiguration')
      .fail({ returnValue: false, errorCode: -1, errorText: 'Service does not exist: org.webosbrew.hbchannel.service.' });
    await env.flush();
    assert.equal(panel.$.rootStatus.get('text'), 'Service does not exist: org.webosbrew.hbchannel.service.');
    assert.equal(panel.$.sshd.get('disabled'), true);
    panel.destroy();
  });

  it('shows "unelevated" and disables the reboot item when not root', async () => {
    env.bus.reset();
    const Settings = env.load('./views/SettingsPanel.js');
    const panel = env.render(Settings);
    env.bus
      .last(HBC, 'getConfiguration')
      .succeed({ returnValue: true, root: false, telnetDisabled: false, sshdEnabled: false, blockUpdates: false, failsafe: false });
    await env.flush();
    assert.equal(panel.$.rootStatus.get('text'), 'unelevated');
    assert.equal(panel.$.rebootItem.get('disabled'), true, 'System reboot item must be disabled for an unelevated service');
    panel.destroy();
  });

  it('each toggle sends setConfiguration with the full flag set', async () => {
    env.bus.reset();
    const Settings = env.load('./views/SettingsPanel.js');
    const panel = env.render(Settings);
    env.bus
      .last(HBC, 'getConfiguration')
      .succeed({ returnValue: true, root: true, telnetDisabled: false, sshdEnabled: false, blockUpdates: false, failsafe: false });
    await env.flush();

    panel.$.sshd.set('checked', true);
    env.fire(panel.$.sshd, 'onchange');
    assert.deepEqual(env.bus.last(HBC, 'setConfiguration').parameters, {
      telnetDisabled: false,
      sshdEnabled: true,
      blockUpdates: false,
      failsafe: false,
    });

    panel.$.telnet.set('checked', false);
    env.fire(panel.$.telnet, 'onchange');
    assert.deepEqual(env.bus.last(HBC, 'setConfiguration').parameters, {
      telnetDisabled: true,
      sshdEnabled: true,
      blockUpdates: false,
      failsafe: false,
    });

    panel.$.blockUpdates.set('checked', true);
    env.fire(panel.$.blockUpdates, 'onchange');
    panel.$.failsafe.set('checked', true);
    env.fire(panel.$.failsafe, 'onchange');
    assert.deepEqual(env.bus.last(HBC, 'setConfiguration').parameters, {
      telnetDisabled: true,
      sshdEnabled: true,
      blockUpdates: true,
      failsafe: true,
    });
    assert.equal(env.bus.callsTo(HBC, 'setConfiguration').length, 4);
    assert.equal(panel.rebootRequired, true);
    panel.destroy();
  });

  it('surfaces a setConfiguration failure in the popup', async () => {
    env.bus.reset();
    const Settings = env.load('./views/SettingsPanel.js');
    const panel = env.render(Settings);
    env.bus.last(HBC, 'getConfiguration').succeed({ returnValue: true, root: true });
    await env.flush();
    panel.$.sshd.set('checked', true);
    env.fire(panel.$.sshd, 'onchange');
    env.bus.last(HBC, 'setConfiguration').fail({ returnValue: false, errorText: 'EROFS: read-only file system' });
    await env.flush();
    assert.equal(panel.$.errorPopup.get('showing'), true);
    assert.match(panel.$.errorPopup.get('content'), /EROFS: read-only file system/);
    panel.destroy();
  });

  it('the System reboot item sends reboot and shows a blocking popup', async () => {
    env.bus.reset();
    const Settings = env.load('./views/SettingsPanel.js');
    const panel = env.render(Settings);
    env.bus.last(HBC, 'getConfiguration').succeed({ returnValue: true, root: true });
    await env.flush();
    assert.equal(panel.$.rebootItem.get('disabled'), false);
    env.fire(panel.$.rebootItem, 'ontap');
    assert.deepEqual(env.bus.last(HBC, 'reboot').parameters, contract.buildRebootPayload());
    assert.equal(panel.$.errorPopup.get('showing'), true);
    assert.equal(panel.$.errorPopup.get('content'), 'Rebooting...');
    assert.equal(panel.$.errorPopup.get('allowBackKey'), false);
    panel.destroy();
  });

  it('repository toggles and the add/remove flow persist to localStorage', () => {
    env.window.localStorage.clear();
    const Settings = env.load('./views/SettingsPanel.js');
    const repository = env.load('./core/repository.js');
    const panel = env.render(Settings);

    // ToggleItem flips `checked` itself on tap, then the panel's ontap handler saves.
    assert.equal(panel.$.enableNonfree.get('checked'), false);
    env.fire(panel.$.enableNonfree, 'ontap');
    assert.equal(panel.$.enableNonfree.get('checked'), true);
    assert.deepEqual(repository.readConfig(env.window.localStorage), { repositories: [], disableDefault: false, enableNonfree: true });

    assert.equal(panel.$.enableDefault.get('checked'), true);
    env.fire(panel.$.enableDefault, 'ontap');
    assert.equal(repository.readConfig(env.window.localStorage).disableDefault, true);

    // add via the dialog
    panel.showRepoAddDialog();
    panel.$.repoAddDialog.$.message.$.repositoryDialogURL.set('value', 'https://third.example/apps.json');
    panel.addRepositorySubmit();
    assert.deepEqual(repository.readConfig(env.window.localStorage).repositories, [{ url: 'https://third.example/apps.json' }]);
    assert.equal(panel.$.repoAddDialog.get('showing'), false);

    // remove by tapping the entry
    const model = panel.extraRepositories.at(0);
    panel.repoClicked(null, { model });
    assert.deepEqual(repository.readConfig(env.window.localStorage).repositories, []);
    panel.destroy();
  });

  it('opens the add-repository dialog pre-filled when launched with addRepository params', () => {
    const Settings = env.load('./views/SettingsPanel.js');
    const panel = env.render(Settings, { templateAddRepository: 'https://launch.example/apps.json' });
    panel.transitionFinished({ isOffscreen: false });
    assert.equal(panel.$.repoAddDialog.get('showing'), true);
    assert.equal(panel.$.repoAddDialog.$.message.$.repositoryDialogURL.get('value'), 'https://launch.example/apps.json');
    panel.destroy();
  });
});

describe('BrowserPanel', () => {
  it('calls updateStartupScript and autostart on creation', () => {
    env.bus.reset();
    env.window.localStorage.clear();
    const Browser = env.load('./views/BrowserPanel.js');
    const { host: h } = host(Browser);
    assert.deepEqual(env.bus.last(HBC, 'updateStartupScript').parameters, {});
    assert.deepEqual(env.bus.last(HBC, 'autostart').parameters, {});
    h.destroy();
  });

  it('loads the configured repositories and lists their packages', async () => {
    const repository = env.load('./core/repository.js');
    const feedUrl = serveJson('apps.json', {
      packages: [
        { id: 'com.a', title: 'A', iconUri: 'a.png', manifestUrl: 'a.manifest.json' },
        { id: 'com.b', title: 'B', iconUri: 'b.png', manifestUrl: 'b.manifest.json' },
      ],
    });
    repository.writeConfig(env.window.localStorage, { repositories: [{ url: feedUrl }], disableDefault: true, enableNonfree: false });

    const Browser = env.load('./views/BrowserPanel.js');
    const { host: h, child: panel } = host(Browser);
    await env.waitFor(() => panel.repository && panel.repository.length === 2, 'repository to load');
    assert.deepEqual(
      panel.repository.models.map((m: any) => [m.get('id'), m.get('uid'), m.get('repository'), m.get('official')]),
      [
        ['com.a', `com.a|${feedUrl}`, feedUrl, false],
        ['com.b', `com.b|${feedUrl}`, feedUrl, false],
      ],
    );
    assert.equal(panel.$.errorPopup.get('showing'), false);
    assert.equal(panel.$.appList.get('collection'), panel.repository, 'list bound to the repository collection');
    h.destroy();
  });

  it('reports a repository that is not a feed, and one that 404s, without losing the good one', async () => {
    const repository = env.load('./core/repository.js');
    const good = serveJson('good.json', { packages: [{ id: 'com.good', title: 'Good' }] });
    const bad = serveText('bad.json', '<html>not a feed</html>');
    const missing = `${server.url}/missing.json`;
    repository.writeConfig(env.window.localStorage, {
      repositories: [{ url: good }, { url: bad }, { url: missing }],
      disableDefault: true,
      enableNonfree: false,
    });

    const Browser = env.load('./views/BrowserPanel.js');
    const { host: h, child: panel } = host(Browser);
    await env.waitFor(() => panel.failedFeeds.length === 2 && panel.repository.length === 1, 'both failures and the good feed');
    assert.equal(panel.$.errorPopup.get('showing'), true);
    const content: string = panel.$.errorPopup.get('content');
    assert.match(content, new RegExp(`${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(600\\)`));
    assert.match(content, new RegExp(`${missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(404\\)`));
    assert.doesNotMatch(content, /good\.json/);
    h.destroy();
  });

  it('selecting an app pushes a DetailsPanel for that model and repository', async () => {
    const repository = env.load('./core/repository.js');
    const feedUrl = serveJson('one.json', { packages: [{ id: 'com.one', title: 'One', manifestUrl: 'one.manifest.json' }] });
    repository.writeConfig(env.window.localStorage, { repositories: [{ url: feedUrl }], disableDefault: true, enableNonfree: false });
    const Browser = env.load('./views/BrowserPanel.js');
    const Details = env.load('./views/DetailsPanel.js');
    const { host: h, child: panel, pushed } = host(Browser);
    await env.waitFor(() => panel.repository && panel.repository.length === 1, 'repository to load');

    panel.itemSelected(panel.$.appList, { model: panel.repository.at(0) });
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0]?.['kind'], Details);
    assert.equal(pushed[0]?.['model'], panel.repository.at(0));
    assert.equal(pushed[0]?.['repositoryURL'], feedUrl);
    h.destroy();
  });

  it('the gear button pushes the SettingsPanel', () => {
    const Browser = env.load('./views/BrowserPanel.js');
    const Settings = env.load('./views/SettingsPanel.js');
    const { host: h, child: panel, pushed } = host(Browser);
    panel.openSettings();
    assert.equal(pushed[0]?.['kind'], Settings);
    h.destroy();
  });
});

describe('DetailsPanel', () => {
  const Model = () => env.load('enyo/Model');
  const repoUrl = () => `${server.url}/apps.json`;

  function manifestFor(id: string, extra: Record<string, any> = {}): { url: string; data: Record<string, any> } {
    const data = {
      id,
      version: '2.0.0',
      title: `${id} title`,
      ipkUrl: `${id}_2.0.0_all.ipk`,
      ipkHash: { sha256: 'ab'.repeat(32) },
      sourceUrl: 'https://github.com/example/app',
      rootRequired: 'optional',
      ...extra,
    };
    return { url: serveJson(`${id}.manifest.json`, data), data };
  }

  function details(id: string, manifestUrl: string, modelExtra: Record<string, any> = {}): any {
    const Details = env.load('./views/DetailsPanel.js');
    const model = new (Model())({ id, title: id, iconUri: 'x.png', manifestUrl, repository: repoUrl(), official: false, ...modelExtra });
    const panel = env.render(Details, { model, repositoryURL: repoUrl() });
    panel.transitionFinished({ isOffscreen: false });
    return panel;
  }

  it('loads the manifest, asks for app info and renders the package details', async () => {
    env.bus.reset();
    const { url, data } = manifestFor('com.example.details');
    const panel = details('com.example.details', url);
    await env.waitFor(() => panel.packageInfo && panel.packageInfo.isReady(), 'manifest');
    assert.deepEqual(env.bus.last(HBC, 'getAppInfo').parameters, { id: 'com.example.details' });

    env.bus.last(HBC, 'getAppInfo').succeed({ returnValue: true, appId: 'com.example.details' }); // not installed
    await env.flush();

    assert.equal(panel.get('title'), data['title']);
    assert.equal(panel.get('titleBelow'), `com.example.details (from ${repoUrl()})`);
    assert.equal(panel.$.version.get('text'), '2.0.0');
    assert.equal(panel.$.rootRequired.get('text'), 'optional');
    assert.equal(panel.$.projectPage.get('disabled'), false, 'project page enabled when sourceUrl present (regression)');
    assert.equal(panel.$.installButton.get('content'), 'Install');
    assert.equal(panel.$.installButton.get('disabled'), false);
    assert.equal(panel.$.launchButton.get('disabled'), true);
    assert.equal(panel.$.uninstallButton.get('disabled'), true);
    panel.destroy();
  });

  it('shows Update / Launch / Uninstall for an installed older version, and Install disabled when current', async () => {
    env.bus.reset();
    const { url } = manifestFor('com.example.installed');
    const panel = details('com.example.installed', url);
    await env.waitFor(() => panel.packageInfo && panel.packageInfo.isReady(), 'manifest');
    env.bus.last(HBC, 'getAppInfo').succeed({
      returnValue: true,
      appId: 'com.example.installed',
      appInfo: { id: 'com.example.installed', version: '1.0.0', title: 'Installed' },
    });
    await env.flush();
    assert.equal(panel.$.version.get('text'), '2.0.0 (installed: 1.0.0)');
    assert.equal(panel.$.installButton.get('content'), 'Update');
    assert.equal(panel.$.installButton.get('disabled'), false);
    assert.equal(panel.$.launchButton.get('disabled'), false);
    assert.equal(panel.$.uninstallButton.get('disabled'), false);

    panel.set('appInfo', { id: 'com.example.installed', version: '2.0.0' });
    assert.equal(panel.$.installButton.get('disabled'), true, 'same version installed');
    assert.equal(panel.$.version.get('text'), '2.0.0');
    panel.destroy();
  });

  it('never offers to launch or uninstall Homebrew Channel itself', async () => {
    env.bus.reset();
    const { url } = manifestFor('org.webosbrew.hbchannel');
    const panel = details('org.webosbrew.hbchannel', url);
    await env.waitFor(() => panel.packageInfo && panel.packageInfo.isReady(), 'manifest');
    env.bus.last(HBC, 'getAppInfo').succeed({ returnValue: true, appInfo: { id: 'org.webosbrew.hbchannel', version: '0.1.0' } });
    await env.flush();
    assert.equal(panel.$.installButton.get('disabled'), false);
    assert.equal(panel.$.launchButton.get('disabled'), true);
    assert.equal(panel.$.uninstallButton.get('disabled'), true);
    panel.destroy();
  });

  it('Install sends the contract payload, tracks progress, and refreshes app info when finished', async () => {
    env.bus.reset();
    const { url, data } = manifestFor('com.example.install');
    const panel = details('com.example.install', url);
    await env.waitFor(() => panel.packageInfo && panel.packageInfo.isReady(), 'manifest');
    env.bus.last(HBC, 'getAppInfo').succeed({ returnValue: true });
    await env.flush();

    env.fire(panel.$.installButton, 'ontap');
    const install = env.bus.last(HBC, 'install');
    assert.deepEqual(install.parameters, contract.buildInstallPayload(data, url, repoUrl()));
    assert.equal(install.parameters.ipkUrl, `${server.url}/com.example.install_2.0.0_all.ipk`);
    assert.equal(install.subscribe, true);
    assert.equal(panel.$.installButton.get('disabled'), true);

    install.succeed({ statusText: 'Downloading…' });
    install.succeed({ statusText: 'Downloading…', progress: 40 });
    await env.flush();
    assert.ok(panel.$.installButton.get('progress') > 0, 'progress bar moved');
    assert.equal(panel.$.installButton.$.progressAnimator.isAnimating(), true, 'still animating towards 40%');

    // `finished` arrives mid-animation (as on a real download); the bar must end at 100.
    const appInfoCallsBefore = env.bus.callsTo(HBC, 'getAppInfo').length;
    install.succeed({ returnValue: true, statusText: 'Finished.', finished: true });
    await env.flush();
    await new Promise((resolve) => setTimeout(resolve, 100)); // let any stray animation frame run
    assert.equal(panel.$.installButton.get('progress'), 100);
    assert.equal(panel.$.installButton.get('disabled'), false);
    assert.equal(install.cancelled, true, 'subscription cancelled after finishing');
    assert.equal(env.bus.callsTo(HBC, 'getAppInfo').length, appInfoCallsBefore + 1, 'app info re-requested');
    panel.destroy();
  });

  it('shows install errors in the popup, with the reboot hint after a self-update', async () => {
    env.bus.reset();
    const { url } = manifestFor('com.example.fail');
    const panel = details('com.example.fail', url);
    await env.waitFor(() => panel.packageInfo && panel.packageInfo.isReady(), 'manifest');
    env.bus.last(HBC, 'getAppInfo').succeed({ returnValue: true });
    await env.flush();

    env.fire(panel.$.installButton, 'ontap');
    env.bus.last(HBC, 'install').fail({ returnValue: false, errorText: 'Invalid file checksum (x expected, got y)' });
    await env.flush();
    assert.equal(panel.$.errorPopup.get('showing'), true);
    assert.match(panel.$.errorPopup.get('content'), /An error occured during installation: Invalid file checksum/);
    assert.equal(panel.$.installButton.get('disabled'), false);
    assert.equal(panel.$.installButton.get('progress'), 0);

    panel.$.errorPopup.hide();
    env.fire(panel.$.installButton, 'ontap');
    env.bus.last(HBC, 'install').fail({ returnValue: false, errorText: 'luna-send-pub: connect ECONNREFUSED' });
    await env.flush();
    assert.match(panel.$.errorPopup.get('content'), /perform a reboot/);
    panel.destroy();
  });

  it('Uninstall sends the id and refreshes app info; errors are shown', async () => {
    env.bus.reset();
    const { url } = manifestFor('com.example.remove');
    const panel = details('com.example.remove', url);
    await env.waitFor(() => panel.packageInfo && panel.packageInfo.isReady(), 'manifest');
    env.bus.last(HBC, 'getAppInfo').succeed({ returnValue: true, appInfo: { id: 'com.example.remove', version: '1.0.0' } });
    await env.flush();

    env.fire(panel.$.uninstallButton, 'ontap');
    const remove = env.bus.last(HBC, 'uninstall');
    assert.deepEqual(remove.parameters, { id: 'com.example.remove' });
    const appInfoCalls = env.bus.callsTo(HBC, 'getAppInfo').length;
    remove.succeed({ returnValue: true, statusText: 'Finished.' });
    await env.flush();
    assert.equal(env.bus.callsTo(HBC, 'getAppInfo').length, appInfoCalls + 1);

    env.fire(panel.$.uninstallButton, 'ontap');
    env.bus.last(HBC, 'uninstall').fail({ returnValue: false, errorText: 'app is running' });
    await env.flush();
    assert.match(panel.$.errorPopup.get('content'), /An error occured during removal: app is running/);
    panel.destroy();
  });

  it('Launch and the project page go through applicationManager', async () => {
    env.bus.reset();
    const { url, data } = manifestFor('com.example.launch');
    const panel = details('com.example.launch', url);
    await env.waitFor(() => panel.packageInfo && panel.packageInfo.isReady(), 'manifest');
    env.bus.last(HBC, 'getAppInfo').succeed({ returnValue: true, appInfo: { id: 'com.example.launch', version: '1.0.0' } });
    await env.flush();

    env.fire(panel.$.launchButton, 'ontap');
    assert.deepEqual(env.bus.last(APP_MANAGER, 'launch').parameters, { id: 'com.example.launch' });

    env.fire(panel.$.projectPage, 'ontap');
    assert.deepEqual(env.bus.last(APP_MANAGER, 'launch').parameters, {
      id: 'com.webos.app.browser',
      params: { target: data['sourceUrl'] },
    });
    panel.destroy();
  });

  it('renders the sanitized full description and opens its links in the browser', async () => {
    env.bus.reset();
    const descriptionUrl = serveText(
      'desc.html',
      '<h2>Hello</h2><p>See <a href="https://docs.example/page">the docs</a><script>alert(1)</script></p>',
    );
    const { url } = manifestFor('com.example.desc');
    const panel = details('com.example.desc', url, { fullDescriptionUrl: descriptionUrl });
    await env.waitFor(() => /the docs/.test(panel.$.appDescription.get('content')), 'description');
    const content: string = panel.$.appDescription.get('content');
    assert.match(content, /^<div class="rich-description">/);
    assert.doesNotMatch(content, /<script/);
    assert.match(content, /<a href="https:\/\/docs\.example\/page">the docs<\/a>/);

    const anchor = panel.$.appDescription.hasNode().querySelector('a') as HTMLAnchorElement;
    assert.ok(anchor);
    const click = env.click(anchor);
    assert.equal(click.defaultPrevented, true, 'navigation suppressed');
    assert.deepEqual(env.bus.last(APP_MANAGER, 'launch').parameters, {
      id: 'com.webos.app.browser',
      params: { target: 'https://docs.example/page' },
    });
    panel.destroy();
  });

  it('uses the short description when there is no full one, and reports manifest load failures', async () => {
    env.bus.reset();
    const Details = env.load('./views/DetailsPanel.js');
    const model = new (Model())({
      id: 'com.example.short',
      title: 'Short',
      manifestUrl: `${server.url}/nope.manifest.json`,
      repository: repoUrl(),
      shortDescription: '<p>short</p>',
    });
    const panel = env.render(Details, { model, repositoryURL: repoUrl() });
    panel.transitionFinished({ isOffscreen: false });
    assert.match(panel.$.appDescription.get('content'), /<p>short<\/p>/);
    await env.waitFor(() => panel.packageInfo && panel.packageInfo.isError(), 'manifest error');
    assert.equal(panel.$.errorPopup.get('showing'), true);
    assert.equal(panel.$.installButton.get('disabled'), true);
    panel.destroy();
  });
});

describe('MainView', () => {
  it('pushes a pre-filled SettingsPanel when launched in addRepository mode', async () => {
    const Main = env.load('./views/MainView.js');
    const Settings = env.load('./views/SettingsPanel.js');
    env.window.location.hash = `#${encodeURIComponent(JSON.stringify({ launchMode: 'addRepository', url: 'https://via-launch.example/apps.json' }))}`;
    const main = env.render(Main);
    await env.waitFor(() => main.$.panels.getPanels().length === 2, 'settings panel pushed');
    const settings = main.$.panels.getPanels()[1];
    assert.ok(settings instanceof Settings);
    assert.equal(settings.templateAddRepository, 'https://via-launch.example/apps.json');
    main.destroy();
    env.window.location.hash = '';
  });
});
