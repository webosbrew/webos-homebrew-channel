/*
 * Minimal stand-ins for webos-service's Service / Message, enough to drive the
 * handlers in services/handlers.ts without a Luna bus.
 */

import { EventEmitter } from 'node:events';

import type Service from 'webos-service';
import type { Message } from 'webos-service';

export type Payload = Record<string, any>;

type Handler = (message: Message) => void;

export interface RecordedCall {
  uri: string;
  args: Payload;
}

/**
 * A scripted response for an outbound call(): either a payload or a function
 * computing one from the args.
 */
export type CallScript = Payload | ((args: Payload) => Payload);

/**
 * A scripted subscription: a list of payloads to emit as 'response' events in
 * order (after a tick each), or a function receiving the request to drive it
 * manually.
 */
export type SubscribeScript = Payload[] | ((req: FakeSubscription, args: Payload) => void);

export class FakeSubscription extends EventEmitter {
  cancelled = false;

  constructor(
    public readonly uri: string,
    public readonly args: Payload,
  ) {
    super();
  }

  cancel(): void {
    this.cancelled = true;
  }

  /** Emits a 'response' with a Message-like wrapper around `payload`. */
  respond(payload: Payload): void {
    this.emit('response', { payload });
  }

  /** Emits a 'cancel' from the far side. */
  cancelFromRemote(payload: Payload = {}): void {
    this.emit('cancel', { payload });
  }
}

let tokenCounter = 0;

export class FakeMessage {
  readonly responses: Payload[] = [];
  readonly uniqueToken = `token-${(tokenCounter += 1)}`;
  readonly token = this.uniqueToken;
  cancelledWith: Payload | null = null;
  readonly ls2Message: { senderServiceName: () => string };

  private resolveCompletion: (() => void) | null = null;
  private settleOn: number | undefined;

  constructor(
    public readonly method: string,
    public readonly payload: Payload,
    sender: string,
  ) {
    this.ls2Message = { senderServiceName: () => sender };
  }

  respond(response: Payload): boolean {
    this.responses.push(response);
    if (this.settleOn !== undefined && this.responses.length >= this.settleOn) {
      this.finish();
    }
    return true;
  }

  cancel(response: Payload): void {
    this.cancelledWith = response;
    this.finish();
  }

  /** The final response (what tryRespond sends after the runner settles). */
  get last(): Payload {
    const last = this.responses[this.responses.length - 1];
    if (!last) throw new Error('no responses');
    return last;
  }

  waitForCompletion(settleOn?: number, timeoutMs = 10000): Promise<void> {
    this.settleOn = settleOn;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`handler ${this.method} did not complete within ${timeoutMs}ms; responses: ${JSON.stringify(this.responses)}`));
      }, timeoutMs);
      this.resolveCompletion = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  private finish(): void {
    this.resolveCompletion?.();
    this.resolveCompletion = null;
  }

  asMessage(): Message {
    return this as unknown as Message;
  }
}

export class FakeService {
  readonly handlers = new Map<string, { handler: Handler; cancel?: Handler }>();
  readonly calls: RecordedCall[] = [];
  readonly subscriptions: FakeSubscription[] = [];
  readonly callScripts = new Map<string, CallScript>();
  readonly subscribeScripts = new Map<string, SubscribeScript>();

  /* --- webos-service surface --- */

  register(name: string, handler: Handler, cancel?: Handler): void {
    const entry: { handler: Handler; cancel?: Handler } = { handler };
    if (cancel) entry.cancel = cancel;
    this.handlers.set(name, entry);
  }

  call(uri: string, args: Payload, callback: (message: { payload: Payload }) => void): void {
    this.calls.push({ uri, args });
    const script = this.callScripts.get(uri);
    let payload: Payload;
    if (script === undefined) {
      payload = { returnValue: true };
    } else if (typeof script === 'function') {
      payload = script(args);
    } else {
      payload = script;
    }
    setImmediate(() => {
      callback({ payload });
    });
  }

  subscribe(uri: string, args: Payload): FakeSubscription {
    const sub = new FakeSubscription(uri, args);
    this.subscriptions.push(sub);
    const script = this.subscribeScripts.get(uri);
    if (Array.isArray(script)) {
      let delay = 0;
      for (const payload of script) {
        delay += 1;
        setTimeout(() => {
          if (!sub.cancelled) sub.respond(payload);
        }, delay);
      }
    } else if (typeof script === 'function') {
      setImmediate(() => {
        script(sub, args);
      });
    }
    return sub;
  }

  /* --- test helpers --- */

  asService(): Service {
    return this as unknown as Service;
  }

  callsTo(uri: string): RecordedCall[] {
    return this.calls.filter((c) => c.uri === uri);
  }

  toasts(): string[] {
    return this.callsTo('luna://com.webos.notification/createToast').map((c) => String(c.args['message']));
  }

  /**
   * Invokes a registered method and resolves once the handler has finished
   * (i.e. called message.cancel(), which tryRespond does in finally) or, for
   * handlers that never cancel, once `settleOn` responses have arrived.
   */
  invoke(
    method: string,
    payload: Payload = {},
    options: { sender?: string; settleOn?: number; timeoutMs?: number } = {},
  ): Promise<FakeMessage> {
    const entry = this.handlers.get(method);
    if (!entry) throw new Error(`no handler registered for ${method}`);
    const message = new FakeMessage(method, payload, options.sender ?? 'com.example.client');
    const done = message.waitForCompletion(options.settleOn, options.timeoutMs);
    entry.handler(message.asMessage());
    return done.then(() => message);
  }

  /** Fires the cancel handler of `method` for a message previously returned by invoke(). */
  cancelInvocation(method: string, message: FakeMessage): void {
    this.handlers.get(method)?.cancel?.(message.asMessage());
  }
}
