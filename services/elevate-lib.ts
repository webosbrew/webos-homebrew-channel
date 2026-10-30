/*
 * Pure helpers used by elevate-service to rewrite Luna service/role/manifest
 * definitions. They operate on file contents only (no filesystem access) so
 * they can be unit-tested.
 */

/* Array.prototype.includes() only available from around Node.js v6. */
import 'core-js/es/array/includes';

/* String.prototype.includes() only available from around Node.js v4. */
import 'core-js/es/string/includes';

export const defaultRequiredNames: readonly string[] = ['*', 'com.webos.service.capture.client*'];

export type ServiceType = 'js' | 'native' | 'elevated-native' | 'unknown';

export interface ServiceFilePatch {
  type: ServiceType;
  contents: string;
}

/**
 * Rewrites a .service file so the service runs outside of its jail/runner:
 *  - JS services: run-js-service is swapped for our own copy
 *  - native services: the jailer wrapper is stripped
 * Returns the (possibly unchanged) contents and the detected service type.
 */
export function patchServiceFileContents(original: string, runJsServicePath: string): ServiceFilePatch {
  if (original.includes('/run-js-service')) {
    return {
      type: 'js',
      contents: original.replace(/^Exec=\/usr\/bin\/run-js-service/gm, `Exec=${runJsServicePath}`),
    };
  }

  if (original.includes('/jailer')) {
    return {
      type: 'native',
      contents: original.replace(/^Exec=\/usr\/bin\/jailer .* ([^ ]*)$/gm, (_, binaryPath: string) => `Exec=${binaryPath}`),
    };
  }

  if (original.includes('Exec=/media')) {
    // Already elevated native service, nothing to do.
    return { type: 'elevated-native', contents: original };
  }

  return { type: 'unknown', contents: original };
}

export type Permission = {
  service: string;
  inbound?: string[];
  outbound?: string[];
};

export type Role = {
  appId: string;
  type: string;
  allowedNames: string[];
  trustLevel: string;
  permissions: Permission[];
};

export type LegacyRole = {
  role: {
    exeName: string;
    type: string;
    allowedNames: string[];
  };
  permissions: Permission[];
};

export function isRecord(obj: unknown): obj is Record<string, any> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

export interface RoleFilePatch {
  changed: boolean;
  contents: string;
  warnings: string[];
  addedPermissions: string[];
}

/**
 * Extends a role file so the service may use any name on the bus and talk to
 * any other service.
 *
 * `legacy` selects the webOS <4.x (/var/palm/ls2*) role format.
 */
export function patchRoleFileContents(
  original: string,
  legacy: boolean,
  requiredNames: readonly string[] = defaultRequiredNames,
): RoleFilePatch {
  const roleNew = JSON.parse(original) as Role | LegacyRole;
  const warnings: string[] = [];
  const addedPermissions: string[] = [];

  let allowedNames: string[] | null = null;

  if (legacy) {
    // webOS <4.x /var/palm/ls2-dev role file
    const legacyRole = roleNew as LegacyRole;
    if (isRecord(legacyRole.role) && Array.isArray(legacyRole.role.allowedNames)) {
      allowedNames = legacyRole.role.allowedNames;
    } else {
      warnings.push('Legacy role file is missing allowedNames');
    }
  } else {
    // webOS 4.x+ /var/luna-service2 role file
    const newRole = roleNew as Role;
    if (Array.isArray(newRole.allowedNames)) {
      allowedNames = newRole.allowedNames;
    } else {
      warnings.push('Role file is missing allowedNames');
    }
  }

  if (allowedNames !== null) {
    for (const name of requiredNames) {
      if (!allowedNames.includes(name)) {
        allowedNames.push(name);
      }
    }
  }

  // permissions / allowedNames interactions are fairly odd. It seems like
  // "service" field in permission is one of allowedNames that this executable
  // can use, outbound are remote client names that our executable/name can use,
  // and inbound are remote client names that can access our executable.
  //
  // Oddly, even though there seems to be some support for wildcards, some
  // pieces of software verify explicit permission "service" key, thus we
  // sometimes may need some extra allowedNames/permissions, even though we
  // default to "*"
  if (Array.isArray(roleNew.permissions)) {
    // Work on a copy so the caller's array is never mutated.
    const missingPermissionNames = [...requiredNames];
    roleNew.permissions.forEach((perm: { outbound?: string[]; service?: string }) => {
      if (perm.service && missingPermissionNames.includes(perm.service)) {
        missingPermissionNames.splice(missingPermissionNames.indexOf(perm.service), 1);
      }
      if (perm.outbound && !perm.outbound.includes('*')) {
        perm.outbound.push('*');
      }
    });

    for (const name of missingPermissionNames) {
      addedPermissions.push(name);
      roleNew.permissions.push({
        service: name,
        inbound: ['*'],
        outbound: ['*'],
      });
    }
  }

  const contents = JSON.stringify(roleNew);
  const changed = contents !== JSON.stringify(JSON.parse(original));

  return { changed, contents, warnings, addedPermissions };
}

export type Manifest = {
  version: string;
  serviceFiles: string[];
  apiPermissionFiles?: string[];
  id: string;
  roleFiles: string[];
  clientPermissionFiles?: string[];
};

export interface ManifestPatch {
  changed: boolean;
  contents: string;
  added: string[];
}

/**
 * Registers our extra client/API permission files in a webOS 4.x+ manifest.
 */
export function patchManifestContents(original: string, clientPermFile: string, apiPermFiles: readonly string[]): ManifestPatch {
  const manifest = JSON.parse(original) as Manifest;
  const added: string[] = [];

  if (Array.isArray(manifest.clientPermissionFiles) && !manifest.clientPermissionFiles.includes(clientPermFile)) {
    manifest.clientPermissionFiles.push(clientPermFile);
    added.push(clientPermFile);
  }

  for (const file of apiPermFiles) {
    if (Array.isArray(manifest.apiPermissionFiles) && !manifest.apiPermissionFiles.includes(file)) {
      manifest.apiPermissionFiles.push(file);
      added.push(file);
    }
  }

  const contents = JSON.stringify(manifest);
  return { changed: contents !== original, contents, added };
}
