/*
 * Guards the DOMPurify build the frontend ships (frontend/vendor/purify.es5.js,
 * produced by tools/build-dompurify.js).
 *
 * Two things have to hold on the TV webviews, and both are checked here:
 *  - syntax: the bundle must be ES5 (enyo-dev's uglify-js 2 and old WebKit);
 *  - built-ins: DOMPurify needs Object.entries, Set, Array.from, ... which
 *    Chromium 38 (webOS 3.x) and older WebKits lack. Without Object.entries
 *    DOMPurify reports isSupported=false and RETURNS INPUT UNSANITIZED; without
 *    Set it does not load. The build bundles core-js polyfills for these, and
 *    the tests below load it in a realm with the ES2015 built-ins deleted to
 *    prove it still sanitizes there.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import * as acorn from 'acorn';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(__dirname, '..');
const output = path.join(repoRoot, 'frontend', 'vendor', 'purify.es5.js');

/** Built-ins a 2014-era TV webview may lack, as statements that remove them from a realm. */
const ES2015_BUILTINS = [
  'delete Object.entries',
  'delete Object.values',
  'delete Object.assign',
  'delete Object.fromEntries',
  'delete Object.getOwnPropertySymbols',
  'delete this.Set',
  'delete this.Map',
  'delete this.WeakMap',
  'delete this.WeakSet',
  'delete this.Symbol',
  'delete this.Promise',
  'delete this.Reflect',
  'delete this.Proxy',
  'delete Array.from',
  'delete Array.of',
  'delete Array.prototype.includes',
  'delete Array.prototype.find',
  'delete Array.prototype.findIndex',
  'delete Array.prototype.fill',
  'delete String.prototype.includes',
  'delete String.prototype.startsWith',
  'delete String.prototype.endsWith',
  'delete String.prototype.repeat',
  'delete Number.isInteger',
  'delete Number.isNaN',
];

interface Loaded {
  loadError?: string;
  isSupported?: boolean;
  sanitize?: (html: string, cfg?: object) => string;
}

function loadInRealm(source: string, strip: readonly string[]): Loaded {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const context = vm.createContext({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    module: { exports: {} as unknown },
    console,
  });
  for (const statement of strip) {
    vm.runInContext(statement, context);
  }
  try {
    vm.runInContext(`${source}\nmodule.exports`, context, { filename: 'purify.es5.js' });
  } catch (err) {
    return { loadError: err instanceof Error ? err.message : String(err) };
  }
  type Factory = (w: unknown) => { isSupported: boolean; sanitize: (h: string, c?: object) => unknown };
  const exported: unknown = (context as { module: { exports: unknown } }).module.exports;
  const factory = (typeof exported === 'function' ? exported : (exported as { default: unknown }).default) as Factory;
  const instance = factory(dom.window);
  return { isSupported: instance.isSupported, sanitize: (html, cfg) => String(instance.sanitize(html, cfg)) };
}

const XSS = '<img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><p>ok</p>';
const CLEAN = '<img src="x"><a>x</a><p>ok</p>';

