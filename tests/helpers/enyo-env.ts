/*
 * Boots the Enyo 2.7 / Moonstone frontend inside jsdom so the real views can
 * be instantiated and driven in tests.
 *
 * - Module resolution for 'enyo/...', 'moonstone/...', etc. is redirected to
 *   the git submodules under lib/ (enyo-dev does the same when bundling).
 * - window.PalmServiceBridge + navigator.service.request are faked so every
 *   LunaService call is captured and can be answered from the test.
 * - webOS.fetchAppInfo / applicationManager launches are faked too.
 */

import { execFileSync } from 'node:child_process';
import Module from 'node:module';
import path from 'node:path';
import nodeFs from 'node:fs';

import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(__dirname, '..', '..');
const libRoot = path.join(repoRoot, 'lib');

export interface LunaCall {
  uri: string;
  method: string;
  parameters: Record<string, any>;
  subscribe: boolean;
  cancelled: boolean;
  succeed: (payload: Record<string, any>) => void;
  fail: (payload: Record<string, any>) => void;
}

export interface FakeBus {
  calls: LunaCall[];
  /** Calls to a given service/method, oldest first. */
  callsTo: (uri: string, method: string) => LunaCall[];
  /** Most recent call to service/method, or throws. */
  last: (uri: string, method: string) => LunaCall;
  /** Scripted automatic responses: key `${uri}/${method}` -> payload or function. */
  autoRespond: Map<string, Record<string, any> | ((parameters: Record<string, any>) => Record<string, any>)>;
  reset: () => void;
}

export interface EnyoEnv {
  dom: JSDOM;
  /** Console output captured while the env is active (views log a lot). */
  logs: string[];
  window: JSDOM['window'];
  document: Document;
  bus: FakeBus;
  /** Appinfo returned by webOS.fetchAppInfo. */
  appInfo: Record<string, any>;
  /** require() a frontend module through the Enyo-aware resolver. */
  load: (request: string) => any;
  /** Flush Enyo's deferred work (jobs, async bindings). */
  flush: () => Promise<void>;
  /** Poll until `predicate` is truthy (default 3s). */
  waitFor: (predicate: () => boolean, what?: string, timeoutMs?: number) => Promise<void>;
  /** Fire an Enyo event (ontap, onchange, ...) on a control as the dispatcher would. */
  fire: (control: any, eventName: string, extra?: Record<string, any>) => void;
  /**
   * Click a DOM node the way a Magic Remote does: Spotlight in pointer mode,
   * a real bubbling MouseEvent through Enyo's dispatcher. Returns the event.
   */
  click: (node: Element) => MouseEvent;
  /** Render a kind into the document body and return the instance. */
  render: (ctor: any, props?: Record<string, any>) => any;
  destroyAll: () => void;
}

const LIB_MODULE_DIRS: Record<string, string> = {
  enyo: 'src',
  moonstone: 'src',
  spotlight: 'src',
  layout: 'src',
  svg: 'src',
  'enyo-webos': 'src',
  'enyo-ilib': 'ilib/lib',
};

let resolverInstalled = false;

function installResolver(): void {
  if (resolverInstalled) return;
  resolverInstalled = true;
  const originalResolve = (Module as any)._resolveFilename as (
    request: string,
    parent: unknown,
    isMain: boolean,
    options: unknown,
  ) => string;
  (Module as any)._resolveFilename = function resolve(request: string, parent: unknown, isMain: boolean, options: unknown): string {
    const slash = request.indexOf('/');
    const libName = slash === -1 ? request : request.slice(0, slash);
    const moduleDir = LIB_MODULE_DIRS[libName];
    if (moduleDir !== undefined && !request.startsWith('.') && nodeFs.existsSync(path.join(libRoot, libName))) {
      const libDir = path.join(libRoot, libName);
      if (slash === -1) {
        const main = (JSON.parse(nodeFs.readFileSync(path.join(libDir, 'package.json'), 'utf8')) as { main?: string }).main ?? 'index.js';
        return originalResolve.call(this, path.join(libDir, main), parent, isMain, options);
      }
      const rest = request.slice(slash + 1);
      const candidates = [
        path.join(libDir, moduleDir, rest),
        path.join(libDir, moduleDir, `${rest}.js`),
        path.join(libDir, moduleDir, rest, `${path.basename(rest)}.js`),
        path.join(libDir, moduleDir, rest, 'index.js'),
      ];
      for (const candidate of candidates) {
        if (nodeFs.existsSync(candidate) && nodeFs.statSync(candidate).isFile()) {
          return originalResolve.call(this, candidate, parent, isMain, options);
        }
      }
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };
}

const GLOBAL_KEYS = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'screen',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'webOS',
  'PalmSystem',
  'PalmServiceBridge',
  'XMLHttpRequest',
  'Image',
] as const;

function createBus(): FakeBus {
  const calls: LunaCall[] = [];
  const autoRespond = new Map<string, Record<string, any> | ((parameters: Record<string, any>) => Record<string, any>)>();
  return {
    calls,
    autoRespond,
    callsTo: (uri, method) => calls.filter((c) => c.uri === uri && c.method === method),
    last: (uri, method) => {
      const list = calls.filter((c) => c.uri === uri && c.method === method);
      const last = list[list.length - 1];
      if (!last) throw new Error(`no call to ${uri}/${method}; saw ${calls.map((c) => `${c.uri}/${c.method}`).join(', ') || 'none'}`);
      return last;
    },
    reset: () => {
      calls.length = 0;
    },
  };
}

