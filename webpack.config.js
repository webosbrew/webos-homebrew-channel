const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const ShebangPlugin = require('webpack-shebang-plugin');

module.exports = (env) => [
  {
    target: 'node0.10',
    mode: env.production ? 'production' : 'development',

    // Builds with devtool support (development) contain very big eval chunks,
    // which seem to cause segfaults (at least) on nodeJS v0.12.2 used on webOS 3.x.
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
  },
];
