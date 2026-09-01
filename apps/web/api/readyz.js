export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ status: 'ready', database: 'ok', indexer: 'not-required', version: 'v1' }));
}