export function createEnyoEnv(): EnyoEnv {
  installResolver();

  // DetailsPanel requires the ES5 DOMPurify build that `npm run build` generates.
  if (!nodeFs.existsSync(path.join(repoRoot, 'frontend', 'vendor', 'purify.es5.js'))) {
    execFileSync('node', [path.join(repoRoot, 'tools', 'build-dompurify.js')], { stdio: 'pipe' });
  }

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    // an http origin so localStorage works (file:// is opaque in jsdom)
    url: 'http://localhost/index.html',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const bus = createBus();
  const appInfo: Record<string, any> = { id: 'org.webosbrew.hbchannel', version: '0.7.3', title: 'Homebrew Channel' };

  // ---- fake PalmServiceBridge ------------------------------------------
  // webOS.js (bundled with enyo-webos) does `new PalmServiceBridge()`, sets
  // `onservicecallback`, then `call(uri, jsonParams)`; responses arrive as JSON
  // strings. Faking at this level exercises webOS.js, ServiceRequest and
  // LunaService exactly as on the TV.
  class FakePalmServiceBridge {
    onservicecallback: ((json: string) => void) | null = null;
    private current: LunaCall | null = null;

    call(fullUri: string, json: string): void {
      const slash = fullUri.lastIndexOf('/');
      const uri = fullUri.slice(0, slash);
      const method = fullUri.slice(slash + 1);
      const parameters: Record<string, any> = json ? (JSON.parse(json) as Record<string, any>) : {};
      let cancelled = false;
      const deliver = (payload: Record<string, any>): void => {
        if (cancelled || !this.onservicecallback) return;
        this.onservicecallback(JSON.stringify(payload));
      };
      const call: LunaCall = {
        uri,
        method,
        parameters,
        subscribe: parameters['subscribe'] === true,
        get cancelled() {
          return cancelled;
        },
        set cancelled(value: boolean) {
          cancelled = value;
        },
        succeed: deliver,
        fail: deliver,
      };
      this.current = call;
      bus.calls.push(call);
      const script = bus.autoRespond.get(`${uri}/${method}`);
      if (script !== undefined) {
        const payload = typeof script === 'function' ? script(parameters) : script;
        setTimeout(() => {
          deliver(payload);
        }, 0);
      }
    }

    cancel(): void {
      if (this.current) this.current.cancelled = true;
    }
  }
  (window as any).PalmServiceBridge = FakePalmServiceBridge;

  // webOS.js (loaded with enyo-webos) replaces window.webOS with its own
  // object, whose fetchAppInfo() XHRs for appinfo.json. Re-apply ours after
  // every module load so views get the configured app info.
  const applyWebOSFakes = (): void => {
    const webOS = ((window as any).webOS ??= {}) as Record<string, any>;
    webOS['fetchAppInfo'] = (cb: (info: Record<string, any>) => void) => {
      cb(appInfo);
    };
    webOS['platform'] = { tv: true };
    (globalThis as any).webOS = webOS;
  };
  applyWebOSFakes();
  // PalmSystem is intentionally absent so MainView reads launch params from location.hash.

  // ---- expose globals for Enyo -------------------------------------------
  const previous: Record<string, unknown> = {};
  for (const key of GLOBAL_KEYS) {
    previous[key] = (globalThis as any)[key];
    const value = key === 'window' ? window : (window as any)[key];
    if (value !== undefined) {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  }
  // Enyo was written for browsers where `global` is the window (enyo-dev bundles it that way).
  (globalThis as any).global = window;

  const rendered: any[] = [];

  // The views log every response; keep test output readable but inspectable.
  const logs: string[] = [];
  const originalConsole = { info: console.info, log: console.log, warn: console.warn, error: console.error };
  const safe = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try {
      // JSON.stringify returns undefined for functions/symbols despite its typing.
      const json = JSON.stringify(value) as string | undefined;
      return typeof json === 'string' ? json : String(value);
    } catch {
      return String(value); // Enyo objects are circular
    }
  };
  const capture =
    (level: string) =>
    (...args: unknown[]): void => {
      logs.push(`${level}: ${args.map(safe).join(' ')}`);
    };
  console.info = capture('info');
  console.log = capture('log');
  console.warn = capture('warn');

  const env: EnyoEnv = {
    dom,
    logs,
    window,
    document: window.document,
    bus,
    appInfo,
    load: (request: string): any => {
      const loaded: unknown = require(request.startsWith('.') ? path.join(repoRoot, 'frontend', request) : request);
      applyWebOSFakes();
      return loaded;
    },
    flush: async () => {
      // Enyo defers some work through setTimeout(0) / requestAnimationFrame; let a few ticks pass.
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    waitFor: async (predicate, what = 'condition', timeoutMs = 3000) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate()) {
        if (Date.now() > deadline) {
          throw new Error(`timed out waiting for ${what}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    fire: (control, eventName, extra = {}) => {
      // Enyo handlers are invoked via bubble(eventName, event, sender).
      control.bubble(eventName, { type: eventName.replace(/^on/, ''), originator: control, ...extra }, control);
    },
    click: (node) => {
      // In 5-way mode Spotlight swallows native clicks (it synthesises them from
      // key presses); a pointing remote switches it to pointer mode first.
      const Spotlight = require('spotlight') as { setPointerMode: (on: boolean) => void };
      Spotlight.setPointerMode(true);
      const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, detail: 1 });
      node.dispatchEvent(event);
      return event;
    },
    render: (ctor: any, props: Record<string, any> = {}) => {
      applyWebOSFakes();

      const instance = new ctor(props);
      instance.renderInto(window.document.body);
      rendered.push(instance);
      return instance;
    },
    destroyAll: () => {
      for (const instance of rendered.splice(0)) {
        try {
          instance.destroy();
        } catch {
          // ignore teardown errors
        }
      }
      console.info = originalConsole.info;
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
    },
  };

  return env;
}
