import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AbiCoder, Interface, Wallet, ZeroAddress, id } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

async function authenticate(base, wallet) {
  const headers = { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const challengeResponse = await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers, body: JSON.stringify({ address: wallet.address }) });
  const challenge = await challengeResponse.json();
  const verifiedResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers, body: JSON.stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }) });
  const verified = await verifiedResponse.json();
  return { cookie: verifiedResponse.headers.get('set-cookie').split(';')[0], csrf: verified.csrfToken, accountId: verified.accountId };
}

test('Factory receipt link verifies the event and persists one Product association', async (t) => {
  const store = new MemoryStore();
  const builderWallet = Wallet.createRandom();
  const factory = '0x1111111111111111111111111111111111111111';
  const edition = '0x2222222222222222222222222222222222222222';
  const mintController = '0x4444444444444444444444444444444444444444';
  const txHash = `0x${'77'.repeat(32)}`;
  const editionId = `0x${'88'.repeat(32)}`;
  const artworkCommitment = `0x${'99'.repeat(32)}`;
  const topic = id('EditionCreated(address,bytes32,address,bytes32,address,address,uint32,bytes32)');
  const data = AbiCoder.defaultAbiCoder().encode(['bytes32', 'address', 'address', 'uint32', 'bytes32'], [`0x${'aa'.repeat(32)}`, edition, mintController, 3, artworkCommitment]);
  const chain = {
    async getTransactionReceipt() { return { status: '0x1', blockNumber: '0x10', blockHash: `0x${'bb'.repeat(32)}`, transactionHash: txHash, logs: [{ address: factory, topics: [topic, `0x${'00'.repeat(12)}${edition.slice(2)}`, editionId, `0x${'00'.repeat(12)}${builderWallet.address.slice(2)}`], data, logIndex: '0x2' }] }; },
    async getTransactionByHash() { return { to: factory, from: builderWallet.address }; }
  };
  const server = createApiServer({ store, chain, secureCookies: false, orderPolicy: { transactionTargets: { EDITION_CREATE: factory } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = await authenticate(base, builderWallet);
  const headers = { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const projectResponse = await fetch(`${base}/v1/builder/projects`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'edition-link-project' }, body: JSON.stringify({ intent: 'DRAFT', slug: 'receipt-linked-project', name: 'Receipt Linked Project' }) });
  assert.equal(projectResponse.status, 201);
  const project = await projectResponse.json();
  const projectRow = store.projects.find((row) => row.id === project.data.id);
  projectRow.status = 'PUBLISHED';
  const builders = await store.listBuildersForAccount(auth.accountId);
  const body = { builderId: builders[0].id, projectId: project.data.id, editionAddress: edition, txHash };
  const linkedResponse = await fetch(`${base}/v1/builder/editions/link`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'edition-link-1' }, body: JSON.stringify(body) });
  assert.equal(linkedResponse.status, 200);
  const linked = await linkedResponse.json();
  assert.equal(linked.data.project_id, project.data.id);
  assert.equal(linked.data.edition_address, edition);
  assert.equal(store.editions.length, 1);
  const repeated = await fetch(`${base}/v1/builder/editions/link`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'edition-link-2' }, body: JSON.stringify(body) });
  assert.equal(repeated.status, 200);
  assert.equal(store.editions.length, 1);
});

test('Safe-wrapped legacy Factory receipt proves Builder authorization and persists one Product association', async (t) => {
  const store = new MemoryStore();
  const builderWallet = Wallet.createRandom();
  const factory = '0x1111111111111111111111111111111111111111';
  const safe = '0x3333333333333333333333333333333333333333';
  const edition = '0x2222222222222222222222222222222222222222';
  const mintController = '0x4444444444444444444444444444444444444444';
  const txHash = `0x${'66'.repeat(32)}`;
  const editionId = `0x${'88'.repeat(32)}`;
  const artworkCommitment = `0x${'99'.repeat(32)}`;
  const legacy = new Interface(['function createEdition(tuple(string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI) config,address publisher,bytes32 salt) returns(address)']);
  const safeAbi = [
    'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns(bytes32)',
    'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns(bool)'
  ];
  const safeInterface = new Interface(safeAbi);
  const safeHash = `0x${'55'.repeat(32)}`;
  const inner = legacy.encodeFunctionData('createEdition', [{ name: 'Safe Edition', symbol: 'SAFE', initialOwner: safe, editionId, absoluteSupplyCap: 3, artworkCommitment, baseTokenURI: 'data:application/json,%7B%7D#' }, builderWallet.address, `0x${'77'.repeat(32)}`]);
  const signature = builderWallet.signingKey.sign(safeHash).serialized;
  const outer = safeInterface.encodeFunctionData('execTransaction', [factory, 0, inner, 0, 0, 0, 0, ZeroAddress, ZeroAddress, signature]);
  const topic = id('EditionCreated(address,bytes32,address,bytes32,address,address,uint32,bytes32)');
  const data = AbiCoder.defaultAbiCoder().encode(['bytes32', 'address', 'address', 'uint32', 'bytes32'], [`0x${'aa'.repeat(32)}`, safe, mintController, 3, artworkCommitment]);
  const chain = {
    async getTransactionReceipt() { return { status: '0x1', blockNumber: '0x20', blockHash: `0x${'bb'.repeat(32)}`, transactionHash: txHash, logs: [{ address: factory, topics: [topic, `0x${'00'.repeat(12)}${edition.slice(2)}`, editionId, `0x${'00'.repeat(12)}${builderWallet.address.slice(2)}`], data, logIndex: '0x2' }] }; },
    async getTransactionByHash() { return { to: safe, input: outer, from: builderWallet.address }; },
    async ethCall(to, callData) {
      if (to.toLowerCase() === safe && callData.toLowerCase() === '0xaffed0e0') return AbiCoder.defaultAbiCoder().encode(['uint256'], [20]);
      if (to.toLowerCase() === safe && callData.toLowerCase().startsWith(id('getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)').slice(0, 10))) return safeHash;
      throw new Error('UNEXPECTED_CHAIN_CALL');
    }
  };
  const server = createApiServer({ store, chain, secureCookies: false, orderPolicy: { transactionTargets: { EDITION_CREATE: factory }, protocolAdminSafe: safe } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = await authenticate(base, builderWallet);
  const headers = { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const projectResponse = await fetch(`${base}/v1/builder/projects`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'safe-link-project' }, body: JSON.stringify({ intent: 'DRAFT', slug: 'safe-receipt-linked-project', name: 'Safe Receipt Linked Project' }) });
  assert.equal(projectResponse.status, 201);
  const project = await projectResponse.json();
  store.projects.find((row) => row.id === project.data.id).status = 'PUBLISHED';
  const builders = await store.listBuildersForAccount(auth.accountId);
  const linkedResponse = await fetch(`${base}/v1/builder/editions/link`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'safe-link-1' }, body: JSON.stringify({ builderId: builders[0].id, projectId: project.data.id, editionAddress: edition, txHash }) });
  assert.equal(linkedResponse.status, 200);
  const linked = await linkedResponse.json();
  assert.equal(linked.data.project_id, project.data.id);
  assert.equal(linked.data.edition_address, edition);
  assert.match(linked.authority, /SAFE_EXECUTION/);
  assert.equal(store.editions.length, 1);
});
