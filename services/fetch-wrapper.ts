/*
 * fetch-wrapper.ts
 *
 * Makes fetch() trust our CA certs. Certs loaded on first use.
 *
 * This is part of webOS Homebrew Channel
 * https://github.com/webosbrew/webos-homebrew-channel
 * Copyright 2024 throwaway96.
 */

import http from 'http';
import https from 'https';

import { loadCertDir } from '@throwaway96/node-load-cert-dir';

import fetch from 'node-fetch';

function createAgent(): https.Agent {
  const certsDir = __dirname + '/certs';
  const certs = loadCertDir(certsDir, {
    logLevel: 0,
  });

  return new https.Agent({ ca: certs });
}

let defaultHttpsAgent: https.Agent | null = null;

export function fetchWrapper(url: fetch.RequestInfo, init?: fetch.RequestInit): Promise<fetch.Response> {
  defaultHttpsAgent ??= createAgent();

  init ??= {};

  init.agent = (parsedURL: URL): http.RequestOptions['agent'] => {
    if (parsedURL.protocol == 'http:') {
      return http.globalAgent;
    } else {
      return defaultHttpsAgent as https.Agent;
    }
  };

  return fetch(url, init);
}
