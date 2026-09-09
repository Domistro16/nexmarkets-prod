import { createHash, createHmac } from 'node:crypto';

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding = undefined) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function encode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function objectPath(endpoint, bucket, key) {
  const prefix = endpoint.pathname.split('/').filter(Boolean).map((part) => encode(decodeURIComponent(part)));
  return `/${[...prefix, encode(bucket), ...String(key).split('/').filter(Boolean).map(encode)].join('/')}`;
}

function timestamp(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalQuery(entries) {
  return entries
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function signingKey(secret, shortDate, region) {
  const dateKey = hmac(`AWS4${secret}`, shortDate);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, 'aws4_request');
}

export class S3ObjectStorage {
  constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey, sessionToken = '', expiresInSeconds = 900, now = () => new Date() }) {
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) throw new Error('OBJECT_STORAGE_CONFIGURATION_INCOMPLETE');
    this.endpoint = new URL(endpoint);
    if (this.endpoint.protocol !== 'https:' && this.endpoint.hostname !== '127.0.0.1' && this.endpoint.hostname !== 'localhost') throw new Error('OBJECT_STORAGE_HTTPS_REQUIRED');
    this.region = region;
    this.bucket = bucket;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.sessionToken = sessionToken;
    this.expiresInSeconds = Math.max(1, Math.min(900, Number(expiresInSeconds) || 900));
    this.now = now;
  }

  presign({ method, key, headers = {}, expiresInSeconds = this.expiresInSeconds }) {
    if (!/^(GET|PUT|HEAD)$/.test(method)) throw new Error('OBJECT_STORAGE_METHOD_UNSUPPORTED');
    if (!key || String(key).includes('..')) throw new Error('OBJECT_STORAGE_KEY_INVALID');
    const date = this.now();
    const amzDate = timestamp(date);
    const shortDate = amzDate.slice(0, 8);
    const scope = `${shortDate}/${this.region}/${SERVICE}/aws4_request`;
    const normalizedHeaders = Object.fromEntries(Object.entries({ host: this.endpoint.host, ...headers }).map(([name, value]) => [name.toLowerCase(), String(value).trim().replace(/\s+/g, ' ')]));
    const signedHeaders = Object.keys(normalizedHeaders).sort().join(';');
    const canonicalHeaders = Object.keys(normalizedHeaders).sort().map((name) => `${name}:${normalizedHeaders[name]}\n`).join('');
    const query = [
      ['X-Amz-Algorithm', ALGORITHM],
      ['X-Amz-Content-Sha256', UNSIGNED_PAYLOAD],
      ['X-Amz-Credential', `${this.accessKeyId}/${scope}`],
      ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', String(Math.max(1, Math.min(900, Number(expiresInSeconds) || this.expiresInSeconds)))],
      ['X-Amz-SignedHeaders', signedHeaders]
    ];
    if (this.sessionToken) query.push(['X-Amz-Security-Token', this.sessionToken]);
    const canonical = canonicalQuery(query);
    const path = objectPath(this.endpoint, this.bucket, key);
    const canonicalRequest = [method, path, canonical, canonicalHeaders, signedHeaders, UNSIGNED_PAYLOAD].join('\n');
    const stringToSign = [ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join('\n');
    const signature = hmac(signingKey(this.secretAccessKey, shortDate, this.region), stringToSign, 'hex');
    return `${this.endpoint.origin}${path}?${canonical}&X-Amz-Signature=${signature}`;
  }

  async prepareUpload({ key, mimeType, byteSize, sha256: checksum }) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(mimeType ?? '') || !Number.isInteger(byteSize) || byteSize <= 0 || !/^[0-9a-f]{64}$/.test(checksum ?? '')) throw new Error('INVALID_MEDIA');
    const headers = { 'content-type': mimeType, 'x-amz-meta-sha256': checksum };
    return {
      method: 'PUT',
      key,
      url: this.presign({ method: 'PUT', key, headers }),
      headers,
      expiresInSeconds: this.expiresInSeconds
    };
  }

  async prepareDownload({ key, expiresInSeconds = 300 }) {
    return { method: 'GET', key, url: this.presign({ method: 'GET', key, expiresInSeconds }), expiresInSeconds };
  }

  async readObject({ key, maxBytes }) {
    const download = await this.prepareDownload({ key, expiresInSeconds: 60 });
    const response = await fetch(download.url, { method: 'GET', redirect: 'error' });
    if (!response.ok) throw Object.assign(new Error('MEDIA_OBJECT_UNAVAILABLE'), { status: 502 });
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) throw Object.assign(new Error('MEDIA_TOO_LARGE'), { status: 400 });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) throw Object.assign(new Error('MEDIA_TOO_LARGE'), { status: 400 });
    return { bytes, contentType: response.headers.get('content-type') || '', metadataChecksum: response.headers.get('x-amz-meta-sha256') || '' };
  }
}

export function createObjectStorageFromEnv(env = process.env) {
  const bucket = String(env.OBJECT_STORAGE_BUCKET || '').trim();
  const configuredEndpoint = String(env.OBJECT_STORAGE_ENDPOINT || '').trim();
  const region = String(env.OBJECT_STORAGE_REGION || (/r2\.cloudflarestorage\.com$/i.test(new URL(configuredEndpoint || 'https://invalid').hostname) ? 'auto' : '')).trim();
  const accessKeyId = String(env.OBJECT_STORAGE_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '').trim();
  const configured = [bucket, region, accessKeyId, secretAccessKey].filter(Boolean).length;
  if (!configured) return null;
  if (configured !== 4) throw new Error('OBJECT_STORAGE_CONFIGURATION_INCOMPLETE');
  const endpoint = configuredEndpoint || `https://s3.${region}.amazonaws.com`;
  // Cloudflare API tokens (cfat_...) are not AWS temporary credentials and
  // must never be emitted as X-Amz-Security-Token on R2 presigned URLs.
  const configuredSessionToken = String(env.OBJECT_STORAGE_SESSION_TOKEN || '').trim();
  const sessionToken = /^cfat_/i.test(configuredSessionToken) ? '' : configuredSessionToken;
  return new S3ObjectStorage({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiresInSeconds: Number(env.OBJECT_STORAGE_UPLOAD_TTL_SECONDS || 900)
  });
}
