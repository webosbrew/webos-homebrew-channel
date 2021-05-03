import EventEmitter from 'events';
import { readFileSync } from 'fs';
import Message from './message';
import { SSH } from './ssh-promise';

class Request extends EventEmitter {
    constructor() {
        super();
    }

    cancel() {
    }
}

export default class Handle {
    constructor(service) {
        this.service = service;
    }
    subscribe(uri, payload) {
        var request = new Request();
        const ssh = new SSH();
        this._getSshConfig().then(config => ssh.connect(config))
            .then(() => ssh.spawn('luna-send-pub', ['-i', uri, JSON.stringify(payload)]))
            .then(stream => {
                stream.on('close', (code, signal) => {
                    ssh.destroy();
                });
                stream.on('data', data => {
                    for (var line of data.toString().split('\n')) {
                        line = line.trim();
                        if (!line.length) continue;
                        request.emit('response', Message.constructBody(line, true));
                    }
                });
            })
            .catch(err => request.emit('cancel', Message.constructBody(JSON.stringify({
                returnValue: false,
                errorCode: -1,
                errorText: `Unable to exec luna-send-pub: ${err}`,
            }), false)))
            .catch(reason => {
                if (reason.stack) {
                    console.err(reason.stack);
                }
                request.emit('cancel', Message.constructBody(JSON.stringify({
                    returnValue: false,
                    errorCode: -1,
                    errorText: `Failed to start ssh session: ${reason}`
                }), false));
            });
        return request;
    }
    async call(uri, payload) {
        const ssh = new SSH();
        return this._getSshConfig().then(config => ssh.connect(config)
            .then(() => ssh.exec('luna-send-pub', ['-n', '1', uri, JSON.stringify(payload)]))
            .then(({ stdout }) => Message.constructBody(stdout.trim(), false)));
    }

    _getSshConfig() {
        return new Promise((resolve, reject) => {
            this.service.call('luna://com.webos.service.sm/deviceid/getIDs', { idType: ['NDUID'] }, (message) => {
                if (!message.payload.returnValue) {
                    reject('Failed to call getIDs');
                    return;
                }
                const idItem = message.payload.idList.find(item => item.idType === 'NDUID')
                if (!idItem) {
                    reject('Failed to find NDUID');
                    return;
                }
                resolve({
                    host: '127.0.0.1',
                    port: 9922,
                    username: 'prisoner',
                    privateKey: readFileSync('/var/luna/preferences/webos_rsa'),
                    passphrase: idItem.idValue.substring(0, 6).toUpperCase(),
                });
            });
        });
    }

}