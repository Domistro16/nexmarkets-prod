import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';
import { PostgresStore } from '../packages/data/src/postgres-store.mjs';

async function running() {
  const store = process.env.DATABASE_URL ? new PostgresStore({ connectionString: process.env.DATABASE_URL }) : new MemoryStore();
  const server = createApiServer({ store, allowedOrigin: 'https://nexmarkets.fun', secureCookies: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, store, base: `http://127.0.0.1:${server.address().port}` };
}

async function authenticate(base, wallet) {
  const challengeResponse = await fetch(`${base}/v1/auth/challenge`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' },
    body: JSON.stringify({ address: wallet.address })
  });
  const challenge = await challengeResponse.json();
  const verifyResponse = await fetch(`${base}/v1/auth/verify`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' },
    body: JSON.stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) })
  });
  const verified = await verifyResponse.json();
  return { cookie: verifyResponse.headers.get('set-cookie').split(';')[0], csrf: verified.csrfToken, accountId: verified.accountId };
}

function headers(auth) {
  return { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
}

test('one user can control isolated Builder identities and server-side authorization follows the selected Builder', async (t) => {
  const { server, store, base } = await running();
  t.after(async () => { server.close(); await store.close?.(); });
  const ownerWallet = Wallet.createRandom();
  const owner = await authenticate(base, ownerWallet);
  const attacker = await authenticate(base, Wallet.createRandom());

  const create = (displayName) => fetch(`${base}/v1/builder/identities`, {
    method: 'POST', headers: headers(owner), body: JSON.stringify({ displayName })
  });
  const builderA = (await (await create('Builder A')).json()).data;
  const builderB = (await (await create('Builder B')).json()).data;
  assert.notEqual(builderA.id, builderB.id);

  const update = (builderId, displayName) => fetch(`${base}/v1/builder/profile`, {
    method: 'PUT', headers: headers(owner), body: JSON.stringify({ builderId, displayName })
  });
  assert.equal((await update(builderA.id, 'Builder A Updated')).status, 200);
  assert.equal((await update(builderB.id, 'Builder B Updated')).status, 200);

  const managed = await (await fetch(`${base}/v1/me/builders`, { headers: { cookie: owner.cookie, origin: 'https://nexmarkets.fun' } })).json();
  assert.deepEqual(managed.data.map((row) => row.id), [builderA.id, builderB.id]);

  // A fresh browser/session must resolve the same memberships and profile
  // values from the backend, rather than from the previous session's storage.
  const refreshedOwner = await authenticate(base, ownerWallet);
  const refreshed = await (await fetch(`${base}/v1/me/builders`, { headers: { cookie: refreshedOwner.cookie, origin: 'https://nexmarkets.fun' } })).json();
  assert.deepEqual(refreshed.data.map((row) => row.id), [builderA.id, builderB.id]);
  assert.equal(refreshed.data.find((row) => row.id === builderA.id).profile.display_name, 'Builder A Updated');

  const createProject = (builderId, slug, name) => fetch(`${base}/v1/builder/projects`, {
    method: 'POST', headers: headers(owner), body: JSON.stringify({ builderId, slug, name, intent: 'DRAFT' })
  });
  assert.equal((await createProject(builderA.id, 'builder-a-product', 'Product A')).status, 201);
  assert.equal((await createProject(builderB.id, 'builder-b-product', 'Product B')).status, 201);

  const dashboard = async (builderId) => (await (await fetch(`${base}/v1/builder/dashboard?builderId=${encodeURIComponent(builderId)}`, { headers: { cookie: owner.cookie, origin: 'https://nexmarkets.fun' } })).json()).data;
  const dashA = await dashboard(builderA.id);
  const dashB = await dashboard(builderB.id);
  assert.deepEqual(dashA.projects.map((project) => project.name), ['Product A']);
  assert.deepEqual(dashB.projects.map((project) => project.name), ['Product B']);
  assert.equal(dashA.builder.profile.display_name, 'Builder A Updated');
  assert.equal(dashB.builder.profile.display_name, 'Builder B Updated');

  const publicA = await (await fetch(`${base}/v1/builders/${encodeURIComponent(builderA.id)}`, { headers: { origin: 'https://nexmarkets.fun' } })).json();
  const publicB = await (await fetch(`${base}/v1/builders/${encodeURIComponent(builderB.id)}`, { headers: { origin: 'https://nexmarkets.fun' } })).json();
  assert.equal(publicA.data.display_name, 'Builder A Updated');
  assert.equal(publicB.data.display_name, 'Builder B Updated');

  const unauthorized = await fetch(`${base}/v1/builder/profile`, {
    method: 'PUT', headers: headers(attacker), body: JSON.stringify({ builderId: builderA.id, displayName: 'Hijacked' })
  });
  assert.equal(unauthorized.status, 403);
  const unchanged = await (await fetch(`${base}/v1/builders/${encodeURIComponent(builderA.id)}`, { headers: { origin: 'https://nexmarkets.fun' } })).json();
  assert.equal(unchanged.data.display_name, 'Builder A Updated');
});
