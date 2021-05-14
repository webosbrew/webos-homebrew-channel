const path = require('path');

module.exports = (env) => [
  {
    target: 'node0.10',
    mode: env.production ? 'production' : 'development',

    // Builds with devtool support (development) acontain very big eval chunks,
    // which seem to cause segfaults (at least) on nodeJS v0.12.2 used on webOS 3.x.
    // This feature makes sense only when using recent enough chrome-based
    // node inspector anyway.
    devtool: false,

    entry: './services/service.ts',
    output: {
      path: path.resolve(__dirname, './dist/services/'),
      filename: 'service.js',
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
          use: 'babel-loader',
        },
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
      ],
    },
  },
];
