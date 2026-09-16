import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

const EDITION = '0x2222222222222222222222222222222222222222';
const EDITION_ID = `0x${'88'.repeat(32)}`;

async function listen(t, options) {
  const server = createApiServer({ secureCookies: false, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

function seedLinkedEdition(store) {
  store.projects.push({
    id: 'prj_1', slug: 'baldies', name: 'Baldies', status: 'PUBLISHED',
    summary: 'Baldies drop',
    content: {
      project: { description: 'Two thousand little bald guys.' },
      design: {
        artSrc: null,
        artworkBySerial: {
          1: { url: 'https://cdn.nexmarkets.xyz/art/baldies-1.png' },
          2: { url: 'https://cdn.nexmarkets.xyz/art/baldies-2.png' }
        }
      }
    }
  });
  store.editions.push({
    editionAddress: EDITION, editionIdHash: EDITION_ID, projectId: 'prj_1',
    chainId: 84532, absoluteSupplyCap: 2000, finalized: false
  });
}

test('metadata route serves ERC-721 JSON keyed by editionId with per-serial artwork', async (t) => {
  const store = new MemoryStore();
  seedLinkedEdition(store);
  const base = await listen(t, { store });

  const response = await fetch(`${base}/v1/metadata/${EDITION_ID}/2`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  const body = await response.json();
  assert.equal(body.name, 'Baldies #2');
  assert.equal(body.description, 'Baldies drop');
  assert.equal(body.image, 'https://cdn.nexmarkets.xyz/art/baldies-2.png');
  assert.equal(body.external_url, `https://nexmarkets.fun/editions/${EDITION}`);
  assert.deepEqual(body.attributes?.find((a) => a.trait_type === 'Serial'), { trait_type: 'Serial', display_type: 'number', value: 2 });
});

test('metadata route also resolves by edition address and uses single-mode artSrc', async (t) => {
  const store = new MemoryStore();
  seedLinkedEdition(store);
  store.projects[0].content.design = { artSrc: 'https://cdn.nexmarkets.xyz/art/baldies-single.png' };
  const base = await listen(t, { store });

  const response = await fetch(`${base}/v1/metadata/${EDITION}/7`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, 'Baldies #7');
  assert.equal(body.image, 'https://cdn.nexmarkets.xyz/art/baldies-single.png');
});

test('metadata falls back to indexed on-chain name when no project link exists', async (t) => {
  const store = new MemoryStore();
  const subgraph = {
    enabled: true,
    async editionByAddress() { return null; },
    async editionByEditionId(id) {
      assert.equal(id, EDITION_ID);
      return { address: EDITION, name: 'Baldies', symbol: 'BALDIES', absoluteSupplyCap: '2000', totalMinted: '2' };
    }
  };
  const base = await listen(t, { store, subgraph });

  const response = await fetch(`${base}/v1/metadata/${EDITION_ID}/1`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, 'Baldies #1');
  assert.equal(body.image, undefined);
  assert.deepEqual(body.attributes?.find((a) => a.trait_type === 'Symbol'), { trait_type: 'Symbol', value: 'BALDIES' });
});

test('metadata returns 404 for unknown editions and out-of-range serials', async (t) => {
  const store = new MemoryStore();
  seedLinkedEdition(store);
  const base = await listen(t, { store });

  assert.equal((await fetch(`${base}/v1/metadata/0x${'44'.repeat(32)}/1`)).status, 404);
  assert.equal((await fetch(`${base}/v1/metadata/${EDITION_ID}/0`)).status, 404);
  assert.equal((await fetch(`${base}/v1/metadata/${EDITION_ID}/2001`)).status, 404);
});
