import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import v1Handler, { normalizeV1RequestUrl } from '../api-src/v1.js';

test('Vercel forwards every public V1 path through one concrete function', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    config.rewrites.find(({ source }) => source === '/v1/:match*'),
    { source: '/v1/:match*', destination: '/api/v1?path=:match*' }
  );
  assert.equal(
    normalizeV1RequestUrl({ url: '/api/v1?path=auth%2Fchallenge', query: { path: 'auth/challenge' } }),
    '/v1/auth/challenge'
  );
  assert.equal(
    normalizeV1RequestUrl({ url: '/api/v1?path=projects%2Fdemo&builderId=builder_1', query: { path: 'projects/demo' } }),
    '/v1/projects/demo?builderId=builder_1'
  );
});

test('concrete Vercel function reaches the wallet challenge endpoint', async (t) => {
  const server = createServer((req, res) => v1Handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/v1?path=auth%2Fchallenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nex-network': 'base-sepolia' },
    body: JSON.stringify({ address: '0x1111111111111111111111111111111111111111' })
  });
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.chainId, 84532);
  assert.match(payload.message, /Sign in to NexMarkets/);
});
