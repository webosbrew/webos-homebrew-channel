import path from 'path';

import type { ConfigOptions } from 'webpack-cli';

import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';

import { MoonstoneResolverPlugin } from './frontend/chore/MoonstoneResolverPlugin';

// The module does not have a declaration file.
const ShebangPlugin = require('webpack-shebang-plugin');

const config: ConfigOptions[] = [
  (_, argv) => ({
    name: 'frontend',
    mode: argv.mode ?? 'development',
    entry: './frontend/index.js',
    output: {
      path: path.resolve(__dirname, './dist/frontend'),
      environment: {
        arrowFunction: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.(?:js|mjs|cjs)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    useBuiltIns: 'usage',
                    corejs: '3.32.0',
                  },
                ],
              ],
            },
          },
        },
      ],
    },
    plugins: [new MoonstoneResolverPlugin()],
  }),
  (_, argv) => ({
    name: 'service',
    target: 'node0.10',
    mode: argv.mode ?? 'development',

    // Builds with devtool support (development) contain very big eval chunks,
    // which seem to cause segfaults (at least) on Node.js v0.12.2 used on webOS 3.x.
    // This feature makes sense only when using recent enough chrome-based
    // node inspector anyway.
    devtool: false,

    entry: {
      'elevate-service': './services/elevate-service.ts',
      'service.js': './services/service.ts',
    },
    output: {
      path: path.resolve(__dirname, './dist/services/'),
      filename: '[name]',
    },
    externals: {
      'webos-service': 'commonjs2 webos-service',
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.m?js$/,
          exclude: /core-js/,
          use: 'babel-loader',
        },
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
      ],
    },
    plugins: [
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          diagnosticOptions: {
            semantic: true,
            syntactic: true,
          },
          mode: 'write-references',
        },
      }),
      new ShebangPlugin({
        chmod: 0o755,
      }),
    ],
  }),
];

export default config;
