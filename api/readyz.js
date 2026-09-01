import { getApiListener } from './_server.js';

export default async function handler(req, res) {
  req.url = '/readyz';
  const listener = await getApiListener();
  return listener(req, res);
}
