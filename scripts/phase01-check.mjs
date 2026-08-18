import { spawnSync } from 'node:child_process';
const commands=[
  ['node',['--test']],
  ['node',['scripts/verify-config.mjs']],
  ['node',['scripts/verify-product-authority.mjs']],
  ['node',['scripts/verify-primitives.mjs','--network','robinhood-mainnet','--offline','--allow-blocked']]
];
for(const [cmd,args] of commands){
  const r=spawnSync(cmd,args,{stdio:'inherit'}); if(r.status!==0) process.exit(r.status||1);
}
console.log('PHASE 0/1 STATIC CHECK: PASS (runtime RPC gate remains external and fail-closed)');
