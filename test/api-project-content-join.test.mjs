import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

const EDITION = '0x4171d62f43b4168b07a01c04594455dbc3298437';

test('public chain reads join the published project content for Pass rendering', async (t) => {
  const store = new MemoryStore();
  store.projects.push({
    id: 'prj_join',
    slug: 'joined-product',
    name: 'Joined Product',
    summary: 'Published product copy',
    status: 'PUBLISHED',
    builderAccountId: 'acct_join',
    content: {
      project: { name: 'Joined Product', desc: 'The approved product description.' },
      edition: { name: 'Joined Edition', supply: 65 },
      design: { packOption: 'pack-ceramic', passAssignments: [{ serial: 1, optionId: 'pack-ceramic' }] }
    }
  });
  store.editions.push({ id: 'ed_join', editionAddress: EDITION, projectId: 'prj_join', absoluteSupplyCap: 65 });
  const subgraph = {
    enabled: true,
    async discover() {
      return [{ address: EDITION, edition_address: EDITION, slug: EDITION, name: 'Chain-only name', absolute_supply_cap: 65, total_minted: 0, mint_starts_at: '2099-01-01T00:00:00.000Z' }];
    },
    async editionByAddress() {
      return { address: EDITION, edition_address: EDITION, name: 'Chain-only name', absoluteSupplyCap: 65, totalMinted: 0, publisher: '0x1111111111111111111111111111111111111111', currentTerms: { version: 1, hash: `0x${'e'.repeat(64)}`, pricePerPass: '1000000' }, termsHistory: [] };
    },
    async listings() { return []; }
  };
  const server = createApiServer({ store, subgraph, chainId: 46630, allowedOrigin: 'https://nexmarkets.fun', secureCookies: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { origin: 'https://nexmarkets.fun' };

  const discoverResponse = await fetch(`${base}/v1/discover`, { headers });
  assert.equal(discoverResponse.status, 200);
  const discover = (await discoverResponse.json()).data[0];
  assert.equal(discover.slug, 'joined-product');
  assert.equal(discover.content.project.name, 'Joined Product');
  assert.equal(discover.project_id, 'prj_join');

  const projectResponse = await fetch(`${base}/v1/projects/${EDITION}`, { headers });
  assert.equal(projectResponse.status, 200);
  assert.equal((await projectResponse.json()).data.slug, 'joined-product');

  const editionResponse = await fetch(`${base}/v1/editions/${EDITION}`, { headers });
  assert.equal(editionResponse.status, 200);
  const edition = (await editionResponse.json()).data;
  assert.equal(edition.content.design.packOption, 'pack-ceramic');
  assert.equal(edition.project.slug, 'joined-product');
});
