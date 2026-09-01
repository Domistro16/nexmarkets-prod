import { getApiListener } from './_server.js';

export default async function handler(req, res) {
  req.url = '/healthz';
  const listener = await getApiListener();
  return listener(req, res);
}
