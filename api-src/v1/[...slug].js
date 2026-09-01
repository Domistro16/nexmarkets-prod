import { getApiListener } from '../_server.js';

export default async function handler(req, res) {
  try {
    // Some Vercel project-level configurations can route the site root into
    // the catch-all function before the filesystem rewrite is evaluated. Keep
    // the API boundary fail-safe: a root request is the web entrypoint, never
    // an API health response. The static asset remains the authoritative page.
    if (req.url === '/' || req.url === '') {
      res.writeHead(307, { location: '/index.html', 'cache-control': 'no-store' });
      return res.end();
    }
    const listener = await getApiListener();
    if (req.url.startsWith('/api/v1/')) {
      req.url = req.url.replace('/api/v1/', '/v1/');
    } else if (req.url === '/api/v1') {
      req.url = '/v1/discover';
    }
    return await listener(req, res);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'V1_ROUTING_ERROR', message: err.message, stack: err.stack }));
  }
}
