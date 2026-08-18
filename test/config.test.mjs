import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { validateDeploymentManifest } from '../packages/config/src/deployment-manifest.mjs';
const main=JSON.parse(readFileSync(new URL('../deployments/robinhood-mainnet.bootstrap.json',import.meta.url),'utf8'));
test('mainnet primitive manifest is strict-ready but remains unsigned',()=>{assert.equal(validateDeploymentManifest(main),true);assert.equal(validateDeploymentManifest(main,{strict:true}),true);assert.equal(main.release.signedManifest,false);});
test('mainnet cannot silently enable WETH',()=>{const x=structuredClone(main);x.policy.wethSettlementAllowed=true;assert.throws(()=>validateDeploymentManifest(x));});
