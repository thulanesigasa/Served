import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { localDb } from './local-db.mjs';
import './build.mjs';

const { default: worker } = await import('../dist/server/index.js');
const db = localDb('.served-local.sqlite');
const args = process.argv.slice(2);
const cliPort = args.includes('--port') ? args[args.indexOf('--port') + 1] : undefined;
const port = Number(cliPort || process.env.PORT || 3000);
const host = args.includes('--host') ? args[args.indexOf('--host') + 1] || '0.0.0.0' : '0.0.0.0';
createServer(async (request, response) => {
  try {
    const origin = 'http://' + request.headers.host;
    const options = { method: request.method, headers: request.headers };
    if (!['GET', 'HEAD'].includes(request.method)) {
      options.body = Readable.toWeb(request);
      options.duplex = 'half';
    }
    if (request.headers.origin && new URL(request.headers.origin).host === request.headers.host) {
      options.headers = { ...request.headers, origin };
    }
    const answer = await worker.fetch(new Request(new URL(request.url, origin), options), { DB: db });
    response.writeHead(answer.status, Object.fromEntries(answer.headers));
    if (answer.body) Readable.fromWeb(answer.body).pipe(response);
    else response.end();
  } catch (error) {
    console.error(error);
    response.writeHead(500).end();
  }
}).listen(port, host, () => console.log(`Served running on port ${port}`));
