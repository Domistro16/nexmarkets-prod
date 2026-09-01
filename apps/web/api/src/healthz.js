import { getApiListener } from './_server.js';

export default async function handler(req, res) {
  try {
    req.url = '/healthz';
    const listener = await getApiListener();
    return await listener(req, res);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'HEALTHZ_ERROR', message: err.message, stack: err.stack }));
  }
}
