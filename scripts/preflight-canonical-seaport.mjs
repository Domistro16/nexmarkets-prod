import { NETWORKS, PRIMITIVES } from '../packages/config/src/networks.mjs';
import { JsonRpcClient, keccak256Hex } from '../packages/chain/src/index.mjs';
const key=process.argv[2] || 'robinhood-mainnet'; const n=NETWORKS[key]; if(!n) throw new Error(`Unknown network ${key}`);
const rpc=new JsonRpcClient(process.env[n.rpcEnv] || n.defaultRpc);
const addresses={
  seaport16:PRIMITIVES.seaport16,
  conduitController:PRIMITIVES.conduitController,
  immutableCreate2Factory:'0x0000000000ffe8b47b3e2130213b802212439497'
};
const out={network:key,chainIdExpected:n.chainId,observedAt:new Date().toISOString(),checks:{}};
try {
  out.chainIdObserved=await rpc.chainId(); if(out.chainIdObserved!==n.chainId) throw new Error(`Wrong chain id ${out.chainIdObserved}`);
  for(const [name,address] of Object.entries(addresses)){
    const code=await rpc.getCode(address); const empty=code==='0x'||code==='0x0';
    out.checks[name]={address,empty,codeBytes:empty?0:(code.length-2)/2,runtimeCodeHash:empty?null:keccak256Hex(code)};
  }
  const s=out.checks.seaport16,c=out.checks.conduitController,f=out.checks.immutableCreate2Factory;
  out.decision = (!s.empty && !c.empty) ? 'VERIFY_EXISTING_CANONICAL_DEPLOYMENTS' :
    (s.empty && c.empty && !f.empty) ? 'DEPLOY_CONDUIT_THEN_SEAPORT_VIA_EXISTING_CANONICAL_FACTORY' :
    (s.empty && c.empty && f.empty) ? 'SET_UP_CANONICAL_FACTORY_THEN_DEPLOY_CONDUIT_AND_SEAPORT' :
    'STOP_MIXED_OR_UNEXPECTED_STATE_REQUIRES_REVIEW';
  console.log(JSON.stringify(out,null,2));
} catch(err){ console.error(JSON.stringify({...out,status:'BLOCKED',error:err.message},null,2)); process.exitCode=2; }
