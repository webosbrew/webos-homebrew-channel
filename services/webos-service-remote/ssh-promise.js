import { Client } from 'ssh2';

import shellEscape from 'shell-escape';

export class SSH {
    constructor() {
        this.client = new Client();
    }

    connect(config) {
        const ssh = this;
        return new Promise((resolve, reject) => {
            this.client.on('ready', () => {
                this.client.removeListener('error', reject);
                resolve(ssh);
            });
            this.client.on('error', reject);
            this.client.connect(config);
        });
    }
    close() {
        this.client.end();
    }

    spawn(cmd, args) {
        return new Promise((resolve, reject) => {
            this.client.exec(`${cmd} ${args ? shellEscape(args) : ''}`, (err, stream) => {
                if (err) {
                    return reject(err);
                }
                resolve(stream);
            });
        });
    }

    exec(cmd, args) {
        const client = this.client;
        return new Promise((resolve, reject) => {
            client.exec(`${cmd} ${args ? shellEscape(args) : ''}`, (err, channel) => {
                if (err) {
                    return reject(err);
                }
                const output = { stdout: '', stderr: '' };
                channel.on('data', (chunk) => {
                    output.stdout += chunk.toString();
                });
                channel.stderr.on('data', (chunk) => {
                    output.stderr += chunk.toString();
                })
                channel.on('close', () => {
                    resolve(output);
                })
            });
        });
    }
}