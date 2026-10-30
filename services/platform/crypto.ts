/*
 * Hashing helpers.
 */

import './promise';

import { createHash } from 'crypto';

import { createReadStream } from './fs';
import { pipeline } from './stream';

export type HashAlgorithm = 'sha256' | 'sha1' | 'md5';

/**
 * Hex digest of a file's contents.
 */
export async function hashFile(filePath: string, algorithm: HashAlgorithm = 'sha256'): Promise<string> {
  const hash = createHash(algorithm, { encoding: 'hex' });
  await pipeline(createReadStream(filePath), hash);
  hash.end();
  const ret: unknown = hash.read();

  if (typeof ret !== 'string') {
    throw new Error('reading result of hash failed');
  }

  return ret;
}

/**
 * Hex digest of a UTF-8 string.
 */
export function hashString(data: string, algorithm: HashAlgorithm = 'sha256'): string {
  return createHash(algorithm).update(data, 'utf-8').digest('hex');
}
