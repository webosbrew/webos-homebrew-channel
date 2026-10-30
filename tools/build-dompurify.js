#!/usr/bin/env node

/*
 * Transpiles DOMPurify's CommonJS bundle down to ES5.
 *
 * DOMPurify >= 3.0.2 ships ES2015+ syntax in dist/. The frontend bundler
 * (enyo-dev) minifies with uglify-js 2, which only understands ES5, and the
 * webviews on older webOS releases (1.x/2.x) can't run ES2015 syntax either.
 * Rather than pinning an old, vulnerable DOMPurify, we transpile the current
 * release ourselves at build time and require() the result from the frontend.
 *
 * Output: frontend/vendor/purify.es5.js (git-ignored, regenerated on build)
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
// The package "exports" map hides dist/ paths, so resolve the main CJS entry instead.
const input = require.resolve('dompurify', { paths: [root] });
const pkg = require(path.join(path.dirname(input), '..', 'package.json'));
const outDir = path.join(root, 'frontend', 'vendor');
const output = path.join(outDir, 'purify.es5.js');

const source = fs.readFileSync(input, 'utf8');

const result = babel.transformSync(source, {
  filename: input,
  // Don't pick up the repo babel.config.json (that one targets Node.js for the service).
  configFile: false,
  babelrc: false,
  sourceType: 'script',
  compact: false,
  presets: [
    [
      '@babel/preset-env',
      {
        // Oldest webviews we care about: QtWebKit on webOS 1.x/2.x and Chromium 38 on webOS 3.x.
        targets: { safari: '6', chrome: '38' },
        modules: false,
        useBuiltIns: false,
      },
    ],
  ],
});

if (!result || typeof result.code !== 'string') {
  throw new Error('babel produced no output');
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(output, `/* DOMPurify ${pkg.version} - transpiled to ES5 by tools/build-dompurify.js. Do not edit. */\n${result.code}\n`);
console.info(`[ ] Wrote ${path.relative(root, output)} (DOMPurify ${pkg.version})`);
