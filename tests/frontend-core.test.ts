import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* eslint-disable import/extensions */
import * as contract from '../frontend/core/service-contract.js';
import * as manifest from '../frontend/core/manifest.js';
import * as repository from '../frontend/core/repository.js';
/* eslint-enable import/extensions */

describe('service-contract: payloads', () => {
  const pkg = { id: 'com.example.app', ipkUrl: 'com.example.app_1.0.0_all.ipk', ipkHash: { sha256: 'A'.repeat(64) } };

  it('buildInstallPayload resolves a relative ipkUrl against the manifest URL', () => {
    const payload = contract.buildInstallPayload(
      pkg,
      'https://repo.example/apps/com.example.app.manifest.json',
      'https://repo.example/apps.json',
    );
    assert.deepEqual(payload, {
      ipkUrl: 'https://repo.example/apps/com.example.app_1.0.0_all.ipk',
      ipkHash: 'a'.repeat(64),
      id: 'com.example.app',
      subscribe: true,
    });
  });

  it('buildInstallPayload falls back to the repository URL for inlined manifests', () => {
    const payload = contract.buildInstallPayload(pkg, undefined, 'https://repo.example/apps.json');
    assert.equal(payload.ipkUrl, 'https://repo.example/com.example.app_1.0.0_all.ipk');
  });

  it('buildInstallPayload keeps absolute ipkUrls and omits an empty id', () => {
    const payload = contract.buildInstallPayload(
      { ipkUrl: 'https://cdn.example/x.ipk', ipkHash: { sha256: 'b'.repeat(64) } },
      'https://repo.example/m.json',
    );
    assert.equal(payload.ipkUrl, 'https://cdn.example/x.ipk');
    assert.equal('id' in payload, false);
  });

  it('buildInstallPayload refuses manifests the service would reject', () => {
    assert.throws(() => contract.buildInstallPayload(null, 'u'), /missing/);
    assert.throws(() => contract.buildInstallPayload({ ipkHash: { sha256: 'a'.repeat(64) } }, 'u'), /ipkUrl/);
    assert.throws(() => contract.buildInstallPayload({ ipkUrl: 'x.ipk' }, 'u'), /sha256/);
    assert.throws(() => contract.buildInstallPayload({ ipkUrl: 'x.ipk', ipkHash: { sha256: 'short' } }, 'u'), /sha256/);
    assert.throws(() => contract.buildInstallPayload({ ipkUrl: 'x.ipk', ipkHash: { md5: 'x' } }, 'u'), /sha256/);
  });

  it('uninstall / getAppInfo payloads carry the id and reject empties', () => {
    assert.deepEqual(contract.buildUninstallPayload('com.example.app'), { id: 'com.example.app' });
    assert.deepEqual(contract.buildGetAppInfoPayload('com.example.app'), { id: 'com.example.app' });
    assert.throws(() => contract.buildUninstallPayload(''), /missing/);
    assert.throws(() => contract.buildGetAppInfoPayload(undefined), /missing/);
  });

  it('setConfiguration payload inverts the telnet toggle and coerces booleans', () => {
    assert.deepEqual(
      contract.buildSetConfigurationPayload({ telnetEnabled: true, sshdEnabled: 1, blockUpdates: undefined, failsafe: false }),
      {
        telnetDisabled: false,
        sshdEnabled: true,
        blockUpdates: false,
        failsafe: false,
      },
    );
    assert.deepEqual(Object.keys(contract.buildSetConfigurationPayload({})).sort(), [...contract.FLAGS].sort());
  });

  it('reboot payload carries a reason', () => {
    assert.deepEqual(contract.buildRebootPayload(), { reason: 'SwDownload' });
  });
});

