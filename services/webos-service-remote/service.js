import { Handle } from './sshbus';
import { Subscription } from './subscription';

export class Service {
    constructor() {
        this.sendingHandle = new Handle();
    }
    subscribe(uri, args) {
        if (typeof args !== "object" || args === null) {
            throw ("args must be an object");
        }
        return new Subscription(this.sendingHandle, uri, args);
    }
}