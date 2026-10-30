import { EventEmitter } from 'events';
import { proc } from '../platform';
import Message from './message';

class Request extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.finished = false;
  }

  cancel() {
    this.finished = true;
    if (this.proc) {
      this.proc.kill();
    }
  }
}

function errorBody(errorText) {
  return Message.constructBody(
    JSON.stringify({
      returnValue: false,
      errorCode: -1,
      errorText,
    }),
    false,
  );
}

export default class Handle {
  constructor(usePublic) {
    if (typeof usePublic === 'boolean') {
      this.usePublic = usePublic;
    } else {
      /* use luna-send-pub when not root */
      this.usePublic = process.getuid() !== 0;
    }
  }

  /**
   * Send a message via luna-send and start interactive session
   * @param {string} uri
   * @param {string} payload
   * @returns EventEmitter of this session
   */

  subscribe(uri, payload) {
    const command = this.usePublic ? 'luna-send-pub' : 'luna-send';
    /* using -a with luna-send-pub causes an error */
    const args = [...(this.usePublic ? [] : ['-a', 'webosbrew']), '-i', uri, payload];

    const request = new Request();
    let responded = false;

    /* Callers attach their listeners after subscribe() returns, so a failure
     * must never be emitted synchronously from here. */
    const fail = (errorText) => {
      if (request.finished) return;
      request.finished = true;
      request.emit('cancel', errorBody(errorText));
    };

    let child;
    try {
      child = proc.spawn(command, args);
    } catch (err) {
      setTimeout(() => fail(`Unable to exec ${command}: ${err}`), 0);
      return request;
    }
    request.proc = child;

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      console.info('stdout:', data.toString());
      stdout += data.toString();
      let searchPos = 0;
      let breakPos = 0;
      while ((breakPos = stdout.indexOf('\n', searchPos)) > 0) {
        const line = stdout.substring(searchPos, breakPos).trim();
        if (line && !request.finished) {
          responded = true;
          request.emit('response', Message.constructBody(line, true));
        }
        searchPos = breakPos + 1;
      }
      if (searchPos) {
        stdout = stdout.substring(searchPos);
      }
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    /* Without this listener a missing or non-executable luna-send(-pub) is an
     * uncaught exception that takes the whole service down. */
    child.on('error', (err) => {
      fail(`Unable to exec ${command}: ${err.message || err}`);
    });
    child.on('close', (code, signal) => {
      if (!responded) {
        const why = signal ? `was killed by ${signal}` : `exited with code ${code}`;
        fail(`${command} ${why} without a response${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
      }
    });
    return request;
  }

  /**
   * Send a message via luna-send and get response
   * @param {string} uri
   * @param {string} payload
   * @returns Promise to response message
   */

  async call(uri, payload) {
    const command = this.usePublic ? 'luna-send-pub' : 'luna-send';
    const stdout = await proc.execFile(command, [
      // FIXME: Dirty hack... We likely want to accept appid in constructor
      /* using -a with luna-send-pub causes an error */
      ...(this.usePublic ? [] : ['-a', payload.sourceId ? payload.sourceId : 'webosbrew']),
      '-n',
      '1',
      uri,
      JSON.stringify(payload),
    ]);
    console.info('call:', stdout);
    return Message.constructBody(stdout.trim(), false);
  }
}
