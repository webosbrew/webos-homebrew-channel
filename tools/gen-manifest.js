#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');

let outfile = process.argv[2];
let appinfo = JSON.parse(fs.readFileSync('appinfo.json'));
let ipkfile = `${appinfo.id}_${appinfo.version}_all.ipk`;
let ipkhash = crypto.createHash('sha256').update(fs.readFileSync(ipkfile)).digest('hex');

fs.writeFileSync(outfile, JSON.stringify({
    id: appinfo.id,
    version: appinfo.version,
    type: appinfo.type,
    title: appinfo.title,
    appDescription: appinfo.appDescription,
    iconUri: 'https://raw.githubusercontent.com/webosbrew/webos-homebrew-channel/main/assets/icon160.png',
    sourceUrl: 'https://github.com/webosbrew/webos-homebrew-channel',
    rootRequired: true,
    ipkUrl: ipkfile,
    ipkHash: {
        sha256: ipkhash
    }
}));