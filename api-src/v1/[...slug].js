import { getApiListener } from '../_server.js';

export default async function handler(req, res) {
  try {
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
