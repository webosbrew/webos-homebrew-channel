import type Service from 'webos-service';
import type { ActivityManager } from 'webos-service';

declare module 'webos-service/service' {
  interface Service {
    unregister(): void;
  }
}

type PublicAM = Pick<ActivityManager, 'create' | 'adopt' | 'complete'>;

/**
 * for each request, `webos-service` creates an activity, waits for acknowledgment from ActivityManager,
 * and then runs method handler. eventually, activity completes.
 *
 * if response from *any* call contains `$activity` field, `webos-service` attempts to _adopt_ it.
 * unfortunately, this also removes the activity from persistent DB.
 *
 * instead of patching the external library behavior, we use a stub.
 *
 * ActivityManager stub is still used to terminate service if it is idling for `ttlSeconds`.
 */
export class FakeActivityManager implements PublicAM {
  private _counter: number = 0;

  private _idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private _service: Service | null = null,
    private _ttlSeconds: number = 30,
  ) {
    this._idleTimer = setTimeout(this.quit.bind(this), this._ttlSeconds * 1000);
  }

  create(_activity: any, callback?: (payload: any) => void) {
    this.acquire();
    callback?.({ returnValue: true });
  }

  adopt(_activity: any, callback?: (payload: any) => void) {
    this.acquire();
    callback?.({ payload: { returnValue: true } });
  }

  complete(_activity: any, callback?: (payload: any) => void) {
    this.release();
    callback?.({ returnValue: true });
  }

  setService(service: Service) {
    // types include many props that should not actually be public
    this._service = service;
  }

  cast() {
    return this as unknown as ActivityManager;
  }

  private acquire() {
    this._counter++;

    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
    }
  }

  private release() {
    this._counter--;

    if (this._counter === 0) {
      this._idleTimer = setTimeout(this.quit.bind(this), this._ttlSeconds * 1000);
    }
  }

  private quit() {
    console.log('quitting on next tick');

    process.nextTick(() => process.exit(0));

    this._service?.unregister();
  }
}
