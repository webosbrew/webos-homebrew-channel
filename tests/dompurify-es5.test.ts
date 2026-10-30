/*
 * Guards the reason DOMPurify used to be pinned at 3.0.1: the frontend bundle
 * must stay ES5 for uglify-js 2 (enyo-dev) and for the WebKit on webOS 1.x/2.x.
 * tools/build-dompurify.js transpiles the current release; these tests make
 * sure the result is genuinely ES5 and still does its job.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';

import * as acorn from 'acorn';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(__dirname, '..');
const output = path.join(repoRoot, 'frontend', 'vendor', 'purify.es5.js');

describe('tools/build-dompurify.js', () => {
  let source: string;

  before(() => {
    execFileSync('node', [path.join(repoRoot, 'tools', 'build-dompurify.js')], { stdio: 'pipe' });
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

  it('does not contain ES2015+ syntax that would slip past a loose parser', () => {
    assert.doesNotMatch(source, /=>/, 'arrow function');
    assert.doesNotMatch(source, /^\s*(const|let)\s/m, 'block-scoped declaration');
    assert.doesNotMatch(source, /\bclass\s+\w+\s*\{/, 'class declaration');
  });

  it('is a CommonJS module exporting a DOMPurify factory/instance', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const mod = { exports: {} as any };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function('module', 'exports', 'window', 'document', source);
    fn(mod, mod.exports, dom.window, dom.window.document);
    const purify = mod.exports.default ?? mod.exports;
    assert.equal(typeof purify, 'function');
    assert.equal(typeof purify(dom.window).sanitize, 'function');
    assert.ok(purify(dom.window).isSupported, 'jsdom should be supported');
  });

  describe('sanitization', () => {
    function makeSanitizer(): (html: string, cfg?: object) => string {
      const dom = new JSDOM('<!doctype html><html><body></body></html>');
      const mod = { exports: {} as any };
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function('module', 'exports', 'window', 'document', source)(mod, mod.exports, dom.window, dom.window.document);
      const purify = (mod.exports.default ?? mod.exports)(dom.window);
      return (html, cfg) => String(purify.sanitize(html, cfg));
    }

    it('keeps the markup app descriptions rely on', () => {
      const sanitize = makeSanitizer();
      const input =
        '<h2>Title</h2><p>Some <b>bold</b> and <a href="https://example.com/x">a link</a></p><ul><li>one</li></ul><img src="https://example.com/i.png">';
      assert.equal(sanitize(input), input);
    });

    it('strips scripts, event handlers and javascript: URLs', () => {
      const sanitize = makeSanitizer();
      assert.equal(sanitize('<p>hi<script>alert(1)</script></p>'), '<p>hi</p>');
      assert.equal(sanitize('<img src=x onerror="alert(1)">'), '<img src="x">');
      assert.equal(sanitize('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
      assert.equal(sanitize('<iframe src="https://evil.example"></iframe>'), '');
    });

    it('honours FORBID_TAGS the way DetailsPanel uses it', () => {
      const sanitize = makeSanitizer();
      const cfg = { FORBID_TAGS: ['style', 'form', 'input', 'button'] };
      assert.equal(sanitize('<style>body{display:none}</style><p>ok</p>', cfg), '<p>ok</p>');
      // DOMPurify keeps the text of forbidden elements (KEEP_CONTENT), only the tags go.
      assert.equal(sanitize('<form><input value="x"><button>go</button></form><p>ok</p>', cfg), 'go<p>ok</p>');
    });

    it('is not fooled by the mXSS vectors fixed after 3.0.1', () => {
      const sanitize = makeSanitizer();
      // CVE-2024-45801 / CVE-2024-47875 style nesting-depth payloads
      const deep = `${'<div>'.repeat(600)}<img src=x onerror=alert(1)>${'</div>'.repeat(600)}`;
      assert.doesNotMatch(sanitize(deep), /onerror/);
      // CVE-2025-26791 style template/namespace confusion
      assert.doesNotMatch(sanitize('<svg><style><a id="</style><img src=x onerror=alert(1)>">'), /onerror/);
      // mathml/svg smuggling
      assert.doesNotMatch(sanitize('<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'), /onerror/);
    });
  });
});
