import test from 'node:test';
import assert from 'node:assert/strict';
import { DynamicServerWalletClient } from '../packages/chain/src/dynamic-server-wallet.mjs';
import { X402PaymentClient } from '../packages/chain/src/x402-payment-client.mjs';

test('DynamicServerWalletClient: provisions mock wallet deterministically', async () => {
  const client = new DynamicServerWalletClient({ mockMode: true });
  const wallet1 = await client.createOrGetServerWallet({
    identifier: 'agent:0x1234:policy1',
    chainId: 84532
  });

  assert.ok(wallet1.walletId.startsWith('dyn_wal_'));
  assert.match(wallet1.address, /^0x[0-9a-f]{40}$/);
  assert.equal(wallet1.chainId, 84532);

  // Idempotent: retrieving same identifier returns identical wallet
  const wallet2 = await client.createOrGetServerWallet({
    identifier: 'agent:0x1234:policy1',
    chainId: 84532
  });
  assert.equal(wallet1.walletId, wallet2.walletId);
  assert.equal(wallet1.address, wallet2.address);
});

test('DynamicServerWalletClient: signs and submits transaction in mock mode', async () => {
  const client = new DynamicServerWalletClient({ mockMode: true });
  const wallet = await client.createOrGetServerWallet({ identifier: 'test-wallet' });

  const tx = await client.sendTransaction({
    walletId: wallet.walletId,
    to: '0x2453c5FCef787D076ff21614E54C50344FD1EB91',
    data: '0x12345678',
    value: '0x0',
    chainId: 84532
  });

  assert.equal(tx.status, 'SUBMITTED');
  assert.match(tx.txHash, /^0x[0-9a-f]{64}$/);
  assert.equal(tx.to, '0x2453c5fcef787d076ff21614e54c50344fd1eb91');
  assert.equal(tx.from, wallet.address);
});

test('X402PaymentClient: passes non-402 response directly', async () => {
  const client = new DynamicServerWalletClient({ mockMode: true });
  const wallet = await client.createOrGetServerWallet({ identifier: 'x402-agent' });
  const x402 = new X402PaymentClient({
    serverWalletClient: client,
    walletId: wallet.walletId,
    chainId: 84532
  });

  // Mock global fetch for 200 OK
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
    const res = await x402.fetchWithPayment('https://api.example.com/data');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('X402PaymentClient: handles 402 challenge, signs payment, and retries with authorization', async () => {
  const client = new DynamicServerWalletClient({ mockMode: true });
  const wallet = await client.createOrGetServerWallet({ identifier: 'x402-agent-2' });
  const x402 = new X402PaymentClient({
    serverWalletClient: client,
    walletId: wallet.walletId,
    chainId: 84532
  });

  let callCount = 0;
  let receivedAuth = null;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url, options) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'Payment Required' }), {
          status: 402,
          headers: {
            'x-payment-address': '0x1111111111111111111111111111111111111111',
            'x-payment-amount': '1000000',
            'x-payment-chain-id': '84532'
          }
        });
      }
      receivedAuth = options.headers.get('Authorization');
      return new Response(JSON.stringify({ tokenizedStock: 'NVDAc', units: '10' }), { status: 200 });
    };

    const res = await x402.fetchWithPayment('https://api.example.com/stocks/nvda');
    assert.equal(res.status, 200);
    assert.equal(callCount, 2);
    assert.match(receivedAuth, /^x402 0x[0-9a-f]{64}$/);
    const data = await res.json();
    assert.equal(data.tokenizedStock, 'NVDAc');
    assert.equal(data.units, '10');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
