import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';
import { buildNexMarketsOrder, buildProtocolCalldata } from '../packages/domain/src/index.mjs';

const root = new URL('../', import.meta.url);
const reportUrl = new URL('artifacts/verification/security-report.md', root);
const origin = 'https://nexmarkets.fun';
const testEdition = '0x2222222222222222222222222222222222222222';
const wrongEdition = '0x9999999999999999999999999999999999999999';
const mintTarget = '0x7777777777777777777777777777777777777777';
const policy = {
  usdg: '0x3333333333333333333333333333333333333333',
  protocolFeeRecipient: '0x4444444444444444444444444444444444444444',
  royaltyVault: '0x5555555555555555555555555555555555555555',
  zone: '0x6666666666666666666666666666666666666666',
  seaport: '0x0000000000000068F116a894984e2DB1123eB395',
  transactionTargets: { MINT: mintTarget, ADVANTAGE_USE: '0x8888888888888888888888888888888888888888' }
};
const networkConfigs = {
  'robinhood-testnet': { chainId: 46630, orderPolicy: policy, chain: null, subgraph: null },
  'base-sepolia': { chainId: 84532, orderPolicy: policy, chain: null, subgraph: null }
};

function stringify(value) {
  return JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);
}

async function body(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

async function request(base, path, { method = 'GET', auth = null, body: payload, network = null, idempotencyKey = null } = {}) {
  const headers = { origin };
  if (payload !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    headers.cookie = auth.cookie;
    if (method !== 'GET') headers['x-csrf-token'] = auth.csrfToken;
  }
  if (network) headers['x-nex-network'] = network;
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const response = await fetch(`${base}${path}`, { method, headers, body: payload === undefined ? undefined : stringify(payload) });
  return { status: response.status, body: await body(response) };
}

async function authenticate(base, wallet, network = null) {
  const networkHeaders = network ? { 'x-nex-network': network } : {};
  const challengeResponse = await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...networkHeaders }, body: stringify({ address: wallet.address }) });
  if (challengeResponse.status !== 201) throw new Error(`AUTH_CHALLENGE_${challengeResponse.status}`);
  const challenge = await body(challengeResponse);
  const verifyResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...networkHeaders }, body: stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }) });
  if (verifyResponse.status !== 200) throw new Error(`AUTH_VERIFY_${verifyResponse.status}`);
  const verified = await body(verifyResponse);
  return { wallet, csrfToken: verified.csrfToken, cookie: verifyResponse.headers.get('set-cookie')?.split(';')[0], accountId: verified.accountId };
}

function resultRecord(name, status, outcome, detail, code = null) {
  return { name, status, outcome, code, detail };
}

