#!/usr/bin/env node

const fs = require('fs');

const packageInfo = JSON.parse(fs.readFileSync('package.json'));
const appInfo = JSON.parse(fs.readFileSync('appinfo.json'));

fs.writeFileSync(
  'appinfo.json',
  `${JSON.stringify(
    {
      ...appInfo,
      version: packageInfo.version,
    },
    null,
    4,
  )}\n`,
);
