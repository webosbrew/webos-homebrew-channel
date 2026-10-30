/*
 * String.prototype.normalize for Node.js < 0.12 (webOS 3.x ships 0.10, built
 * without ICU and without normalize()).
 *
 * The URL parser inside node-fetch (whatwg-url -> tr46) calls
 * String.prototype.normalize('NFC') on every host name; without this every
 * download fails with "Object ... has no method 'normalize'".
 *
 * core-js does not ship a normalize polyfill (the Unicode tables are large),
 * so this shim does the only thing that is correct without them: ASCII input
 * is returned unchanged (normalization is the identity for ASCII), and
 * non-ASCII input is REJECTED with a clear error rather than silently
 * returned un-normalized - visually identical Unicode host names in NFC and
 * NFD would otherwise resolve to different punycode hosts.
 *
 * `install(proto)` is exported so the fallback can be tested on a modern
 * Node.js by handing it a prototype that lacks the method.
 */

// eslint-disable-next-line no-control-regex -- the ASCII range is the point
var NON_ASCII = /[^\x00-\x7f]/;
var VALID_FORMS = { NFC: true, NFD: true, NFKC: true, NFKD: true };

/**
 * @param {object} proto normally String.prototype
 * @returns {boolean} whether the shim was installed
 */
export function install(proto) {
  if (typeof proto.normalize === 'function') {
    return false;
  }

  proto.normalize = function normalize(form) {
    var str = String(this);
    if (form !== undefined && !VALID_FORMS[form]) {
      throw new RangeError('The normalization form should be one of NFC, NFD, NFKC, NFKD.');
    }
    if (NON_ASCII.test(str)) {
      throw new TypeError(
        'String.prototype.normalize is not available on this Node.js (no ICU); ' +
          'non-ASCII text such as internationalized host names cannot be normalized here.',
      );
    }
    return str;
  };
  return true;
}

install(String.prototype);