describe('tools/build-dompurify.js', () => {
  let source: string;

  before(() => {
    execFileSync('node', [path.join(repoRoot, 'tools', 'build-dompurify.js')], { stdio: 'pipe', timeout: 180000 });
    source = nodeFs.readFileSync(output, 'utf8');
  });

  it('records the DOMPurify version it was built from', () => {
    const pkg = JSON.parse(nodeFs.readFileSync(path.join(repoRoot, 'node_modules', 'dompurify', 'package.json'), 'utf8')) as {
      version: string;
    };
    assert.match(source, new RegExp(`DOMPurify ${pkg.version.replace(/\./g, '\\.')} `));
  });

  it('parses as ECMAScript 5 (what uglify-js 2 and old WebKit accept)', () => {
    assert.doesNotThrow(() => acorn.parse(source, { ecmaVersion: 5, sourceType: 'script' }));
  });

  it('is self-contained: no require() of anything at runtime', () => {
    assert.doesNotMatch(source, /\brequire\(["'][^"']+["']\)/);
  });

  it('stays within a reasonable size budget for the TV app', () => {
    assert.ok(source.length < 400 * 1024, `vendor file is ${Math.round(source.length / 1024)} KiB`);
  });

  describe('on a modern engine', () => {
    it('loads, is supported, and sanitizes', () => {
      const loaded = loadInRealm(source, []);
      assert.equal(loaded.loadError, undefined);
      assert.equal(loaded.isSupported, true);
      assert.equal(loaded.sanitize?.(XSS), CLEAN);
    });
  });

  describe('on an engine without ES2015 built-ins (webOS 1.x-3.x webviews)', () => {
    it('without Object.entries it is STILL supported and sanitizes (regression: used to pass input through)', () => {
      const loaded = loadInRealm(source, ['delete Object.entries']);
      assert.equal(loaded.loadError, undefined);
      assert.equal(loaded.isSupported, true);
      assert.equal(loaded.sanitize?.(XSS), CLEAN);
    });

    it('without Set it still loads (regression: used to throw at load)', () => {
      const loaded = loadInRealm(source, ['delete this.Set']);
      assert.equal(loaded.loadError, undefined);
      assert.equal(loaded.sanitize?.(XSS), CLEAN);
    });

    it('with every ES2015 built-in removed it loads, is supported, and sanitizes', () => {
      const loaded = loadInRealm(source, ES2015_BUILTINS);
      assert.equal(loaded.loadError, undefined, loaded.loadError);
      assert.equal(loaded.isSupported, true);
      assert.equal(loaded.sanitize?.(XSS), CLEAN);
    });

    it('the unbundled DOMPurify would NOT have survived this (documents why the polyfills are bundled)', () => {
      const raw = nodeFs.readFileSync(require.resolve('dompurify', { paths: [repoRoot] }), 'utf8');
      // dist is ES2015+ syntax; a realm can still evaluate it on this Node.
      const loaded = loadInRealm(raw, ['delete Object.entries']);
      assert.equal(loaded.isSupported, false);
      assert.equal(loaded.sanitize?.(XSS), XSS, 'unsupported DOMPurify returns the input unchanged');
    });
  });

  describe('sanitization', () => {
    let sanitize: (html: string, cfg?: object) => string;
    before(() => {
      const loaded = loadInRealm(source, ES2015_BUILTINS);
      assert.ok(loaded.sanitize);
      sanitize = loaded.sanitize;
    });

    it('keeps the markup app descriptions rely on', () => {
      const input =
        '<h2>Title</h2><p>Some <b>bold</b> and <a href="https://example.com/x">a link</a></p><ul><li>one</li></ul><img src="https://example.com/i.png">';
      assert.equal(sanitize(input), input);
    });

    it('strips scripts, event handlers and javascript: URLs', () => {
      assert.equal(sanitize('<p>hi<script>alert(1)</script></p>'), '<p>hi</p>');
      assert.equal(sanitize('<img src=x onerror="alert(1)">'), '<img src="x">');
      assert.equal(sanitize('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
      assert.equal(sanitize('<iframe src="https://evil.example"></iframe>'), '');
    });

    it('honours FORBID_TAGS the way DetailsPanel uses it', () => {
      const cfg = { FORBID_TAGS: ['style', 'form', 'input', 'button'] };
      assert.equal(sanitize('<style>body{display:none}</style><p>ok</p>', cfg), '<p>ok</p>');
      // DOMPurify keeps the text of forbidden elements (KEEP_CONTENT), only the tags go.
      assert.equal(sanitize('<form><input value="x"><button>go</button></form><p>ok</p>', cfg), 'go<p>ok</p>');
    });

    it('is not fooled by the mXSS vectors fixed after 3.0.1', () => {
      const deep = `${'<div>'.repeat(600)}<img src=x onerror=alert(1)>${'</div>'.repeat(600)}`;
      assert.doesNotMatch(sanitize(deep), /onerror/);
      assert.doesNotMatch(sanitize('<svg><style><a id="</style><img src=x onerror=alert(1)>">'), /onerror/);
      assert.doesNotMatch(sanitize('<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'), /onerror/);
    });
  });
});
