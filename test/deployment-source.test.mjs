import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  FROZEN_V1_DEPLOYMENT_SOURCE,
  assertDeploymentSourceMatches,
  compareDeploymentSource,
  currentGitCommit
} from '../scripts/deployment-source.mjs';
import { assertNoMainnetMock } from '../packages/config/src/env.mjs';

const root = new URL('../', import.meta.url);

test('frozen deployment source matches current deployable inputs despite evidence commits', () => {
  const current = currentGitCommit(root);
  assert.notEqual(current, FROZEN_V1_DEPLOYMENT_SOURCE);
  const verification = assertDeploymentSourceMatches(FROZEN_V1_DEPLOYMENT_SOURCE, { repoRoot: root });
  assert.deepEqual(verification.differences, []);
  assert.ok(verification.inputHash.match(/^[0-9a-f]{64}$/));
});

test('a deployable Solidity source change fails with DEPLOYMENT_SOURCE_MISMATCH', () => {
  const path = 'packages/contracts/src/NexLaunchRegistry.sol';
  const current = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const comparison = compareDeploymentSource(FROZEN_V1_DEPLOYMENT_SOURCE, {
    repoRoot: root,
    currentOverrides: { [path]: `${current}\n// simulated deployable change\n` }
  });
  assert.equal(comparison.differences.length, 1);
  assert.equal(comparison.differences[0].path, path);
  assert.throws(
    () => assertDeploymentSourceMatches(FROZEN_V1_DEPLOYMENT_SOURCE, {
      repoRoot: root,
      currentOverrides: { [path]: `${current}\n// simulated deployable change\n` }
    }),
    /DEPLOYMENT_SOURCE_MISMATCH/
  );
});

test('release planner fails closed when no frozen source commit is supplied', () => {
  const env = { ...process.env };
  delete env.NEXMARKETS_DEPLOYMENT_SOURCE_COMMIT;
  const result = spawnSync(process.execPath, [
    'scripts/plan-v1-deployment.mjs',
    '--mainnet',
    '--inputs=deployments/nexmarkets-v1.inputs.robinhood-mainnet.json'
  ], { cwd: new URL('../', import.meta.url), env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /DEPLOYMENT_SOURCE_COMMIT_REQUIRED/);
});

test('frozen mainnet plan reproduces the reviewed address set and forbids MockUSDG', () => {
  const plan = JSON.parse(readFileSync(new URL('../artifacts/deployment-plan/robinhood-mainnet.json', import.meta.url), 'utf8'));
  const expected = {
    NexLaunchRegistry: '0xD3eB84F0B832747C257bDA424160b3DA12256719',
    NexMintController: '0x528fdeE55A903E3297838f3Fb96854b7e9684A13',
    NexPassFactory: '0x49fa1708e07edbE3b31244c3904C7aBC2e0892f1',
    NexAdvantageRegistry: '0xd015717C8c5bd24C5Ef73815f6fa5dddebD76F57',
    NexAdvantageInitializer: '0x6d82Fc757Ad54A3f7Ab071276A7A2F8Bb77Ee22e',
    NexRoyaltyVault: '0xdFe5327223C865E7107F8D21F73c19da3f1300A4',
    NexListingRegistry: '0x2962B12B8Ca459C19dBf0DDE7b5D066CA83A026B',
    NexMarketsZone: '0x477EC9790C6fd6CC06De79fb185b7F0A7dEbe096',
    NexPassAccount: '0x748203173788e3B55a9B81fb32cBa112d0Ac815e',
    NexTBAResolver: '0x08d70E44047bE7ED4ce5F0B578dAeD913fCf5fAA'
  };
  assert.equal(plan.sourceCommit, FROZEN_V1_DEPLOYMENT_SOURCE);
  for (const [name, address] of Object.entries(expected)) assert.equal(plan.contracts[name].address, address);
  assert.throws(() => assertNoMainnetMock({
    chainId: 4663,
    policy: { settlementAsset: 'MockUSDG' },
    primitives: { usdg: { mock: true } }
  }), /refuses/);
});

