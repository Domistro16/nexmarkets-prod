import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Wallet } from 'ethers';

const base = process.env.NEXMARKETS_LIVE_WEB_URL?.trim() || 'http://localhost:4174';
const origin = new URL(base).origin;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!privateKey) throw new Error('LIVE_STORAGE_WALLET_REQUIRED');
const wallet = new Wallet(privateKey);
const bytes = await readFile(new URL('../artifacts/verification/live-assets/nexmarkets-testnet-certification.png', import.meta.url));
const checksum = createHash('sha256').update(bytes).digest('hex');

async function json(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text.slice(0, 500) }; }
}
const challengeResponse = await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ address: wallet.address }) });
const challenge = await json(challengeResponse);
if (challengeResponse.status !== 201) throw new Error(`AUTH_CHALLENGE_${challengeResponse.status}`);
const verifyResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }) });
const verified = await json(verifyResponse);
if (!verifyResponse.ok) throw new Error(`AUTH_VERIFY_${verifyResponse.status}`);
const headers = { origin, cookie: verifyResponse.headers.get('set-cookie')?.split(';')[0] || '', 'x-csrf-token': verified.csrfToken, 'content-type': 'application/json' };
const prepareResponse = await fetch(`${base}/v1/media/uploads`, { method: 'POST', headers, body: JSON.stringify({ filename: 'nexmarkets-testnet-certification.png', mimeType: 'image/png', byteSize: bytes.length, sha256: checksum }) });
const prepared = await json(prepareResponse);
if (!prepareResponse.ok) throw new Error(`MEDIA_PREPARE_${prepareResponse.status}:${prepared.error?.code ?? 'UNKNOWN'}`);
const asset = prepared.data?.asset;
const upload = prepared.data?.upload;
if (!asset?.id) throw new Error('MEDIA_ASSET_ID_REQUIRED');
let put = { status: null, errorCode: null, errorMessage: null };
if (upload) {
  const response = await fetch(upload.url, { method: upload.method || 'PUT', headers: upload.headers, body: bytes });
  const text = await response.text();
  put = { status: response.status, errorCode: text.match(/<Code>([^<]+)<\/Code>/i)?.[1] ?? null, errorMessage: text.match(/<Message>([^<]+)<\/Message>/i)?.[1] ?? null };
  if (!response.ok) throw Object.assign(new Error(`MEDIA_OBJECT_PUT_${response.status}:${put.errorCode ?? 'UNKNOWN'}`), { put, assetId: asset.id });
}
const completeResponse = await fetch(`${base}/v1/media/${encodeURIComponent(asset.id)}/complete`, { method: 'POST', headers, body: '{}' });
const completed = await json(completeResponse);
if (!completeResponse.ok) throw new Error(`MEDIA_COMPLETE_${completeResponse.status}:${completed.error?.code ?? 'UNKNOWN'}`);
const approved = completed.data?.asset;
if (approved?.safetyStatus !== 'APPROVED' || approved?.sha256 !== checksum) throw new Error('MEDIA_APPROVAL_MISMATCH');
const output = { status: 'PASS', wallet: wallet.address, asset: approved, objectPut: put, browserCorsStillRequired: true };
await writeFile(new URL('../artifacts/verification/live-storage-roundtrip.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));

