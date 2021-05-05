function newBuffer(data, encoding, len) {
    return new Buffer(data, encoding, len);
}

function newSlowBuffer(data, encoding, len) {
    var SlowBuffer = require('buffer').SlowBuffer;
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