describe('service-contract: responses', () => {
  it('parseConfigurationResponse maps a root response to UI state', () => {
    assert.deepEqual(
      contract.parseConfigurationResponse({
        returnValue: true,
        root: true,
        telnetDisabled: true,
        sshdEnabled: true,
        blockUpdates: false,
        failsafe: false,
      }),
      {
        error: null,
        rootIsActive: true,
        rootStatusText: 'ok',
        telnetEnabled: false,
        sshdEnabled: true,
        blockUpdates: false,
        failsafe: false,
      },
    );
  });

  it('parseConfigurationResponse reports unelevated and errors', () => {
    assert.equal(contract.parseConfigurationResponse({ returnValue: true, root: false }).rootStatusText, 'unelevated');
    const err = contract.parseConfigurationResponse({ returnValue: false, errorText: 'Service does not exist' });
    assert.equal(err.error, 'Service does not exist');
    assert.equal(err.rootIsActive, false);
    assert.equal(err.rootStatusText, 'Service does not exist');
    assert.equal(contract.parseConfigurationResponse(undefined).error, 'invalid response');
  });

  it('classifyInstallResponse distinguishes every message kind', () => {
    assert.deepEqual(contract.classifyInstallResponse({ statusText: 'Downloading…' }), { type: 'status', text: 'Downloading…' });
    assert.deepEqual(contract.classifyInstallResponse({ statusText: 'Downloading…', progress: 42.5 }), {
      type: 'progress',
      percent: 42.5,
      text: 'Downloading…',
    });
    assert.equal(contract.classifyInstallResponse({ progress: 250 }).percent, 100);
    assert.deepEqual(contract.classifyInstallResponse({ returnValue: true, statusText: 'Finished.', finished: true }), {
      type: 'finished',
    });
    assert.deepEqual(contract.classifyInstallResponse({ returnValue: false, errorText: 'boom' }), { type: 'error', text: 'boom' });
    assert.deepEqual(contract.classifyInstallResponse({ returnValue: true }), { type: 'ignore' });
    assert.deepEqual(contract.classifyInstallResponse(null), { type: 'ignore' });
  });

  it('formatOperationError adds the restart hint only for the post-self-update failure', () => {
    assert.equal(contract.formatOperationError({ errorText: 'denied' }, 'installation'), 'An error occured during installation: denied');
    const hinted = contract.formatOperationError({ errorText: 'luna-send-pub: connect ECONNREFUSED' }, 'removal');
    assert.ok(hinted.indexOf(contract.RESTART_HINT) !== -1);
    assert.equal(contract.formatOperationError({}, 'installation'), 'An error occured during installation: unknown error');
  });

  it('parseAppInfoResponse returns the record or null', () => {
    assert.deepEqual(contract.parseAppInfoResponse({ returnValue: true, appId: 'x', appInfo: { id: 'x', version: '1' } }), {
      id: 'x',
      version: '1',
    });
    assert.equal(contract.parseAppInfoResponse({ returnValue: true, appId: 'x' }), null);
    assert.equal(contract.parseAppInfoResponse({ returnValue: false, errorText: 'nope' }), null);
    assert.equal(contract.parseAppInfoResponse(undefined), null);
  });
});

