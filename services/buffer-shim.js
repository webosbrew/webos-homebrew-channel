/* eslint-disable no-buffer-constructor */
import { SlowBuffer } from 'buffer';

function newBuffer(data, encoding, len) {
  return new Buffer(data, encoding, len);
}

function newSlowBuffer(data, encoding, len) {
  return new SlowBuffer(data, encoding, len);
}

if (!Buffer.alloc) {
  Buffer.alloc = newBuffer;
}
if (!Buffer.allocUnsafe) {
  Buffer.allocUnsafe = newBuffer;
}
if (!Buffer.allocUnsafeSlow) {
  Buffer.allocUnsafeSlow = newSlowBuffer;
}
if (!Buffer.from) {
  Buffer.from = newBuffer;
}
