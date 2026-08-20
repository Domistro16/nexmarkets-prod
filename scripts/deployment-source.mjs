import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const FROZEN_V1_DEPLOYMENT_SOURCE =
  '8790b635ba55512e5d0e295fb1217a3993ecdafb';

// Keccak hashes of the ten creation bytecode blobs built from the frozen V1
// source. Constructor arguments are deliberately excluded: those vary by
// network/input, while this check catches stale or tampered generated output.
export const FROZEN_V1_CREATION_BYTECODE_HASHES = Object.freeze({
  NexLaunchRegistry: '0x6bd9e06cd9b8367130895c878e7af973035407da4ca395cf5a2c4e2794c11e3d',
  NexMintController: '0x3671900b566c8bc06917a35e51e1d21825342b2f85940c1394409237b74623a1',
  NexPassFactory: '0x17bcd8933f91fd475f63922fccdc30fd7a7661cd75f45ac4758b8fcc2e10f4dd',
  NexAdvantageRegistry: '0xc2021e5c75e7a44e03309851c9cbefc2d27eb8599861e978f7ad407155f6db84',
  NexAdvantageInitializer: '0x7e45d64bba715e1a5f45c0e555df092582235c533c4a5b2e29aa7438c573104e',
  NexRoyaltyVault: '0xfcb216d8996137cbc4fb1e38be57ef7fbc54f04b105843ce8565d4b982c0b14a',
  NexListingRegistry: '0x71a6dbe7266f45207a90f120a62d690faa0b061b2c5a162a5f0df1b11e36488c',
  NexMarketsZone: '0x15a73614c95ff3c51e2bc515e917242784969f902116d066bd491e41b0d510a9',
  NexPassAccount: '0x6c2b92672320f13d489e0ada61a3074f8e151ce08c914d3ac2593b643038c77c',
  NexTBAResolver: '0x299fcda63aebc077996220068f7fabbc272788d31652e3ab1c908b0da1d2803d'
});

// These are the inputs that can alter the compiled V1 deployment bytecode or
// its pinned compiler/dependency selection. Release evidence, manifests and
// generated plans are intentionally outside this set.
const FIXED_INPUTS = [
  'packages/contracts/foundry.toml',
  'packages/contracts/remappings.txt',
  '.github/workflows/contracts-ci.yml'
];

function asPath(repoRoot) {
  return repoRoot instanceof URL ? fileURLToPath(repoRoot) : repoRoot;
}

function git(repoRoot, args, { trim = true } = {}) {
  const output = execFileSync('git', args, {
    cwd: asPath(repoRoot),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  return trim ? output.trim() : output;
}

function normalize(content) {
  return String(content).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function sha256(content) {
  return createHash('sha256').update(normalize(content)).digest('hex');
}

function walk(directory, relativeRoot, result) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.join(relativeRoot, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) walk(absolute, relative, result);
    else if (entry.isFile()) result.add(relative);
  }
}

function sourcePathsAtCommit(repoRoot, sourceCommit) {
  const paths = git(repoRoot, [
    'ls-tree', '-r', '--name-only', sourceCommit, '--',
    'packages/contracts/src', ...FIXED_INPUTS
  ]).split(/\r?\n/).filter(Boolean);
  return new Set(paths);
}

function currentSourcePaths(repoRoot, frozenPaths) {
  const root = asPath(repoRoot);
  const paths = new Set(frozenPaths);
  walk(path.join(root, 'packages', 'contracts', 'src'), 'packages/contracts/src', paths);
  for (const relative of FIXED_INPUTS) {
    if (existsSync(path.join(root, relative))) paths.add(relative);
  }
  return paths;
}

function workflowDependencyConfig(content) {
  // The workflow also contains release invocation commands. Only retain the
  // pinned action/toolchain/dependency lines that can affect a Solidity build,
  // so adding an explicit frozen-source argument does not look like a bytecode
  // source change while a dependency revision change still fails closed.
  return normalize(content).split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed.includes('actions/checkout@') ||
      trimmed.includes('foundry-rs/foundry-toolchain@') ||
      trimmed.includes('actions/setup-node@') ||
      trimmed.includes('install_repo') ||
      trimmed.includes('github.com/') ||
      trimmed.startsWith('version:');
  }).join('\n');
}

