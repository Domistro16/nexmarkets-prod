import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NexWallet } from '../apps/web/public/wallet.mjs';
import { transactionProgress } from '../apps/web/public/transaction.mjs';

test('wallet connects only to Robinhood and submits through EIP-1193', async () => {
  const calls = [];
  const provider = { async request(request) { calls.push(request); if (request.method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111']; if (request.method === 'eth_chainId') return '0x1237'; if (request.method === 'eth_sendTransaction') return `0x${'22'.repeat(32)}`; return '0x0'; } };
  const wallet = new NexWallet(provider); const identity = await wallet.connect(4663);
  assert.equal(identity.chainId, 4663); assert.equal(await wallet.submit({ to: identity.address, data: '0x' }), `0x${'22'.repeat(32)}`);
  assert.equal(calls.at(-1).params[0].from, identity.address);
});

test('wallet rejects a non-Robinhood chain and exposes real USDG read calls', async () => {
  const provider = { async request({ method, params }) { if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111']; if (method === 'eth_chainId') return '0x1'; if (method === 'eth_call') { assert.match(params[0].data, /^0x70a08231/); return '0x64'; } } };
  await assert.rejects(() => new NexWallet(provider).connect(4663), /ROBINHOOD/);
  const wallet = new NexWallet(provider); wallet.address = '0x1111111111111111111111111111111111111111'; assert.equal(await wallet.erc20Balance('0x2222222222222222222222222222222222222222'), 100n);
});

test('transaction UI never treats a tx hash as finality', () => {
  assert.deepEqual(transactionProgress('SUBMITTED'), { state: 'SUBMITTED', completed: 3, terminal: false, final: false });
  assert.equal(transactionProgress('FINALIZED').final, true); assert.equal(transactionProgress('REORGED').terminal, true);
});

test('web implementation contains certified routes and no production mock state', async () => {
  const app = await readFile(new URL('../apps/web/public/app.mjs', import.meta.url), 'utf8');
  for (const route of ['/discover','/projects/','/editions/','/market','/create','/dashboard/holder','/dashboard/builder','/passes/']) assert.ok(app.includes(route));
  assert.match(app, /\/v1\/me\/advantages/); assert.match(app, /\/v1\/builder\/dashboard/);
  for (const mutation of ['/v1/mints/prepare','/v1/listings/prepare','/v1/listings/buy','/v1/listings/cancel','/v1/advantages/consume','/v1/royalties/withdraw']) assert.ok(app.includes(mutation));
  assert.match(app, /erc20Allowance/); assert.match(app, /signTypedData/); assert.match(app, /WALLET_PENDING/); assert.match(app, /SUBMITTED/);
  assert.doesNotMatch(app, /mockProducts|fakeListings|samplePasses/);
  const html = await readFile(new URL('../apps/web/public/index.html', import.meta.url), 'utf8'); assert.match(html, /viewport-fit=cover/); assert.match(html, /mobile-nav/);
});

test('Advantage entitlement UI never submits a view-only TimeBased/Connected useAmount transaction', async () => {
  const app = await readFile(new URL('../apps/web/public/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /Entitlement\/access state; no onchain use transaction/);
  assert.doesNotMatch(app, /kind === 'REDEMPTION' \? 'REDEEM' : kind === 'QUANTITY_BASED' \? 'CONSUME_QUANTITY' : 'USE_AMOUNT'/);
});