describe('manifest presentation logic', () => {
  it('rootRequiredText', () => {
    assert.equal(manifest.rootRequiredText(true), 'yes');
    assert.equal(manifest.rootRequiredText(false), 'no');
    assert.equal(manifest.rootRequiredText('optional'), 'optional');
    assert.equal(manifest.rootRequiredText(undefined), 'unknown');
  });

  it('versionText', () => {
    assert.equal(manifest.versionText('1.2.3', null), '1.2.3');
    assert.equal(manifest.versionText('1.2.3', { version: '1.2.3' }), '1.2.3');
    assert.equal(manifest.versionText('1.2.3', { version: '1.0.0' }), '1.2.3 (installed: 1.0.0)');
    assert.equal(manifest.versionText(undefined, { version: '1.0.0' }), 'unknown (installed: 1.0.0)');
  });

  it('installDisabled', () => {
    const ready = { ready: true, error: false, version: '2.0' };
    assert.equal(manifest.installDisabled(undefined, ready), true, 'app info not loaded yet');
    assert.equal(manifest.installDisabled(null, { ready: false, error: false }), true, 'manifest loading');
    assert.equal(manifest.installDisabled(null, { ready: true, error: true }), true, 'manifest failed');
    assert.equal(manifest.installDisabled(null, ready), false, 'not installed -> install');
    assert.equal(manifest.installDisabled({ version: '1.0' }, ready), false, 'older installed -> update');
    assert.equal(manifest.installDisabled({ version: '2.0' }, ready), true, 'same version');
  });

  it('button labels and self-protection', () => {
    assert.equal(manifest.installButtonLabel(null), 'Install');
    assert.equal(manifest.installButtonLabel({ version: '1' }), 'Update');
    assert.equal(manifest.canLaunch({ version: '1' }, 'com.example.app'), true);
    assert.equal(manifest.canLaunch(null, 'com.example.app'), false);
    assert.equal(manifest.canLaunch({ version: '1' }, manifest.HOMEBREW_CHANNEL_ID), false);
    assert.equal(manifest.canUninstall({ version: '1' }, manifest.HOMEBREW_CHANNEL_ID), false);
  });

  it('projectPageEnabled (regression: used to be always false)', () => {
    assert.equal(manifest.projectPageEnabled('https://example.com'), true);
    assert.equal(manifest.projectPageEnabled('   '), false);
    assert.equal(manifest.projectPageEnabled(undefined), false);
  });

  it('renderDescription uses the sanitizer when supported and escapes otherwise', () => {
    const calls: string[] = [];
    const supported = {
      isSupported: true,
      sanitize: (html: string, cfg?: object) => {
        calls.push(JSON.stringify(cfg));
        return html.replace(/<script>.*?<\/script>/g, '');
      },
    };
    assert.equal(manifest.renderDescription(supported, '<p>hi</p><script>x</script>'), '<div class="rich-description"><p>hi</p></div>');
    assert.deepEqual(calls, [JSON.stringify(manifest.DESCRIPTION_SANITIZE_CONFIG)]);

    // DOMPurify on an engine it does not support returns input unchanged - we must not trust it then.
    const unsupported = { isSupported: false, sanitize: (html: string) => html };
    const out = manifest.renderDescription(unsupported, '<img src=x onerror=alert(1)>');
    assert.equal(out, '<div class="rich-description"><p>&lt;img src=x onerror=alert(1)&gt;</p></div>');
    assert.doesNotMatch(out, /<img/);

    assert.equal(
      manifest.renderDescription(undefined as unknown as typeof unsupported, '<b>x</b>'),
      '<div class="rich-description"><p>&lt;b&gt;x&lt;/b&gt;</p></div>',
    );
  });

  it('escapeHtml covers the five characters', () => {
    assert.equal(manifest.escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('subtitle and descriptions', () => {
    assert.equal(manifest.subtitleText('com.x', true, 'https://r'), 'com.x');
    assert.equal(manifest.subtitleText('com.x', false, 'https://r'), 'com.x (from https://r)');
    assert.equal(manifest.fallbackDescription(''), manifest.NO_DESCRIPTION_HTML);
    assert.equal(manifest.fallbackDescription('<p>hi</p>'), '<p>hi</p>');
    assert.equal(manifest.fullDescription(undefined), manifest.NO_DESCRIPTION_HTML);
    assert.equal(manifest.wrapDescription('<p>x</p>'), '<div class="rich-description"><p>x</p></div>');
  });
});

describe('repository configuration and feeds', () => {
  it('readConfig defaults on missing or malformed storage', () => {
    assert.deepEqual(repository.readConfig({}), repository.defaultConfig());
    assert.deepEqual(repository.readConfig({ repositoriesConfig: '{not json' }), repository.defaultConfig());
    assert.deepEqual(repository.readConfig({ repositoriesConfig: '"a string"' }), repository.defaultConfig());
    assert.deepEqual(repository.readConfig(undefined), repository.defaultConfig());
  });

  it('readConfig keeps only well-formed repositories and boolean flags', () => {
    const cfg = repository.readConfig({
      repositoriesConfig: JSON.stringify({
        repositories: [{ url: 'https://a' }, { nope: 1 }, 'x', { url: '' }],
        disableDefault: 'yes',
        enableNonfree: true,
      }),
    });
    assert.deepEqual(cfg, { repositories: [{ url: 'https://a' }], disableDefault: false, enableNonfree: true });
  });

  it('writeConfig / readConfig round-trip through a storage object', () => {
    const storage: Record<string, string> = {};
    repository.writeConfig(storage, { repositories: [{ url: 'https://a', extra: 'dropped' }], disableDefault: true, enableNonfree: false });
    assert.deepEqual(JSON.parse(storage[repository.CONFIG_STORAGE_KEY] as string), {
      repositories: [{ url: 'https://a' }],
      disableDefault: true,
      enableNonfree: false,
    });
    assert.deepEqual(repository.readConfig(storage), { repositories: [{ url: 'https://a' }], disableDefault: true, enableNonfree: false });
  });

  it('repositoryUrls orders extra repos first, then default and non-free', () => {
    assert.deepEqual(repository.repositoryUrls(repository.defaultConfig()), [repository.DEFAULT_REPOSITORY_URL]);
    assert.deepEqual(repository.repositoryUrls({ repositories: [{ url: 'https://a' }], disableDefault: false, enableNonfree: true }), [
      'https://a',
      repository.DEFAULT_REPOSITORY_URL,
      repository.NONFREE_REPOSITORY_URL,
    ]);
    assert.deepEqual(repository.repositoryUrls({ repositories: [], disableDefault: true, enableNonfree: false }), []);
  });

  it('parseRepositoryFeed tags packages and drops malformed entries', () => {
    const url = repository.DEFAULT_REPOSITORY_URL;
    const parsed = repository.parseRepositoryFeed(
      { packages: [{ id: 'com.a', title: 'A' }, { title: 'no id' }, null, { id: 'com.b' }] },
      url,
    );
    assert.ok(parsed);
    assert.deepEqual(
      parsed.map((p): unknown[] => [p.id, p.uid, p.repository, p.official]),
      [
        ['com.a', `com.a|${url}`, url, true],
        ['com.b', `com.b|${url}`, url, true],
      ],
    );
    const third = repository.parseRepositoryFeed({ packages: [{ id: 'com.c' }] }, 'https://third.example/apps.json');
    assert.equal(third?.[0]?.official, false);
  });

  it('parseRepositoryFeed returns null for non-feeds', () => {
    assert.equal(repository.parseRepositoryFeed(null, 'u'), null);
    assert.equal(repository.parseRepositoryFeed('<html>', 'u'), null);
    assert.equal(repository.parseRepositoryFeed({ packages: 'nope' }, 'u'), null);
    assert.equal(repository.parseRepositoryFeed({}, 'u'), null);
  });

  it('invalid-feed marker round-trips', () => {
    assert.equal(repository.isInvalidFeedResult(repository.invalidFeedMarker()), true);
    assert.equal(repository.isInvalidFeedResult([{ repository: 'https://a' }]), false);
    assert.equal(repository.isInvalidFeedResult([]), false);
  });

  it('failedFeedsSummary lists only failed feeds', () => {
    assert.equal(
      repository.failedFeedsSummary([{ url: 'https://a' }, { url: 'https://b', errorCode: '404' }, { url: 'https://c', errorCode: '600' }]),
      'https://b (404), https://c (600)',
    );
    assert.equal(repository.failedFeedsSummary([]), '');
  });
});
