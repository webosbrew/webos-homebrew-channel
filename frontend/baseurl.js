// https://www.ietf.org/rfc/rfc3986.txt - page 50
export function parseURL(url) {
  const re = new RegExp('^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?');
  const res = url.match(re);

  return {
    scheme: res[2],
    authority: res[4],
    path: res[5],
    query: res[7],
    fragment: res[9],
  };
}

/**
 * Resolve URL url based off URL base (equivalent API to nodejs url.resolve with
 * arguments flipped)
 */
export function resolveURL(url, base) {
  const p1 = parseURL(url);
  const p2 = parseURL(base);

  if (p1.scheme) return url;

  if (p1.path.startsWith('/')) {
    return `${p2.scheme}://${p2.authority}${p1.path}${p1.query ? `?${p1.query}` : ''}`;
  } else {
    const b = p2.path.lastIndexOf('/') != -1 ? p2.path.substring(0, p2.path.lastIndexOf('/')) : p2.path;
    return `${p2.scheme}://${p2.authority}${b}/${p1.path}${p1.query ? '?' + p1.query : ''}`;
  }
}

export function test() {
  // Some quick testcases...
  var testCases = [
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
  ];

  testCases.forEach(function (t) {
    var u1 = t[0];
    var u2 = t[1];
    var r = t[2];
    var res = resolveURL(t[0], t[1]);
    console.info(t[0], t[1], res, res == t[2]);
  });
}
