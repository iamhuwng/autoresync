import { createTicket20AOverrideProxy } from './lib/prd0062-ticket20a/overrideProxy.mjs';

const versionId = process.env.TICKET20A_VERSION_ID;
const port = Number(process.env.TICKET20A_PROXY_PORT ?? 8790);
const upstream = process.env.TICKET20A_UPSTREAM;

if (!versionId) {
  throw new Error('TICKET20A_VERSION_ID is required.');
}
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error('TICKET20A_PROXY_PORT must be an unprivileged TCP port.');
}

const server = createTicket20AOverrideProxy({
  versionId,
  ...(upstream ? { upstream } : {}),
});
server.listen(port, 'localhost', () => {
  console.log(`PRD0062 ticket 20A override proxy ready at http://localhost:${port}`);
});
