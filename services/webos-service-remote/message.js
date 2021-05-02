//message.js - a wrapper for the palmbus message type

export class Message {
    /* Message constructor
     * takes two arguments, a palmbus message object, and the handle it was received on
     * third argument is the activityManager instance to use
     */
    constructor(message, handle) {
        this.category = message.category();
        this.method = message.method();
        this.isSubscription = message.isSubscription();
        this.uniqueToken = message.uniqueToken();
        this.token = message.token();
        try {
            this.payload = JSON.parse(message.payload());
        } catch (e) {
            // console.error("Message: badly-formatted message payload");
            // console.error("payload: " + message.payload());
            this.payload = { badPayload: message.payload() };
        }
        this.sender = 'unknown';
        this.handle = handle;
    }
    //* respond to a message, with a JSON-compatible object
    respond(response) {
        throw 'Not implemented';
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
}