import { getApiListener } from './_server.js';

export default async function handler(req, res) {
  const listener = await getApiListener();
  if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
  return listener(req, res);
}
