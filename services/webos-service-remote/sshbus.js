import EventEmitter from 'events';
import { readFileSync } from 'fs';
import { Client } from 'ssh2';

function getSshPrivKey() {
    return readFileSync('/var/luna/preferences/webos_rsa');
}

function getSshPassphrase() {
    try {
        return readFileSync('/var/luna/preferences/webosbrew_devmode_passphrase').toString();
    } catch (e) {
        throw 'Dev Mode SSH passphrase not set';
    }
}

function constructResponse(payload, isSubscription) {
    return {
        applicationID: () => '',
        category: () => '',
        method: () => '',
        isSubscription: () => isSubscription,
        uniqueToken: () => '',
        token: () => '',
        payload: () => payload,
    }
}
class Request extends EventEmitter {
    constructor(conn) {
        super();
        this.conn = conn;
    }

    cancel() {
        this.conn.end();
    }
}
export class Handle {
    constructor() {
    }
    subscribe(uri, payload) {
        var conn = new Client();
        var request = new Request();
        const passphrase = getSshPassphrase(), privkey = getSshPrivKey();
        conn.on('ready', function () {
            conn.exec(`luna-send-pub -i '${uri}' ${JSON.stringify(payload)}`, function (err, stream) {
                if (err) {
                    request.emit('cancel', constructResponse(JSON.stringify({ returnValue: false, errorCode: -1, errorText: err }), false));
                    return;
                }
                stream.on('close', function (code, signal) {
                    conn.end();
                }).on('data', function (data) {
                    for (var line of data.toString().split('\n')) {
                        line = line.trim();
                        if (!line.length) continue;
                        request.emit('response', constructResponse(line, true));
                    }
                }).stderr.on('data', function (data) {
                    request.emit('cancel', constructResponse(data, true));
                });
            });
        }).connect({
            host: '127.0.0.1',
            port: 9922,
            username: 'prisoner',
            passphrase: passphrase,
            privateKey: privkey
        });
        return request;
    }

}