import { asyncExecFile } from './adapter';

export async function buildBetterJail(id: string, appDir: string) {
  // Populate the jail with `native` instead of `native_devmode`, to gain higher privileges
  await asyncExecFile('jailer', ['-t', 'native', '-p', appDir, '-i', id, '/bin/true']);
}
