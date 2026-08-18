import { readFile } from 'node:fs/promises';
import { validateDeploymentManifest } from '../packages/config/src/deployment-manifest.mjs';
for (const path of ['deployments/robinhood-mainnet.bootstrap.json','deployments/robinhood-testnet.bootstrap.json']) {
  const m=JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
  validateDeploymentManifest(m,{strict:false});
  console.log(`PASS ${path}`);
}
