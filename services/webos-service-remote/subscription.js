import { EventEmitter } from 'events';
import Message from './message';

//* Subscription is an EventEmitter wrapper for subscribed LS2 calls
export default class Subscription extends EventEmitter {
  constructor(handle, uri, args) {
    super();
    this.uri = uri;
    this.args = args;
    this.handle = handle;
    this.request = handle.subscribe(uri, JSON.stringify(args));
    this.request.addListener('response', (msg) => {
      let payload;
      try {
        payload = JSON.parse(msg.payload());
      } catch {
        payload = {
          subscribed: false,
          returnValue: false,
          errorText: msg.payload(),
          badPayload: msg.payload(),
        };
      }

      if (payload.subscribed === false) {
        this.request.cancel();
        this.emit('cancel', new Message(msg, handle));
      } else {
        this.emit('response', new Message(msg, handle));
      }
    });
    this.request.addListener('cancel', (msg) => {
      this.emit('cancel', new Message(msg, handle));
    });
  }

  //* stop receiving responses
  cancel() {
    this.request.cancel();
  }
}
