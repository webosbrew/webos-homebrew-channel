import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { errorMessage, isNodeError, parseControlFile } from '../services/utils';

describe('errorMessage', () => {
  it('uses Error.message', () => {
    assert.equal(errorMessage(new Error('boom')), 'boom');
  });

  it('passes strings through', () => {
    assert.equal(errorMessage('plain'), 'plain');
  });

  it('prefers errorText on Luna-style payloads', () => {
    assert.equal(errorMessage({ returnValue: false, errorText: 'luna failed' }), 'luna failed');
  });

  it('falls back to message property', () => {
    assert.equal(errorMessage({ message: 'msg' }), 'msg');
  });

  it('serialises other objects', () => {
    assert.equal(errorMessage({ code: 1 }), '{"code":1}');
  });

  it('stringifies primitives', () => {
    assert.equal(errorMessage(42), '42');
    assert.equal(errorMessage(undefined), 'undefined');
    assert.equal(errorMessage(null), 'null');
  });
});

describe('isNodeError', () => {
  it('accepts Error instances', () => {
    const err: NodeJS.ErrnoException = new Error('x');
    err.code = 'ENOENT';
    assert.equal(isNodeError(err), true);
  });

  it('rejects non-errors', () => {
    assert.equal(isNodeError('ENOENT'), false);
    assert.equal(isNodeError({ code: 'ENOENT' }), false);
    assert.equal(isNodeError(null), false);
  });
});

describe('parseControlFile', () => {
  it('parses a typical ipk control file', () => {
    const control = ['Package: org.webosbrew.hbchannel', 'Version: 0.7.3', 'Section: misc', 'Architecture: all', ''].join('\n');
    assert.deepEqual(parseControlFile(control), {
      Package: 'org.webosbrew.hbchannel',
      Version: '0.7.3',
      Section: 'misc',
      Architecture: 'all',
    });
  });

  it('keeps colons inside values', () => {
    assert.deepEqual(parseControlFile('Homepage: https://example.com:8443/x\n'), { Homepage: 'https://example.com:8443/x' });
  });

  it('tolerates CRLF line endings and missing space after colon', () => {
    assert.deepEqual(parseControlFile('Package:foo\r\nVersion: 1\r\n'), { Package: 'foo', Version: '1' });
  });

  it('joins continuation lines', () => {
    const control = 'Description: first line\n second line\n third line\nPackage: x\n';
    assert.deepEqual(parseControlFile(control), {
      Description: 'first line\nsecond line\nthird line',
      Package: 'x',
    });
  });

  it('ignores garbage lines', () => {
    assert.deepEqual(parseControlFile('no separator here\n: empty key\nPackage: ok\n'), { Package: 'ok' });
  });

  it('returns an empty object for empty input', () => {
    assert.deepEqual(parseControlFile(''), {});
  });
});
