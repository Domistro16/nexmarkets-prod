import http from 'node:http';
const port = Number(process.env.PORT || 4010);
const server = http.createServer((req,res)=>{
  if (req.url === '/healthz') { res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({status:'ok',service:'api',phase:'0/1'})); return; }
  res.writeHead(404,{'content-type':'application/json'}); res.end(JSON.stringify({error:'NOT_FOUND'}));
});
server.listen(port,()=>console.log(`NexMarkets API bootstrap listening on ${port}`));
