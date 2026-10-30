/*
 * EventEmitter.prototype.listenerCount for Node.js < 3.2 (webOS 3.x ships
 * 0.10/0.12, which only have the static EventEmitter.listenerCount(emitter,
 * type)).
 *
 * node-fetch >= 2.7.0 calls `socket.listenerCount('data')` while detecting a
 * prematurely closed response; on 0.10 that threw out of the download's
 * error handling and crashed the service.
 *
 * `install(EE)` is exported so the fallback can be tested on a modern Node.js
 * with a constructor whose prototype lacks the method.
 */

import { EventEmitter } from 'events';

/**
 * @param {typeof EventEmitter} EE an EventEmitter constructor
 * @returns {boolean} whether the shim was installed
 */
export function install(EE) {
  if (typeof EE.prototype.listenerCount === 'function') {
    return false;
  }
  // Not via the static EventEmitter.listenerCount(): on Node >= 3.2 that
  // delegates back to the instance method, which would recurse. listeners()
  // has existed since 0.1 and returns a copy of the listener array.
  EE.prototype.listenerCount = function listenerCount(type) {
    var listeners = this.listeners(type);
    return listeners ? listeners.length : 0;
  };
  return true;
}

install(EventEmitter);