async function main() {
  const store = new MemoryStore();
  const server = createApiServer({ store, chainId: 46630, allowedOrigin: origin, secureCookies: false, orderPolicy: policy, networkConfigs });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  const capture = async (name, run, { expectedStatus, expectedCode = null, outcome = 'REJECTED' } = {}) => {
    try {
      const response = await run();
      const code = response.body?.error?.code ?? null;
      const statusOkay = typeof expectedStatus === 'function' ? expectedStatus(response.status) : response.status === expectedStatus;
      const codeOkay = !expectedCode || code === expectedCode;
      results.push(resultRecord(name, response.status, statusOkay && codeOkay ? outcome : 'FAIL', `HTTP ${response.status}${code ? ` (${code})` : ''}`, code));
      return response;
    } catch (error) {
      results.push(resultRecord(name, null, 'FAIL', error.message));
      return null;
    }
  };

  try {
    const ownerWallet = Wallet.createRandom();
    const attackerWallet = Wallet.createRandom();
    const questionerWallet = Wallet.createRandom();
    const owner = await authenticate(base, ownerWallet);
    const attacker = await authenticate(base, attackerWallet);
    const questioner = await authenticate(base, questionerWallet);

    const createBuilder = async (displayName) => {
      const response = await request(base, '/v1/builder/identities', { method: 'POST', auth: owner, body: { displayName } });
      if (response.status !== 201) throw new Error(`BUILDER_CREATE_${response.status}`);
      return response.body.data;
    };
    const builderA = await createBuilder('Security Builder A');
    const builderB = await createBuilder('Security Builder B');

    await capture('unauthorized Builder profile edit', () => request(base, '/v1/builder/profile', { method: 'PUT', auth: attacker, body: { builderId: builderA.id, displayName: 'Hijacked' } }), { expectedStatus: 403 });
    await capture('editing another Builder', () => request(base, '/v1/builder/profile', { method: 'PUT', auth: attacker, body: { builderId: builderB.id, displayName: 'Cross-builder edit' } }), { expectedStatus: 403 });
    await capture('price tampering', () => request(base, '/v1/builder/projects', { method: 'POST', auth: owner, body: { slug: 'security-negative-price', name: 'Price Tamper', intent: 'DRAFT', price: -1 } }), { expectedStatus: 400, expectedCode: 'INVALID_USDG_PRICE' });
    await capture('supply tampering', () => request(base, '/v1/builder/projects', { method: 'POST', auth: owner, body: { slug: 'security-negative-supply', name: 'Supply Tamper', intent: 'DRAFT', supply: 0 } }), { expectedStatus: 400, expectedCode: 'INVALID_SUPPLY' });

    const wrongMintCalldata = buildProtocolCalldata('MINT', { edition: wrongEdition, termsVersionHash: `0x${'aa'.repeat(32)}`, recipient: attackerWallet.address, quantity: 1, advantageConfigs: [] }, { walletAddress: attackerWallet.address, idempotencyKey: 'wrong-edition' });
    await capture('minting wrong Edition', () => request(base, '/v1/mints/prepare', { method: 'POST', auth: attacker, idempotencyKey: 'wrong-edition', body: { intentId: 'wrong-edition', to: mintTarget, calldata: wrongMintCalldata, edition: wrongEdition } }), { expectedStatus: 201, outcome: 'CHAIN_AUTHORITY_DELEGATED' });

    const now = Math.floor(Date.now() / 1000);
    const listing = buildNexMarketsOrder({ ...policy, seller: ownerWallet.address, currentOwner: ownerWallet.address, edition: testEdition, tokenId: 1n, price: 1_000_000n, royaltyBps: 500n, zoneHash: `0x${'77'.repeat(32)}`, startTime: BigInt(now - 60), endTime: BigInt(now + 3600), counter: 1n, salt: 101n });
    store.listingRows.push({ order_hash: listing.orderHash, status: 'ACTIVE', seller_address: ownerWallet.address.toLowerCase(), edition_address: testEdition.toLowerCase(), token_id: '1', zone_hash: listing.order.zoneHash, price_usdg: '1000000', protocol_fee_usdg: '10000', royalty_usdg: '50000', seller_proceeds_usdg: '940000', starts_at: new Date((now - 60) * 1000).toISOString(), expires_at: new Date((now + 3600) * 1000).toISOString() });
    store.passes.push({ editionAddress: testEdition.toLowerCase(), tokenId: '1', ownerAddress: ownerWallet.address.toLowerCase(), advantages: [{ id: `0x${'12'.repeat(32)}`, remaining: 1 }] });

    const wrongSerialOrder = { ...listing.order, offer: [{ ...listing.order.offer[0], identifierOrCriteria: '2' }] };
    await capture('purchasing wrong serial (signed-order mismatch)', () => request(base, '/v1/listings/signed-order', { method: 'POST', auth: owner, body: { orderHash: listing.orderHash, order: wrongSerialOrder, counter: '1', signature: '0x' } }), { expectedStatus: 400, expectedCode: 'ORDER_HASH_MISMATCH' });
    await capture('listing someone else\'s Pass', () => request(base, '/v1/listings/prepare', { method: 'POST', auth: attacker, idempotencyKey: 'someone-elses-pass', body: { seller: ownerWallet.address, currentOwner: ownerWallet.address, edition: testEdition, tokenId: '1', price: '1000000', royaltyBps: '500', zoneHash: `0x${'77'.repeat(32)}`, startTime: String(now - 60), endTime: String(now + 3600) } }), { expectedStatus: 403, expectedCode: 'SELLER_SESSION_MISMATCH' });
    await capture('Advantage use while listed', () => request(base, '/v1/advantages/consume', { method: 'POST', auth: owner, idempotencyKey: 'listed-advantage', body: { intentId: 'listed-advantage', to: policy.transactionTargets.ADVANTAGE_USE, operation: 'CONSUME_QUANTITY', edition: testEdition, tokenId: '1', advantageId: `0x${'12'.repeat(32)}`, amount: 1, useId: `0x${'13'.repeat(32)}` } }), { expectedStatus: 201, outcome: 'CHAIN_AUTHORITY_DELEGATED' });

    const stale = buildNexMarketsOrder({ ...policy, seller: ownerWallet.address, currentOwner: ownerWallet.address, edition: testEdition, tokenId: 2n, price: 1_000_000n, royaltyBps: 500n, zoneHash: `0x${'78'.repeat(32)}`, startTime: BigInt(now - 300), endTime: BigInt(now - 120), counter: 1n, salt: 102n });
    store.listingRows.push({ order_hash: stale.orderHash, status: 'ACTIVE', seller_address: ownerWallet.address.toLowerCase(), edition_address: testEdition.toLowerCase(), token_id: '2', zone_hash: stale.order.zoneHash, price_usdg: '1000000', protocol_fee_usdg: '10000', royalty_usdg: '50000', seller_proceeds_usdg: '940000', starts_at: new Date((now - 300) * 1000).toISOString(), expires_at: new Date((now - 120) * 1000).toISOString() });
    await store.storeSignedOrder({ orderHash: stale.orderHash, order: stale.order, counter: '1', signature: '0x' });
    await capture('stale listing purchase', () => request(base, '/v1/listings/buy', { method: 'POST', auth: attacker, idempotencyKey: 'stale-purchase', body: { orderHash: stale.orderHash } }), { expectedStatus: 409, expectedCode: 'ACTIVE_SIGNED_LISTING_REQUIRED' });

    const wrongPurchase = buildNexMarketsOrder({ ...policy, seller: ownerWallet.address, currentOwner: ownerWallet.address, edition: testEdition, tokenId: 2n, price: 1_000_000n, royaltyBps: 500n, zoneHash: `0x${'79'.repeat(32)}`, startTime: BigInt(now - 60), endTime: BigInt(now + 3600), counter: 1n, salt: 103n });
    store.listingRows.push({ order_hash: wrongPurchase.orderHash, status: 'ACTIVE', seller_address: ownerWallet.address.toLowerCase(), edition_address: testEdition.toLowerCase(), token_id: '1', zone_hash: wrongPurchase.order.zoneHash, price_usdg: '1000000', protocol_fee_usdg: '10000', royalty_usdg: '50000', seller_proceeds_usdg: '940000', starts_at: new Date((now - 60) * 1000).toISOString(), expires_at: new Date((now + 3600) * 1000).toISOString() });
    await store.storeSignedOrder({ orderHash: wrongPurchase.orderHash, order: wrongPurchase.order, counter: '1', signature: '0x' });
    await capture('purchasing a read-model serial mismatch', () => request(base, '/v1/listings/buy', { method: 'POST', auth: attacker, idempotencyKey: 'wrong-serial-purchase', body: { orderHash: wrongPurchase.orderHash } }), { expectedStatus: 400 });

    const question = await request(base, `/v1/builders/${encodeURIComponent(builderA.id)}/questions`, { method: 'POST', auth: questioner, body: { question: 'Can the builder explain this Advantage?' } });
    const questionId = question.body.data?.id;
    await capture('answering another Builder\'s Q&A', () => request(base, `/v1/builder/questions/${encodeURIComponent(questionId)}/answer`, { method: 'POST', auth: attacker, body: { answer: 'Unauthorized answer' } }), { expectedStatus: 404, expectedCode: 'QUESTION_NOT_FOUND' });

    const invalidSignatureWallet = Wallet.createRandom();
    const invalidChallenge = await request(base, '/v1/auth/challenge', { method: 'POST', body: { address: invalidSignatureWallet.address } });
    const invalidSignature = await attackerWallet.signMessage(invalidChallenge.body.message);
    await capture('invalid wallet signature', () => request(base, '/v1/auth/verify', { method: 'POST', body: { nonce: invalidChallenge.body.nonce, signature: invalidSignature } }), { expectedStatus: 400 });

    const replayWallet = Wallet.createRandom();
    const replayChallenge = await request(base, '/v1/auth/challenge', { method: 'POST', body: { address: replayWallet.address } });
    const replaySignature = await replayWallet.signMessage(replayChallenge.body.message);
    const firstReplay = await request(base, '/v1/auth/verify', { method: 'POST', body: { nonce: replayChallenge.body.nonce, signature: replaySignature } });
    await capture('nonce replay', () => request(base, '/v1/auth/verify', { method: 'POST', body: { nonce: replayChallenge.body.nonce, signature: replaySignature } }), { expectedStatus: 400 });

    const expired = await authenticate(base, Wallet.createRandom());
    for (const session of store.sessions.values()) if (session.accountId === expired.accountId) session.expiresAt = 0;
    await capture('expired session', () => request(base, '/v1/me/passes', { auth: expired }), { expectedStatus: 401 });
    await capture('wrong chain', () => request(base, '/v1/me/passes', { auth: owner, network: 'base-sepolia' }), { expectedStatus: 401, expectedCode: 'SESSION_NETWORK_MISMATCH' });

    const duplicateMint = buildProtocolCalldata('MINT', { edition: testEdition, termsVersionHash: `0x${'aa'.repeat(32)}`, recipient: ownerWallet.address, quantity: 1, advantageConfigs: [] }, { walletAddress: ownerWallet.address, idempotencyKey: 'duplicate-submit' });
    const duplicateFirst = await request(base, '/v1/mints/prepare', { method: 'POST', auth: owner, idempotencyKey: 'duplicate-submit', body: { intentId: 'duplicate-submit', to: mintTarget, calldata: duplicateMint } });
    const duplicateSecond = await request(base, '/v1/mints/prepare', { method: 'POST', auth: owner, idempotencyKey: 'duplicate-submit', body: { intentId: 'duplicate-submit', to: mintTarget, calldata: duplicateMint } });
    results.push(resultRecord('duplicate transaction submission', `${duplicateFirst.status}/${duplicateSecond.status}`, duplicateFirst.status === 201 && duplicateSecond.status === 201 && duplicateFirst.body.transaction?.id === duplicateSecond.body.transaction?.id ? 'IDEMPOTENT' : 'FAIL', `transaction ${duplicateFirst.body.transaction?.id ?? 'missing'} reused`));

    // `firstReplay` is intentionally retained as evidence that the first
    // nonce use succeeded; the second use above is the negative test.
    if (firstReplay.status !== 200) results.push(resultRecord('nonce first-use setup', firstReplay.status, 'FAIL', 'initial signed challenge did not establish a replayable nonce'));
  } finally {
    server.close();
  }

  const hardFailures = results.filter((item) => item.outcome === 'FAIL');
  let chainNegative = null;
  try {
    chainNegative = JSON.parse(await readFile(new URL('artifacts/testnet-certification/final-live-chain-negative.json', root), 'utf8'));
    if (chainNegative.status === 'PASS_REVERTED_ONCHAIN') {
      const wrongEditionResult = results.find((item) => item.name === 'minting wrong Edition');
      if (wrongEditionResult) {
        wrongEditionResult.outcome = 'PASS_REVERTED_ONCHAIN';
        wrongEditionResult.status = 'tx status 0';
        wrongEditionResult.code = chainNegative.staticCall?.decodedError ?? 'REVERTED';
        wrongEditionResult.detail = `funded-wallet tx ${chainNegative.transaction?.hash}, block ${chainNegative.transaction?.blockNumber}; known Edition supply ${chainNegative.resultingState?.totalMintedBefore} -> ${chainNegative.resultingState?.totalMintedAfter}`;
      }
    }
  } catch {
    // The API-only audit remains valid before optional live-chain evidence exists.
  }
  const lines = [
    '# Security verification', '',
    `- Status: **${hardFailures.length ? 'FAIL' : 'PASS'}**`,
    '- Executed against the real HTTP API handlers with signed wallet challenges, CSRF headers, session records, Builder memberships, listing projections, and transaction idempotency. No browser state or DevTools mutation was used.',
    '- `CHAIN_AUTHORITY_DELEGATED` cases intentionally test the API prepare boundary: the API cannot claim an on-chain mint/Advantage result, so the actual Edition ownership, listing lock, and Advantage behavior remain contract/RPC certification responsibilities.', '',
    '| Attack / negative test | Result | HTTP / code | Detail |', '|---|---|---|---|',
    ...results.map((item) => `| ${item.name} | ${item.outcome} | ${item.status ?? 'n/a'}${item.code ? ` / ${item.code}` : ''} | ${item.detail} |`), '',
    '## Interpretation', '',
    '- Builder edits, cross-Builder access, malformed economics, serial mismatches, stale listings, Q&A ownership, invalid signatures, nonce replay, expired sessions, wrong-chain sessions, and duplicate submissions are rejected or idempotent at the API boundary.',
    chainNegative?.status === 'PASS_REVERTED_ONCHAIN'
      ? `- Wrong-Edition mint was also submitted by funded wallet \`${chainNegative.wallet}\` and reverted onchain with \`${chainNegative.staticCall?.decodedError ?? 'a controller guard'}\`; receipt \`${chainNegative.transaction?.hash}\` at block ${chainNegative.transaction?.blockNumber}. The known Edition supply remained ${chainNegative.resultingState?.totalMintedBefore} -> ${chainNegative.resultingState?.totalMintedAfter}.`
      : '- Wrong-Edition mint preparation remains delegated to the chain because no funded-wallet receipt artifact is available.',
    '- Advantage preparation while listed remains delegated until an actually listed Pass controlled by an available funded signer exists.',
    '',
    '## Funded-wallet evidence', '',
    chainNegative?.status === 'PASS_REVERTED_ONCHAIN'
      ? '- Machine-readable receipt and before/after state: `artifacts/testnet-certification/final-live-chain-negative.json`.'
      : '- No funded-wallet chain-negative artifact is currently available.', ''
  ];
  await mkdir(new URL('artifacts/verification/', root), { recursive: true });
  await writeFile(reportUrl, `${lines.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({ status: hardFailures.length ? 'FAIL' : 'PASS', total: results.length, failures: hardFailures.length, report: reportUrl.pathname }));
  if (hardFailures.length) process.exitCode = 1;
}

main().catch(async (error) => {
  await mkdir(new URL('artifacts/verification/', root), { recursive: true });
  await writeFile(reportUrl, `# Security verification\n\n- Status: **BLOCKED**\n- Blocker: ${String(error.message).replaceAll('\n', ' ')}\n`, 'utf8');
  console.error(JSON.stringify({ status: 'BLOCKED', error: error.message, report: reportUrl.pathname }));
  process.exitCode = 2;
});
