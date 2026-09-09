import { createHash, createHmac } from 'node:crypto';

const CONFIRM = 'I_UNDERSTAND_THIS_UPDATES_THE_NEXMARKETS_R2_BUCKET_CORS_POLICY';
const endpointRaw = process.env.OBJECT_STORAGE_ENDPOINT?.trim();
const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();
const omitSessionToken = process.argv.includes('--omit-session-token');
const configuredSessionToken = process.env.OBJECT_STORAGE_SESSION_TOKEN?.trim();
const sessionToken = omitSessionToken || /^cfat_/i.test(configuredSessionToken || '') ? '' : configuredSessionToken;
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || configuredSessionToken;
const regionArg = process.argv.find((value) => value.startsWith('--region='))?.slice('--region='.length);
const region = regionArg || process.env.OBJECT_STORAGE_REGION?.trim() || 'auto';
if (!endpointRaw || !bucket || !accessKeyId || !secretAccessKey) throw new Error('R2_CORS_CREDENTIALS_REQUIRED');

const endpoint = new URL(endpointRaw);
const accountId = endpoint.hostname.split('.')[0];
const shortHash = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encodePath = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const canonicalUri = `/${[...endpoint.pathname.split('/').filter(Boolean), bucket].map(encodePath).join('/')}`;

function signingKey(date) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

async function request(method, body = '') {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = amzDate.slice(0, 8);
  const payloadHash = shortHash(body);
  const headers = {
    host: endpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  if (sessionToken) headers['x-amz-security-token'] = sessionToken;
  if (body) headers['content-type'] = 'application/xml';
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, canonicalUri, 'cors=', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${shortDate}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, shortHash(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', signingKey(shortDate)).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `${endpoint.origin}${canonicalUri}?cors`;
  const response = await fetch(url, { method, headers: { ...headers, authorization }, body: body || undefined });
  return { status: response.status, ok: response.ok, text: await response.text() };
}

const existing = await request('GET');
const missing = existing.status === 404 || /NoSuchCORSConfiguration/i.test(existing.text);
const hasRules = existing.ok && /<CORSRule>/i.test(existing.text);
if (!process.argv.includes('--apply')) {
  if (process.argv.includes('--cloudflare-api')) {
    if (!cloudflareApiToken) throw new Error('CLOUDFLARE_API_TOKEN_REQUIRED');
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}/cors`, {
      headers: { authorization: `Bearer ${cloudflareApiToken}`, accept: 'application/json' }
    });
    const body = await response.json().catch(() => ({}));
    console.log(JSON.stringify({ status: 'READ_ONLY_CLOUDFLARE_API', accountId, bucket, httpStatus: response.status, success: Boolean(body.success), ruleCount: Array.isArray(body.result?.rules) ? body.result.rules.length : null, errorCodes: Array.isArray(body.errors) ? body.errors.map((item) => item.code) : [] }, null, 2));
    process.exit(response.ok && body.success ? 0 : 2);
  }
  console.log(JSON.stringify({ status: 'READ_ONLY', endpoint: endpoint.host, bucket, region, existingHttpStatus: existing.status, existingPolicy: hasRules ? 'PRESENT' : missing ? 'MISSING' : 'UNEXPECTED_RESPONSE', errorCode: existing.text.match(/<Code>([^<]+)<\/Code>/i)?.[1] ?? null, errorMessage: existing.text.match(/<Message>([^<]+)<\/Message>/i)?.[1] ?? null }, null, 2));
  process.exit(existing.ok || missing ? 0 : 2);
}
if (process.env.R2_CORS_CONFIRM !== CONFIRM) throw new Error(`Set R2_CORS_CONFIRM=${CONFIRM}`);
if (hasRules && !process.argv.includes('--replace-existing')) throw new Error('R2_CORS_POLICY_ALREADY_EXISTS_REVIEW_BEFORE_REPLACEMENT');

const origins = ['http://localhost:4174', 'http://127.0.0.1:4174', 'https://nexmarkets.fun', 'https://www.nexmarkets.fun'];
if (process.argv.includes('--cloudflare-api')) {
  if (!cloudflareApiToken) throw new Error('CLOUDFLARE_API_TOKEN_REQUIRED');
  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}/cors`;
  const priorResponse = await fetch(apiUrl, { headers: { authorization: `Bearer ${cloudflareApiToken}`, accept: 'application/json' } });
  const prior = await priorResponse.json().catch(() => ({}));
  if (Array.isArray(prior.result?.rules) && prior.result.rules.length && !process.argv.includes('--replace-existing')) throw new Error('R2_CORS_POLICY_ALREADY_EXISTS_REVIEW_BEFORE_REPLACEMENT');
  const rules = [{ id: 'nexmarkets-browser-upload', allowed: { origins, methods: ['GET', 'PUT', 'HEAD'], headers: ['content-type', 'x-amz-meta-sha256'] }, exposeHeaders: ['etag', 'content-length', 'content-type', 'x-amz-meta-sha256'], maxAgeSeconds: 3600 }];
  const response = await fetch(apiUrl, { method: 'PUT', headers: { authorization: `Bearer ${cloudflareApiToken}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ rules }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(`R2_CORS_API_UPDATE_FAILED:${response.status}:${JSON.stringify(body.errors ?? []).slice(0, 300)}`);
  console.log(JSON.stringify({ status: 'PASS', authority: 'Cloudflare API', accountId, bucket, updateHttpStatus: response.status, origins, methods: rules[0].allowed.methods, headers: rules[0].allowed.headers }, null, 2));
  process.exit(0);
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">\n<CORSRule>\n<ID>nexmarkets-browser-upload</ID>\n${origins.map((origin) => `<AllowedOrigin>${origin}</AllowedOrigin>`).join('\n')}\n<AllowedMethod>GET</AllowedMethod>\n<AllowedMethod>PUT</AllowedMethod>\n<AllowedMethod>HEAD</AllowedMethod>\n<AllowedHeader>content-type</AllowedHeader>\n<AllowedHeader>x-amz-meta-sha256</AllowedHeader>\n<ExposeHeader>etag</ExposeHeader>\n<ExposeHeader>content-length</ExposeHeader>\n<ExposeHeader>content-type</ExposeHeader>\n<ExposeHeader>x-amz-meta-sha256</ExposeHeader>\n<MaxAgeSeconds>3600</MaxAgeSeconds>\n</CORSRule>\n</CORSConfiguration>`;
const updated = await request('PUT', xml);
if (!updated.ok) throw new Error(`R2_CORS_UPDATE_FAILED:${updated.status}:${updated.text.slice(0, 300)}`);
const verified = await request('GET');
if (!verified.ok || !origins.every((origin) => verified.text.includes(origin))) throw new Error(`R2_CORS_VERIFY_FAILED:${verified.status}`);
console.log(JSON.stringify({ status: 'PASS', endpoint: endpoint.host, bucket, region, updateHttpStatus: updated.status, verifyHttpStatus: verified.status, origins, methods: ['GET', 'PUT', 'HEAD'], headers: ['content-type', 'x-amz-meta-sha256'] }, null, 2));
