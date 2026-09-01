import { getApiListener } from '../_server.js';

export default async function handler(req, res) {
  const listener = await getApiListener();
  if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/v1/');
  } else if (req.url === '/api/v1') {
    req.url = '/v1/discover';
  }
  return listener(req, res);
}
