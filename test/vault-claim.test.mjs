import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { Interface, Wallet } from 'ethers';
import { buildVaultClaimPlan, createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

const edition = '0x1111111111111111111111111111111111111111';
const resolver = '0x2222222222222222222222222222222222222222';
const vault = '0x3333333333333333333333333333333333333333';
const erc20 = '0x4444444444444444444444444444444444444444';
const erc721 = '0x5555555555555555555555555555555555555555';
const owner = '0x6666666666666666666666666666666666666666';

const resolverInterface = new Interface(['function account(address,uint256) view returns(address)', 'function createAccount(address,uint256) returns(address)']);
const accountInterface = new Interface(['function isVaultLocked() view returns(bool)', 'function execute(address,uint256,bytes,uint8) returns(bytes)']);
const erc20Interface = new Interface(['function balanceOf(address) view returns(uint256)', 'function transfer(address,uint256) returns(bool)']);
const erc721Interface = new Interface(['function ownerOf(uint256) view returns(address)', 'function safeTransferFrom(address,address,uint256)']);

function chainFixture({ locked = false, deployed = true, walletAddress = owner, transferOk = true } = {}) {
  return {
    async getCode(address) { return address.toLowerCase() === vault.toLowerCase() && deployed ? '0x6000' : '0x'; },
    async ethCall(to, data) {
      const target = to.toLowerCase();
      const selector = data.slice(0, 10);
      if (target === resolver.toLowerCase() && selector === resolverInterface.getFunction('account').selector) {
        return resolverInterface.encodeFunctionResult('account', [vault]);
      }
      if (target === vault.toLowerCase() && selector === accountInterface.getFunction('isVaultLocked').selector) {
        return accountInterface.encodeFunctionResult('isVaultLocked', [locked]);
      }
      if (target === erc20.toLowerCase() && selector === erc20Interface.getFunction('balanceOf').selector) {
        return erc20Interface.encodeFunctionResult('balanceOf', [1_000_000n]);
      }
      if (target === erc20.toLowerCase() && selector === erc20Interface.getFunction('transfer').selector) {
        return erc20Interface.encodeFunctionResult('transfer', [transferOk]);
      }
      if (target === erc721.toLowerCase() && selector === erc721Interface.getFunction('safeTransferFrom').selector) return '0x';
      if (selector === erc721Interface.getFunction('ownerOf').selector) {
        return erc721Interface.encodeFunctionResult('ownerOf', [target === edition.toLowerCase() ? walletAddress : vault]);
      }
      throw new Error(`unexpected call ${to} ${selector}`);
    }
  };
}

test('Vault claim builder uses base-unit ERC-20 amounts and whole ERC-721 transfers', async () => {
  const plan = await buildVaultClaimPlan({
    chain: chainFixture(), resolverAddress: resolver, edition, tokenId: '7', walletAddress: owner,
    assets: [
      { standard: 'ERC20', tokenAddress: erc20, amount: '250001' },
      { standard: 'ERC721', tokenAddress: erc721, tokenId: '42', amount: '1' }
    ]
  });
  assert.equal(plan.phase, 'CLAIM_READY');
  assert.equal(plan.vaultAddress, vault);
  assert.equal(plan.transfers.length, 2);
  assert.equal(plan.transfers[0].amount, '250001');

  const firstExecute = accountInterface.decodeFunctionData('execute', plan.transfers[0].prepared.data);
  assert.equal(firstExecute[0], erc20);
  assert.equal(firstExecute[1], 0n);
  assert.equal(firstExecute[3], 0n);
  const tokenTransfer = erc20Interface.decodeFunctionData('transfer', firstExecute[2]);
  assert.equal(tokenTransfer[0], owner);
  assert.equal(tokenTransfer[1], 250001n);

  const secondExecute = accountInterface.decodeFunctionData('execute', plan.transfers[1].prepared.data);
  const nftTransfer = erc721Interface.decodeFunctionData('safeTransferFrom', secondExecute[2]);
  assert.deepEqual([...nftTransfer], [vault, owner, 42n]);
});

test('Vault claim builder fails closed while isVaultLocked is true', async () => {
  await assert.rejects(() => buildVaultClaimPlan({
    chain: chainFixture({ locked: true }), resolverAddress: resolver, edition, tokenId: '7', walletAddress: owner,
    assets: [{ standard: 'ERC20', tokenAddress: erc20, amount: '1' }]
  }), /PASS_VAULT_LOCKED_WHILE_LISTED/);
});

test('Vault claim builder prepares account creation for a valid claim before balance inspection', async () => {
  const plan = await buildVaultClaimPlan({
    chain: chainFixture({ deployed: false }), resolverAddress: resolver, edition, tokenId: '7', walletAddress: owner,
    assets: [{ standard: 'ERC20', tokenAddress: erc20, amount: '1' }]
  });
  assert.equal(plan.phase, 'ACCOUNT_CREATION_REQUIRED');
  assert.equal(plan.transfers.length, 0);
  assert.equal(plan.accountCreation.to, resolver);
  assert.deepEqual([...resolverInterface.decodeFunctionData('createAccount', plan.accountCreation.data)], [edition, 7n]);
});

test('Vault claim builder rejects fractional ERC-721 and non-string ERC-20 amounts', async () => {
  await assert.rejects(() => buildVaultClaimPlan({
    chain: chainFixture(), resolverAddress: resolver, edition, tokenId: '7', walletAddress: owner,
    assets: [{ standard: 'ERC721', tokenAddress: erc721, tokenId: '42', amount: '0' }]
  }), /ERC721_WHOLE_ASSET_REQUIRED/);
  await assert.rejects(() => buildVaultClaimPlan({
    chain: chainFixture(), resolverAddress: resolver, edition, tokenId: '7', walletAddress: owner,
    assets: [{ standard: 'ERC20', tokenAddress: erc20, amount: 1 }]
  }), /VAULT_ASSET_AMOUNT_BASE_UNITS_REQUIRED/);
});

test('Vault claim builder rejects an ERC-20 that simulates transfer as false', async () => {
  await assert.rejects(() => buildVaultClaimPlan({
    chain: chainFixture({ transferOk: false }), resolverAddress: resolver, edition, tokenId: '7', walletAddress: owner,
    assets: [{ standard: 'ERC20', tokenAddress: erc20, amount: '1' }]
  }), /VAULT_ASSET_TRANSFER_SIMULATION_FAILED/);
});

test('authenticated Vault claim endpoint records one prepared transaction per asset', async (t) => {
  const store = new MemoryStore();
  const wallet = Wallet.createRandom();
  const server = createApiServer({
    store,
    chainId: 84532,
    chain: chainFixture({ walletAddress: wallet.address }),
    allowedOrigin: 'https://nexmarkets.fun',
    secureCookies: false,
    orderPolicy: { tbaResolver: resolver }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const challenge = await (await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ address: wallet.address }) })).json();
  const verifiedResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }) });
  const verified = await verifiedResponse.json();
  const response = await fetch(`${base}/v1/vault/claims/prepare`, {
    method: 'POST',
    headers: { cookie: verifiedResponse.headers.get('set-cookie').split(';')[0], 'x-csrf-token': verified.csrfToken, 'idempotency-key': 'vault-claim-1', 'content-type': 'application/json', origin: 'https://nexmarkets.fun' },
    body: JSON.stringify({ edition, tokenId: '7', assets: [{ standard: 'ERC20', tokenAddress: erc20, amount: '5' }, { standard: 'ERC721', tokenAddress: erc721, tokenId: '42', amount: '1' }] })
  });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.phase, 'CLAIM_READY');
  assert.equal(result.claims.length, 2);
  assert.equal(result.claims[0].transaction.intentType, 'VAULT_CLAIM');
  assert.equal(result.claims[0].transaction.toAddress, vault);
  assert.notEqual(result.claims[0].transaction.id, result.claims[1].transaction.id);
});

test('web Vault claims cannot fall back to local success or purchase mutation simulations', () => {
  const shell = readFileSync(new URL('../apps/web/public/index.html', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../apps/web/public/v2-app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /nmVaultClaimAudit\s*=\s*function/);
  assert.doesNotMatch(shell, /setTimeout\(apply,0\)/);
  assert.match(runtime, /mutation\('\/v1\/vault\/claims\/prepare'/);
  assert.match(runtime, /wallet\.waitForReceipt\(result\.txHash\)/);
});
