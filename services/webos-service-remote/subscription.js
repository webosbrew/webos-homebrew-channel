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
    const self = this;
    this.request.addListener('response', (msg) => {
      let payload;
      try {
        payload = JSON.parse(msg.payload());
      } catch (e) {
        payload = {
          subscribed: false,
          returnValue: false,
          errorText: msg.payload(),
          badPayload: msg.payload(),
        };
      }

      if (payload.subscribed === false) {
        self.request.cancel();
        self.emit('cancel', new Message(msg, handle));
      } else {
        self.emit('response', new Message(msg, handle));
      }
    });
    this.request.addListener('cancel', (msg) => {
      self.emit('cancel', new Message(msg, handle));
    });
  }

  //* stop receiving responses
  cancel() {
    this.request.cancel();
  }
}
