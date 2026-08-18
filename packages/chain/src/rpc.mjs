export class JsonRpcClient {
  constructor(url, { timeoutMs = 12000 } = {}) { this.url=url; this.timeoutMs=timeoutMs; this.id=0; }
  async call(method, params=[]) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:++this.id,method,params}), signal:controller.signal });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(`RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`);
      return body.result;
    } finally { clearTimeout(timer); }
  }
  chainId() { return this.call('eth_chainId').then(x=>Number(BigInt(x))); }
  getCode(address, block='latest') { return this.call('eth_getCode',[address,block]); }
  getStorageAt(address, slot, block='latest') { return this.call('eth_getStorageAt',[address,slot,block]); }
  ethCall(to, data, block='latest') { return this.call('eth_call',[{to,data},block]); }
}
