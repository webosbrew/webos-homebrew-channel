import Message from './message';
import Handle from './sshbus';
import Subscription from './subscription';

export default class Service {
    constructor(service) {
        this.sendingHandle = new Handle(service);
    }
    subscribe(uri, args) {
        if (typeof args !== "object" || args === null) {
            throw ("args must be an object");
        }
        return new Subscription(this.sendingHandle, uri, args);
    }
    call(uri, args, callback) {
        if (typeof args !== "object" || args === null) {
            throw ("args must be an object");
        }
        const handle = this.sendingHandle;
        handle.call(uri, args).then(body => {
            callback(new Message(body, handle));
        }).catch(error => {
            if (error.stack) {
                console.error(error.stack);
            }
            callback(new Message(Message.constructBody(JSON.stringify({
                returnValue: false, errorCode: -1, errorText: String(error)
            })), handle));
        });
    }
}