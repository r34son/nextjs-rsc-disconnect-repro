const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(test, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!test()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await sleep(25);
  }
}
async function main() {
  const events = new Map();
  const backend = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id');
    const entry = events.get(id) || { requests: 0, closedEarly: 0, completed: 0, responses: [] };
    entry.requests++;
    entry.responses.push(res);
    events.set(id, entry);
    res.on('finish', () => entry.completed++);
    res.on('close', () => { if (!res.writableFinished) entry.closedEarly++; });
    if (url.pathname === '/dedupe') setTimeout(() => res.end('OK'), 50);
  });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const portReservation = http.createServer();
  portReservation.listen(0, '127.0.0.1'); await once(portReservation, 'listening');
  const port = portReservation.address().port; await new Promise((resolve) => portReservation.close(resolve));
  let logs = '';
  const next = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port)], {
    env: { ...process.env, BACKEND_URL: `http://127.0.0.1:${backend.address().port}`, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  next.stdout.on('data', (chunk) => { logs += chunk; });
  next.stderr.on('data', (chunk) => { logs += chunk; });
  try {
    await waitFor(() => logs.includes('Ready'), 'Next.js startup');
    const base = `http://127.0.0.1:${port}`;
    const results = [];
    for (const [id, path, streaming] of [
      ['rsc-before-headers', '/?id=rsc-before-headers&mode=explicit', false],
      ['rsc-after-headers', '/?id=rsc-after-headers&mode=explicit&streaming=1', true],
      ['rsc-no-signal', '/?id=rsc-no-signal&mode=implicit&streaming=1', true],
      ['route-handler', '/api/check?id=route-handler', false],
    ]) {
      const controller = new AbortController();
      let firstChunk = false;
      const client = fetch(base + path, { signal: controller.signal })
        .then(async (response) => { if (streaming) { const chunk = await response.body.getReader().read(); firstChunk = !chunk.done; } })
        .catch(() => {});
      await waitFor(() => events.has(id), `${id} upstream`);
      if (streaming) await waitFor(() => firstChunk, `${id} streamed fallback`);
      controller.abort(); await client;
      await sleep(1800);
      const entry = events.get(id);
      const result = { id, firstChunk, upstreamRequests: entry.requests, upstreamClosedEarlyAfter1800ms: entry.closedEarly,
        rscSignalAbortedAfter1800ms: logs.includes(`RSC_ABORT ${id} `), routeSignalAbortedAfter1800ms: logs.includes(`ROUTE_ABORT ${id} `) };
      for (const response of entry.responses) if (!response.destroyed) response.end('OK');
      await sleep(200);
      result.upstreamCompletedAfterRelease = entry.completed;
      results.push(result);
    }
    console.log(JSON.stringify({ next: require('next/package.json').version, react: require('react/package.json').version, node: process.version, results }, null, 2));
  } finally {
    next.kill('SIGTERM'); backend.closeAllConnections(); await new Promise((resolve) => backend.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
