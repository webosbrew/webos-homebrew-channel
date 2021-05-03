//message.js - a wrapper for the palmbus message type

export default class Message {
    /* Message constructor
     * takes two arguments, a palmbus message object, and the handle it was received on
     * third argument is the activityManager instance to use
     */
    constructor(body, handle) {
        this.category = body.category();
        this.method = body.method();
        this.isSubscription = body.isSubscription();
        this.uniqueToken = body.uniqueToken();
        this.token = body.token();
        try {
            this.payload = JSON.parse(body.payload());
        } catch (e) {
            console.error("Message: badly-formatted message payload");
            console.trace();
            this.payload = { badPayload: body.payload() };
        }
        this.sender = 'unknown';
        this.handle = handle;
    }
    //* respond to a message, with a JSON-compatible object
    respond(response) {
        throw new Error('Not implemented');
    }
    //* inform this client that no more responses are coming
    cancel(response) {
        if (this.isSubscription) {
            var r = {};
            if (typeof response === "object" && response !== null) {
                for (var k in response) {
                    r[k] = response[k];
                }
            } else if (response !== undefined) {
                throw ("response must be an object");
            }
            r.subscribed = false;
            this.respond(r);
        }
    }
    static constructBody(payload, isSubscription) {
        if (!payload) throw new Error('payload is empty');
        return {
            applicationID: () => '',
            category: () => '',
            method: () => '',
            isSubscription: () => isSubscription,
            uniqueToken: () => '',
            token: () => '',
            payload: () => payload,
        };
    }
}