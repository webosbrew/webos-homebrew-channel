/* eslint-disable max-classes-per-file, no-underscore-dangle */
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { asyncExecFile } from '../adapter';
import Message from './message';

class Request extends EventEmitter {
  constructor(proc) {
    super();
    this.proc = proc;
  }

  cancel() {
    this.proc.kill();
  }
}

export default class Handle {
  constructor(usePublic) {
    if (typeof usePublic === 'boolean') {
      this.usePublic = usePublic;
    } else {
      /* use luna-send-pub when not root */
      this.usePublic = process.uid !== 0;
    }
  }

  /**
   * Send a message via luna-send and start interactive session
   * @param {string} uri
   * @param {string} payload
   * @returns EventEmitter of this session
   */
  // eslint-disable-next-line class-methods-use-this
  subscribe(uri, payload) {
    const command = this.usePublic ? 'luna-send-pub' : 'luna-send';
    /* using -a with luna-send-pub causes an error */
    const args = [...(this.usePublic ? [] : ['-a', 'webosbrew']), '-i', uri, payload];

    let process;
    let request;
    try {
      process = spawn(command, args);
      request = new Request(process);
      const stream = process.stdout;
      let stdout = '';
      stream.on('close', () => {});
      stream.on('data', (data) => {
        console.info('stdout:', data.toString());
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
    } catch (err) {
      if (request) {
        request.emit(
          'cancel',
          Message.constructBody(
            JSON.stringify({
              returnValue: false,
              errorCode: -1,
              errorText: `Unable to exec ${command}: ${err}`,
            }),
            false,
          ),
        );
      }
      if (process) {
        process.kill();
      }
    }
    return request;
  }

  /**
   * Send a message via luna-send and get response
   * @param {string} uri
   * @param {string} payload
   * @returns Promise to response message
   */
  // eslint-disable-next-line class-methods-use-this
  async call(uri, payload) {
    const stdout = await asyncExecFile('luna-send', [
      // FIXME: Dirty hack... We likely want to accept appid in constructor
      '-a',
      payload.sourceId ? payload.sourceId : 'webosbrew',
      '-n',
      '1',
      uri,
      JSON.stringify(payload),
    ]);
    console.info('call:', stdout);
    return Message.constructBody(stdout.trim(), false);
  }
}
