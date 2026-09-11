import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';
import { S3ObjectStorage, createObjectStorageFromEnv } from '../apps/api/src/object-storage.mjs';
import { inspectImageBytes, MEDIA_POLICY } from '../packages/domain/src/index.mjs';

function pngHeader(width = 64, height = 64) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

async function authenticate(base, wallet) {
  const challengeResponse = await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ address: wallet.address }) });
  const challenge = await challengeResponse.json();
  const signature = await wallet.signMessage(challenge.message);
  const verifyResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ nonce: challenge.nonce, signature }) });
  const verified = await verifyResponse.json();
  return { cookie: verifyResponse.headers.get('set-cookie').split(';')[0], csrf: verified.csrfToken };
}

test('S3/R2 upload URLs bind object, content type and checksum without exposing credentials', async () => {
  const storage = new S3ObjectStorage({
    endpoint: 'https://account.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'nexmarkets',
    accessKeyId: 'ACCESS123',
    secretAccessKey: 'secret-value',
    now: () => new Date('2026-09-08T12:00:00.000Z')
  });
  const upload = await storage.prepareUpload({ key: 'acct/one.png', mimeType: 'image/png', byteSize: 24, sha256: 'a'.repeat(64) });
  const parsed = new URL(upload.url);
  assert.equal(parsed.pathname, '/nexmarkets/acct/one.png');
  assert.equal(parsed.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(parsed.searchParams.get('X-Amz-Expires'), '900');
  assert.equal(parsed.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host;x-amz-meta-sha256');
  assert.match(parsed.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
  assert.equal(upload.headers['x-amz-meta-sha256'], 'a'.repeat(64));
  assert.doesNotMatch(upload.url, /secret-value/);
  const changed = await storage.prepareUpload({ key: 'acct/one.png', mimeType: 'image/webp', byteSize: 24, sha256: 'a'.repeat(64) });
  assert.notEqual(new URL(changed.url).searchParams.get('X-Amz-Signature'), parsed.searchParams.get('X-Amz-Signature'));
  assert.equal(createObjectStorageFromEnv({}), null);
  assert.throws(() => createObjectStorageFromEnv({ OBJECT_STORAGE_BUCKET: 'partial' }), /CONFIGURATION_INCOMPLETE/);
  const r2FromEnv = createObjectStorageFromEnv({ OBJECT_STORAGE_ENDPOINT: 'https://account.r2.cloudflarestorage.com', OBJECT_STORAGE_BUCKET: 'nexmarkets', OBJECT_STORAGE_ACCESS_KEY_ID: 'ACCESS123', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-value', OBJECT_STORAGE_SESSION_TOKEN: 'cfat_cloudflare_api_token' });
  assert.equal(r2FromEnv.region, 'auto');
  assert.equal(r2FromEnv.sessionToken, '');
  const stsFromEnv = createObjectStorageFromEnv({ OBJECT_STORAGE_ENDPOINT: 'https://s3.example.test', OBJECT_STORAGE_REGION: 'us-east-1', OBJECT_STORAGE_BUCKET: 'nexmarkets', OBJECT_STORAGE_ACCESS_KEY_ID: 'ACCESS123', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret-value', OBJECT_STORAGE_SESSION_TOKEN: 'aws-sts-token' });
  assert.equal(stsFromEnv.sessionToken, 'aws-sts-token');
});

test('image inspection verifies MIME, dimensions and checksum from object bytes', () => {
  assert.equal(MEDIA_POLICY.maxBytes, 3 * 1024 * 1024);
  const bytes = pngHeader(512, 384);
  const inspected = inspectImageBytes({ bytes, mimeType: 'image/png' });
  assert.equal(inspected.width, 512);
  assert.equal(inspected.height, 384);
  assert.equal(inspected.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => inspectImageBytes({ bytes, mimeType: 'image/jpeg' }), /MIME_CONTENT_MISMATCH/);
  assert.throws(() => inspectImageBytes({ bytes: pngHeader(16, 16), mimeType: 'image/png' }), /INVALID_IMAGE_DIMENSIONS/);
  assert.throws(() => inspectImageBytes({ bytes: new Uint8Array(3 * 1024 * 1024 + 1), mimeType: 'image/png' }), /INVALID_MEDIA_SIZE/);
});

test('media upload completion verifies stored bytes before exposing a stable public asset URL', async (t) => {
  const bytes = pngHeader(512, 512);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const storage = {
    async prepareUpload({ key, mimeType, sha256 }) { return { method: 'PUT', key, url: 'https://upload.example/signed', headers: { 'content-type': mimeType, 'x-amz-meta-sha256': sha256 }, expiresInSeconds: 900 }; },
    async readObject() { return { bytes, contentType: 'image/png', metadataChecksum: checksum }; },
    async prepareDownload() { return { method: 'GET', url: 'https://download.example/signed', expiresInSeconds: 300 }; }
  };
  const store = new MemoryStore();
  const server = createApiServer({ store, storage, allowedOrigin: 'https://nexmarkets.fun', secureCookies: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = await authenticate(base, Wallet.createRandom());
  const headers = { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const preparedResponse = await fetch(`${base}/v1/media/uploads`, { method: 'POST', headers, body: JSON.stringify({ filename: 'edition.png', mimeType: 'image/png', byteSize: bytes.length, sha256: checksum }) });
  assert.equal(preparedResponse.status, 201);
  const oversizedResponse = await fetch(`${base}/v1/media/uploads`, { method: 'POST', headers, body: JSON.stringify({ filename: 'edition.png', mimeType: 'image/png', byteSize: 3 * 1024 * 1024 + 1, sha256: checksum }) });
  assert.equal(oversizedResponse.status, 400);
  const prepared = (await preparedResponse.json()).data;
  assert.equal(prepared.asset.safetyStatus, 'PENDING');
  assert.equal(prepared.upload.method, 'PUT');
  const completeResponse = await fetch(`${base}/v1/media/${prepared.asset.id}/complete`, { method: 'POST', headers, body: '{}' });
  assert.equal(completeResponse.status, 200);
  const completed = (await completeResponse.json()).data.asset;
  assert.equal(completed.safetyStatus, 'APPROVED');
  assert.equal(completed.width, 512);
  assert.equal(completed.height, 512);
  assert.equal(completed.url, `/v1/media/${prepared.asset.id}/content`);
  const content = await fetch(`${base}${completed.url}`, { redirect: 'manual', headers: { origin: 'https://nexmarkets.fun' } });
  assert.equal(content.status, 307);
  assert.equal(content.headers.get('location'), 'https://download.example/signed');
});
