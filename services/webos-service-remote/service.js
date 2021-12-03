import Message from './message';
import SSHHandle from './sshbus';
import ExecHandle from './execbus';
import Subscription from './subscription';

/**
 * Drop in replacement for webos-service, but using SSH shell to call luna-send-pub instead.
 */
export default class Service {
  /**
   *
   * @param {Service|null} service from webos-service module. Used for retreving SSH pubkey passphrase. If null is provided, alternative backend using root execution is used
   */
  constructor(service) {
    if (service === null) {
      this.sendingHandle = new ExecHandle();
    } else {
      this.sendingHandle = new SSHHandle(service);
    }
  }

  /* Call a service on the bus
   * The args parameter is a JSON-compatible object
   * The callback gets passed a Message object
   */
  call(uri, args, callback) {
    if (typeof args !== 'object' || args === null) {
      throw new Error('args must be an object');
    }
    const handle = this.sendingHandle;
    handle
      .call(uri, args)
      .then((body) => {
        callback(new Message(body, handle));
      })
      .catch((error) => {
        if (error.stack) {
          console.error(error.stack);
        }
        callback(
          new Message(
            Message.constructBody(
              JSON.stringify({
                returnValue: false,
                errorCode: -1,
                errorText: String(error),
              }),
            ),
            handle,
          ),
        );
      });
  }

  /* Subscribe to a service on the bus
   * The args parameter is a JSON-compatible object
   * Returns a Subscription object which raises events when responses come in
   */
  subscribe(uri, args) {
    if (typeof args !== 'object' || args === null) {
      throw new Error('args must be an object');
    }
    return new Subscription(this.sendingHandle, uri, args);
  }
}
