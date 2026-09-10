import { getApiListener } from './_server.js';

export function normalizeV1RequestUrl(req) {
  const incoming = new URL(req.url || '/api/v1', 'http://nexmarkets.local');
  const queryPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : req.query?.path;
  const capturedPath = String(queryPath || incoming.searchParams.get('path') || 'discover')
    .replace(/^\/+|\/+$/g, '');
  incoming.searchParams.delete('path');
  const search = incoming.searchParams.toString();
  return `/v1/${capturedPath}${search ? `?${search}` : ''}`;
}

export default async function handler(req, res) {
  try {
    req.url = normalizeV1RequestUrl(req);
    const listener = await getApiListener();
    return await listener(req, res);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'V1_ROUTING_ERROR', message: err.message, stack: err.stack }));
  }
}