function contentForPath(repoRoot, relative, sourceCommit, frozen) {
  const root = asPath(repoRoot);
  if (frozen) {
    try {
      const content = git(repoRoot, ['show', `${sourceCommit}:${relative}`], { trim: false });
      return relative === '.github/workflows/contracts-ci.yml'
        ? workflowDependencyConfig(content)
        : normalize(content);
    } catch {
      return null;
    }
  }
  const absolute = path.join(root, relative);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return null;
  const content = readFileSync(absolute, 'utf8');
  return relative === '.github/workflows/contracts-ci.yml'
    ? workflowDependencyConfig(content)
    : normalize(content);
}

export function resolveDeploymentSourceCommit({
  explicit,
  environment = process.env,
  repoRoot = new URL('../', import.meta.url)
} = {}) {
  const requested = explicit ?? environment.NEXMARKETS_DEPLOYMENT_SOURCE_COMMIT;
  if (!requested) throw new Error('DEPLOYMENT_SOURCE_COMMIT_REQUIRED');
  if (!/^[0-9a-f]{40}$/i.test(requested)) {
    throw new Error('DEPLOYMENT_SOURCE_COMMIT_INVALID');
  }
  const resolved = git(repoRoot, ['rev-parse', `${requested}^{commit}`]).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(resolved)) throw new Error('DEPLOYMENT_SOURCE_COMMIT_INVALID');
  return resolved;
}

export function currentGitCommit(repoRoot = new URL('../', import.meta.url)) {
  return git(repoRoot, ['rev-parse', 'HEAD']).toLowerCase();
}

export function compareDeploymentSource(sourceCommit, {
  repoRoot = new URL('../', import.meta.url),
  currentOverrides = {}
} = {}) {
  const frozenPaths = sourcePathsAtCommit(repoRoot, sourceCommit);
  const currentPaths = currentSourcePaths(repoRoot, frozenPaths);
  const allPaths = [...new Set([...frozenPaths, ...currentPaths])].sort();
  const differences = [];
  const frozenHashes = {};
  const currentHashes = {};
  for (const relative of allPaths) {
    const frozenContent = contentForPath(repoRoot, relative, sourceCommit, true);
    const currentContent = Object.prototype.hasOwnProperty.call(currentOverrides, relative)
      ? currentOverrides[relative]
      : contentForPath(repoRoot, relative, sourceCommit, false);
    const frozenHash = frozenContent === null ? null : sha256(frozenContent);
    const currentHash = currentContent === null ? null : sha256(currentContent);
    frozenHashes[relative] = frozenHash;
    currentHashes[relative] = currentHash;
    if (frozenHash !== currentHash) {
      differences.push({
        path: relative,
        frozenSha256: frozenHash,
        currentSha256: currentHash,
        reason: frozenHash === null ? 'added' : currentHash === null ? 'removed' : 'changed'
      });
    }
  }
  const inputHash = sha256(JSON.stringify({
    files: allPaths.map((pathName) => ({ path: pathName, sha256: currentHashes[pathName] }))
  }));
  return {
    sourceCommit,
    comparedAgainst: currentGitCommit(repoRoot),
    inputHash,
    files: allPaths,
    differences,
    frozenHashes,
    currentHashes
  };
}

export function assertDeploymentSourceMatches(sourceCommit, options = {}) {
  const verification = compareDeploymentSource(sourceCommit, options);
  if (verification.differences.length > 0) {
    throw new Error(`DEPLOYMENT_SOURCE_MISMATCH ${JSON.stringify(verification.differences)}`);
  }
  return verification;
}
