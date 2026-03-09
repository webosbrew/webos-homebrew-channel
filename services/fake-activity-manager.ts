import type { ActivityManager } from 'webos-service';

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
class FakeActivityManager implements PublicAM {
  private _counter: number = 0;

  private _idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly _ttlSeconds: number) {
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

  private acquire() {
    this._counter++;
  }

  private release() {
    this._counter--;

    if (this._counter === 0) {
      this._idleTimer = setTimeout(this.quit.bind(this), this._ttlSeconds * 1000);
    } else if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
    }
  }

  private quit() {
    console.log('quitting on next tick');
    process.nextTick(() => process.exit(0));
  }
}

export function createFakeActivityManager(ttlSeconds: number) {
  // types include many props that should not actually be public
  return new FakeActivityManager(ttlSeconds) as unknown as ActivityManager;
}
