/* eslint-disable max-classes-per-file, no-underscore-dangle */
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { asyncReadFile } from '../adapter';
import Message from './message';
import SSH from './ssh-promise';

class Request extends EventEmitter {
  constructor(ssh) {
    super();
    this.ssh = ssh;
  }

  cancel() {
    this.ssh.close();
  }
}

export default class Handle {
  constructor(service) {
    this.service = service;
  }

  /**
   * Send a message via luna-send-pub and start interactive session
   * @param {string} uri
   * @param {string} payload
   * @returns EventEmitter of this session
   */
  subscribe(uri, payload) {
    const ssh = new SSH();
    const request = new Request(ssh);
    this._getSshConfig()
      .then((config) => ssh.connect(config))
      .then(() => ssh.spawn('luna-send-pub', ['-i', uri, payload]))
      .then((stream) => {
        let stdout = '';
        stream.on('close', () => {});
        stream.on('data', (data) => {
          stdout += data.toString();
          let searchPos = 0;
          let breakPos = 0;
          // eslint-disable-next-line no-cond-assign
          while ((breakPos = stdout.indexOf('\n', searchPos)) > 0) {
            const line = stdout.substring(searchPos, breakPos).trim();
            request.emit('response', Message.constructBody(line, true));
            searchPos = breakPos + 1;
          }
          if (searchPos) {
            stdout = stdout.substring(searchPos);
          }
        });
      })
      .catch((err) =>
        request.emit(
          'cancel',
          Message.constructBody(
            JSON.stringify({
              returnValue: false,
              errorCode: -1,
              errorText: `Unable to exec luna-send-pub: ${err}`,
            }),
            false,
          ),
        ),
      );
    return request;
  }

  /**
   * Send a message via luna-send-pub and get response
   * @param {string} uri
   * @param {string} payload
   * @returns Promise to response message
   */
  async call(uri, payload) {
    const ssh = new SSH();
    const config = await this._getSshConfig();
    await ssh.connect(config);
    const { stdout } = await ssh.exec('luna-send-pub', ['-n', '1', uri, JSON.stringify(payload)]);
    return Message.constructBody(stdout.trim(), false);
  }

  querySmId() {
    return new Promise((resolve, reject) => {
      this.service.call('luna://com.webos.service.sm/deviceid/getIDs', { idType: ['NDUID'] }, (message) => {
        if (!message.payload.returnValue) {
          reject(new Error('Failed to call getIDs'));
          return;
        }
        const id = message.payload.idList.find((item) => item.idType === 'NDUID')?.idValue;
        if (!id) {
          reject(new Error('Failed to find NDUID'));
        } else {
          resolve(id);
        }
      });
    });
  }

  async queryNyxId() {
    const raw = (await asyncReadFile('/var/run/nyx/device_info.json')).toString();

    const start = raw.indexOf('{');
    const { nduid } = JSON.parse(raw.slice(start, raw.indexOf('}', start)));
    if (!nduid) {
      throw new Error('Failed to get NDU ID from Nyx');
    }
    return nduid;
  }

  async _getSshConfig() {
    if (!this.service.call) {
      const conf = this.service;
      // Assume this is a static configuration for testing
      return {
        host: conf.host,
        port: conf.port,
        username: conf.username,
        privateKey: readFileSync(conf.privateKeyPath),
        passphrase: conf.passphrase,
      };
    }

    let nduId;

    try {
      nduId = await this.querySmId();
    } catch {
      nduId = await this.queryNyxId();
    }

    return {
      host: '127.0.0.1',
      port: 9922,
      username: 'prisoner',
      privateKey: readFileSync('/var/luna/preferences/webos_rsa'),
      passphrase: nduId.slice(0, 6).toUpperCase(),
    };
  }
}
