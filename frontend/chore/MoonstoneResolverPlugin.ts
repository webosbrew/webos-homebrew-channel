import { NormalModuleReplacementPlugin, type ResolveData } from 'webpack';

/**
 * The plugin resolves Moonstone packages with non-standard 'moduleDir' property.
 */
export class MoonstoneResolverPlugin extends NormalModuleReplacementPlugin {
  public constructor() {
    super(/^(?:enyo(?:-ilib|-webos)?|layout|moonstone)/, MoonstoneResolverPlugin.resolve);
  }

  private static resolve(resource: ResolveData) {
    const [name, ...path] = resource.request.split('/');

    if (path.length > 0) {
      const { moduleDir: root } = require(`${name}/package.json`);

      resource.request = [name, root, ...path].join('/');
    }
  }
}
