import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

test('built web shell serves responsive routes without embedded product fixtures', async (t) => {
  const html = await readFile(new URL('../apps/web/public/index.html', import.meta.url));
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  for (const route of ['/', '/discover', '/projects/example', '/editions/0x1', '/passes/0x1/1', '/market', '/create', '/dashboard/holder', '/dashboard/builder', '/transactions/example', '/edition-requests/example']) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`);
    assert.equal(response.status, 200); assert.match(await response.text(), /id="app"/);
  }
});
