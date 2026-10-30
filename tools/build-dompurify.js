#!/usr/bin/env node

/*
 * Builds a self-contained ES5 DOMPurify for the frontend.
 *
 * DOMPurify >= 3.0.2 ships ES2015+ *syntax*, which enyo-dev's uglify-js 2 and
 * the WebKit on webOS 1.x/2.x cannot parse - and every 3.x (including the
 * long-pinned 3.0.1) relies on ES2015+ *built-ins* (Object.entries, Set,
 * Array.from, Symbol, ...) that Chromium 38 (webOS 3.x) and older WebKits do
 * not have. Without Object.entries DOMPurify reports isSupported=false and
 * returns input unsanitized; without Set it does not even load.
 *
 * So this bundles DOMPurify together with exactly the core-js polyfills its
 * code needs (babel preset-env `useBuiltIns: 'usage'`), transpiled to ES5,
 * into one CommonJS file. tests/dompurify-es5.test.ts loads that file in a
 * realm with the ES2015 built-ins removed to prove it still sanitizes.
 *
 * Output: frontend/vendor/purify.es5.js (git-ignored, regenerated on build)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const webpack = require('webpack');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'frontend', 'vendor');
const outFile = 'purify.es5.js';
// The package "exports" map hides dist/ paths, so resolve the main CJS entry.
const dompurifyEntry = require.resolve('dompurify', { paths: [root] });
const pkg = require(path.join(path.dirname(dompurifyEntry), '..', 'package.json'));

// Oldest webviews we care about: QtWebKit on webOS 1.x/2.x and Chromium 38 on webOS 3.x.
const browserTargets = { safari: '6', chrome: '38' };

// A tiny entry that re-exports DOMPurify; babel adds the core-js imports it
// detects as needed in DOMPurify's own source.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-dompurify-'));
const entryFile = path.join(workDir, 'entry.js');
fs.writeFileSync(entryFile, `module.exports = require(${JSON.stringify(dompurifyEntry)});\n`);

const compiler = webpack({
  mode: 'none',
  target: ['web', 'es5'],
  devtool: false,
  entry: entryFile,
  output: {
    path: outDir,
    filename: outFile,
    library: { type: 'commonjs2' },
    // Keep the bundle self-contained and free of modern runtime helpers.
    environment: {
      arrowFunction: false,
      const: false,
      destructuring: false,
      forOf: false,
      dynamicImport: false,
      module: false,
      optionalChaining: false,
      templateLiteral: false,
    },
  },
  resolve: {
    // Resolve core-js from this repo regardless of where the temp entry lives.
    modules: [path.join(root, 'node_modules'), 'node_modules'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /[\\/]core-js[\\/]/,
        use: {
          loader: 'babel-loader',
          options: {
            configFile: false,
            babelrc: false,
            sourceType: 'unambiguous',
            compact: false,
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: browserTargets,
                  modules: false,
                  // Inject exactly the core-js modules DOMPurify's code needs.
                  useBuiltIns: 'usage',
                  corejs: { version: 3, proposals: false },
                },
              ],
            ],
          },
        },
      },
    ],
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: `DOMPurify ${pkg.version} + core-js polyfills, ES5, built by tools/build-dompurify.js. Do not edit.`,
      entryOnly: true,
    }),
  ],
});

compiler.run((err, stats) => {
  fs.rmSync(workDir, { recursive: true, force: true });
  if (err) {
    console.error(err);
    process.exit(1);
  }
  if (!stats || stats.hasErrors()) {
    console.error(stats ? stats.toString({ colors: false, all: false, errors: true }) : 'no stats');
    process.exit(1);
  }
  compiler.close(() => {
    const size = fs.statSync(path.join(outDir, outFile)).size;
    console.info(`[ ] Wrote ${path.relative(root, path.join(outDir, outFile))} (DOMPurify ${pkg.version}, ${Math.round(size / 1024)} KiB)`);
  });
});
