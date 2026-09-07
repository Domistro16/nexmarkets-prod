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

test('wallet supports Base Sepolia and can add a missing network', async () => {
  const calls = [];
  let chainId = '0x14a34';
  const provider = { async request(request) {
    calls.push(request);
    if (request.method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
    if (request.method === 'eth_chainId') return chainId;
    if (request.method === 'wallet_switchEthereumChain') throw Object.assign(new Error('unknown chain'), { code: 4902 });
    if (request.method === 'wallet_addEthereumChain') return null;
    throw new Error(`unexpected ${request.method}`);
  } };
  const wallet = new NexWallet(provider);
  const identity = await wallet.connect(84532);
  assert.equal(identity.chainId, 84532);
  await wallet.switchChain({ chainId: 84532, name: 'Base Sepolia', rpcUrl: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' });
  assert.equal(calls.find((call) => call.method === 'wallet_addEthereumChain').params[0].chainId, '0x14a34');
});

test('wallet encodes settlement and NFT approval transactions and waits for receipts', async () => {
  const calls = [];
  const provider = { async request(request) {
    calls.push(request);
    if (request.method === 'eth_call') {
      if (request.params[0].data.startsWith('0xe985e9c5')) return `0x${'0'.repeat(63)}1`;
      return `0x${'0'.repeat(64)}`;
    }
    if (request.method === 'eth_sendTransaction') return `0x${'33'.repeat(32)}`;
    if (request.method === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash: request.params[0] };
    throw new Error(`unexpected ${request.method}`);
  } };
  const wallet = new NexWallet(provider);
  wallet.address = '0x1111111111111111111111111111111111111111';
  const token = '0x2222222222222222222222222222222222222222';
  const operator = '0x3333333333333333333333333333333333333333';
  assert.equal(await wallet.erc721IsApprovedForAll(token, wallet.address, operator), true);
  await wallet.approveErc721ForAll(token, operator);
  await wallet.approveErc20(token, operator, 1234567n);
  const receipt = await wallet.waitForReceipt(`0x${'33'.repeat(32)}`, { timeoutMs: 100, pollMs: 0 });
  assert.equal(receipt.status, '0x1');
  assert.match(calls.find((call) => call.method === 'eth_sendTransaction' && call.params[0].data.startsWith('0xa22cb465')).params[0].data, /^0xa22cb465/);
  assert.match(calls.find((call) => call.method === 'eth_sendTransaction' && call.params[0].data.startsWith('0x095ea7b3')).params[0].data, /^0x095ea7b3/);
  assert.match(calls.find((call) => call.method === 'eth_call' && call.params[0].data.startsWith('0xe985e9c5')).params[0].data, /^0xe985e9c5/);
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

test('V2 runtime exposes live agent launch and trading mutations', async () => {
  const app = await readFile(new URL('../apps/web/public/v2-app.mjs', import.meta.url), 'utf8');
  for (const route of ['/v1/mints/prepare', '/v1/listings/prepare', '/v1/listings/signed-order', '/v1/listings/buy', '/v1/listings/cancel', '/v1/advantages/consume', '/v1/royalties/withdraw']) assert.ok(app.includes(route));
  for (const action of ['prepareEdition', 'submitSafeEvidence', 'publishTerms', 'liveConfirmProjectMint', 'liveMarketConfirmBuy', 'liveConfirmListing']) assert.match(app, new RegExp(action));
  assert.match(app, /wallet\.submit/);
  assert.match(app, /walletMustSign|Safe workflow/);
  assert.match(app, /eth_signTypedData_v4|signTypedData/);
  assert.match(app, /waitForReceipt/);
});
