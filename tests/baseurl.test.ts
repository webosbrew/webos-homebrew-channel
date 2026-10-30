import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Plain CommonJS module shared with the Enyo frontend.
// eslint-disable-next-line import/extensions
const { parseURL, resolveURL } = require('../frontend/baseurl.js') as {
  parseURL: (url: string) => { scheme?: string; authority?: string; path: string; query?: string; fragment?: string };
  resolveURL: (url: string, base: string) => string;
};

describe('parseURL', () => {
  it('splits a full URL into its components', () => {
    assert.deepEqual(parseURL('https://example.com:8080/a/b?x=1#frag'), {
      scheme: 'https',
      authority: 'example.com:8080',
      path: '/a/b',
      query: 'x=1',
      fragment: 'frag',
    });
  });

  it('handles relative paths', () => {
    const parsed = parseURL('apps/foo.json');
    assert.equal(parsed.scheme, undefined);
    assert.equal(parsed.authority, undefined);
    assert.equal(parsed.path, 'apps/foo.json');
  });
});

describe('resolveURL', () => {
  // Cases originally kept as a manual test() function inside baseurl.js.
  const cases: [string, string, string][] = [
    ['test', 'https://google.com', 'https://google.com/test'],
    ['/test', 'https://google.com', 'https://google.com/test'],
    ['test', 'https://google.com/a', 'https://google.com/test'],
    ['/test', 'https://google.com/a', 'https://google.com/test'],
    ['test', 'https://google.com/a/', 'https://google.com/a/test'],
    ['/test', 'https://google.com/a/', 'https://google.com/test'],
    ['test', 'https://google.com/a/b', 'https://google.com/a/test'],
    ['/test', 'https://google.com/a/b', 'https://google.com/test'],
    ['test', 'https://google.com/a/b/', 'https://google.com/a/b/test'],
    ['/test', 'https://google.com/a/b/', 'https://google.com/test'],
    ['https://google.com', 'https://google.com', 'https://google.com'],
    ['/?abc', 'https://google.com', 'https://google.com/?abc'],
    ['/test?abc=2', 'https://google.com/ddd?a=23', 'https://google.com/test?abc=2'],
    ['https://other.example/x.ipk', 'https://repo.example/apps.json', 'https://other.example/x.ipk'],
  ];

  for (const [url, base, expected] of cases) {
    it(`resolves ${JSON.stringify(url)} against ${JSON.stringify(base)}`, () => {
      assert.equal(resolveURL(url, base), expected);
    });
  }
});
