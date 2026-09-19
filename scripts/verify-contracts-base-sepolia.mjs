import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const contractsDir = join(root, 'packages', 'contracts');
const planPath = join(root, 'artifacts', 'deployment-plan', 'base-sepolia.json');
const manifestPath = join(root, 'deployments', 'base-sepolia.v1-deployment.json');

function findForge() {
  const candidates = [
    'forge',
    join(homedir(), '.foundry', 'bin', 'forge.exe'),
    join(homedir(), '.foundry', 'bin', 'forge'),
    '/usr/local/bin/forge'
  ];
  for (const candidate of candidates) {
    try {
      const res = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
      if (res.status === 0) return candidate;
    } catch {}
  }
  return null;
}

const CONTRACT_FILES = {
  NexLaunchRegistry: 'src/NexLaunchRegistry.sol:NexLaunchRegistry',
  NexMintController: 'src/NexMintController.sol:NexMintController',
  NexPassFactory: 'src/NexPassFactory.sol:NexPassFactory',
  NexAdvantageRegistry: 'src/NexAdvantageRegistry.sol:NexAdvantageRegistry',
  NexAdvantageInitializer: 'src/NexAdvantageInitializer.sol:NexAdvantageInitializer',
  NexRoyaltyVault: 'src/NexRoyaltyVault.sol:NexRoyaltyVault',
  NexListingRegistry: 'src/NexListingRegistry.sol:NexListingRegistry',
  NexMarketsZone: 'src/NexMarketsZone.sol:NexMarketsZone',
  NexPassAccount: 'src/erc6551/NexPassAccount.sol:NexPassAccount',
  NexTBAResolver: 'src/NexTBAResolver.sol:NexTBAResolver',
  NexRewardDistributor: 'src/NexRewardDistributor.sol:NexRewardDistributor'
};

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const forge = findForge();

if (!forge) {
  console.error('Foundry forge not found. Please install foundry or ensure it is in ~/.foundry/bin');
  process.exit(1);
}

const args = process.argv.slice(2);
const apiKeyArg = args.find((a) => a.startsWith('--api-key='));
const apiKey = (apiKeyArg ? apiKeyArg.slice(10) : (process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || '')).trim();
const doFlatten = args.includes('--flatten');

const contracts = [];
for (const [name, target] of Object.entries(CONTRACT_FILES)) {
  const planContract = plan.contracts[name];
  const manifestContract = manifest.contracts[name];
  const address = manifestContract?.address || planContract?.address;
  if (!address) continue;

  const artifactPath = join(contractsDir, 'out', target.split(':')[0].replace('src/', '').replace('erc6551/', ''), `${name}.json`);
  let constructorArgs = '';
  if (existsSync(artifactPath)) {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    const bytecode = artifact.bytecode?.object || '';
    const initCode = planContract.initCode;
    if (initCode.startsWith(bytecode)) {
      constructorArgs = initCode.slice(bytecode.length);
    }
  }

  contracts.push({
    name,
    address,
    target,
    sourceFile: target.split(':')[0],
    constructorArgs: constructorArgs ? `0x${constructorArgs}` : '',
    basescanUrl: `https://sepolia.basescan.org/address/${address}`
  });
}

if (doFlatten) {
  const flattenedDir = join(root, 'deployments', 'flattened', 'base-sepolia');
  mkdirSync(flattenedDir, { recursive: true });
  console.log(`\nGenerating flattened source files in ${flattenedDir}...`);
  for (const c of contracts) {
    const outFile = join(flattenedDir, `${c.name}.flat.sol`);
    try {
      execSync(`"${forge}" flatten ${c.sourceFile} --output "${outFile}"`, { cwd: contractsDir, stdio: 'pipe' });
      console.log(`✔ Flattened: ${c.name} -> deployments/flattened/base-sepolia/${c.name}.flat.sol`);
    } catch (err) {
      console.error(`✖ Failed to flatten ${c.name}: ${err.message}`);
    }
  }
}

console.log('\n================================================================================');
console.log('              NEXMARKETS BASE SEPOLIA CONTRACT VERIFICATION                     ');
console.log('================================================================================');
console.log(`Network:          Base Sepolia (Chain ID: 84532)`);
console.log(`Compiler Version: 0.8.30+commit.73712a01`);
console.log(`Optimization:     Yes (runs: 20000)`);
console.log(`EVM Version:      osaka`);
console.log('--------------------------------------------------------------------------------');

for (const c of contracts) {
  console.log(`Contract:         ${c.name}`);
  console.log(`Address:          ${c.address}`);
  console.log(`Basescan:         ${c.basescanUrl}`);
  console.log(`Constructor Args: ${c.constructorArgs || '(none)'}`);
  console.log('--------------------------------------------------------------------------------');
}

if (!apiKey) {
  console.log('\n[!] NO BASESCAN/ETHERSCAN API KEY PROVIDED.');
  console.log('To automatically verify all 11 contracts on Base Sepolia in one command, run:');
  console.log('  node scripts/verify-contracts-base-sepolia.mjs --api-key=<YOUR_BASESCAN_API_KEY>\n');
  console.log('Or set BASESCAN_API_KEY in your .env or environment.\n');
  console.log('You can get a free API key in 30 seconds at: https://basescan.org/myapikey (or https://etherscan.io/myapikey)');
  process.exit(0);
}

console.log(`\n[>] Starting automated verification using Basescan API key...`);
for (const c of contracts) {
  console.log(`\nVerifying ${c.name} (${c.address})...`);
  const verifyArgs = [
    'verify-contract',
    c.address,
    c.target,
    '--chain',
    'base-sepolia',
    '--etherscan-api-key',
    apiKey,
    '--watch'
  ];
  if (c.constructorArgs) {
    verifyArgs.push('--constructor-args', c.constructorArgs);
  }

  try {
    const res = spawnSync(forge, verifyArgs, { cwd: contractsDir, encoding: 'utf8', stdio: 'inherit' });
    if (res.status === 0) {
      console.log(`✔ Verified ${c.name} successfully!`);
    } else {
      console.warn(`▲ Verification call for ${c.name} returned status ${res.status}`);
    }
  } catch (err) {
    console.error(`✖ Error verifying ${c.name}: ${err.message}`);
  }
}
