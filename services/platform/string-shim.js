/*
 * String.prototype.normalize for Node.js < 0.12 (webOS 3.x ships 0.10).
 *
 * The URL parser inside node-fetch (whatwg-url -> tr46) calls
 * String.prototype.normalize on every host name; Node.js 0.10 has no ICU and
 * no normalize(), so without this every download fails with
 * "Object ... has no method 'normalize'". core-js does not ship a normalize
 * polyfill (the Unicode tables are huge), and host names in this app are
 * ASCII, so identity is good enough.
 *
 * `install(proto)` is exported so the fallback can be tested on a modern
 * Node.js by handing it a prototype that lacks the method.
 */

/**
 * @param {object} proto normally String.prototype
 * @returns {boolean} whether the shim was installed
 */
export function install(proto) {
  if (typeof proto.normalize === 'function') {
    return false;
  }

  proto.normalize = function normalize() {
    return String(this);
  };
  return true;
}

install(String.prototype);
