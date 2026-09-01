export default function handler(req, res) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'api', version: 'v1' }));
}
