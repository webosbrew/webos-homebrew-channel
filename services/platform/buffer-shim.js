/*
 * Buffer.from / Buffer.alloc family for Node.js < 4.5 (webOS 3.x ships 0.10/0.12).
 *
 * `install(BufferCtor)` adds the missing static methods, implemented with the
 * legacy constructor, and leaves existing ones alone. Exported (rather than
 * only run on import) so the fallback can be exercised in tests on a modern
 * Node.js by handing it a constructor that lacks them.
 */

import { SlowBuffer } from 'buffer';

/**
 * @param {typeof Buffer} BufferCtor
 * @returns {string[]} the names that were installed
 */
export function install(BufferCtor) {
  var installed = [];

  function newBuffer(data, encoding, len) {
    return new BufferCtor(data, encoding, len);
  }

  function newSlowBuffer(data, encoding, len) {
    return new SlowBuffer(data, encoding, len);
  }

  if (!BufferCtor.alloc) {
    BufferCtor.alloc = newBuffer;
    installed.push('alloc');
  }
  if (!BufferCtor.allocUnsafe) {
    BufferCtor.allocUnsafe = newBuffer;
    installed.push('allocUnsafe');
  }
  if (!BufferCtor.allocUnsafeSlow) {
    BufferCtor.allocUnsafeSlow = newSlowBuffer;
    installed.push('allocUnsafeSlow');
  }
  if (!BufferCtor.from) {
    BufferCtor.from = newBuffer;
    installed.push('from');
  }

  return installed;
}

install(Buffer);
