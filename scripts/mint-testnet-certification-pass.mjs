import { readFile } from 'node:fs/promises';
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getAddress,
  isAddress,
  keccak256,
  randomBytes
} from 'ethers';

const CHAIN_ID = 46630n;
const EDITION = '0x4171d62f43b4168b07a01c04594455dbc3298437';
const REGISTRY = '0xee3c8f330c0b2738201fdb2f1720d06c0d27620d';
const CONTROLLER = '0x0ea6f883808447f115c7b6c037902361c365555a';
const ADVANTAGE_REGISTRY = '0x1e265fee39d75b5211895820926b4ff77b4f1cdd';
const MOCK_USDG = '0x6a4f8832c23c51ba626eba9d50c8f862647c1679';
const DEFAULT_SUBGRAPH = 'https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn';
const CONFIRM = 'I_UNDERSTAND_THIS_SUBMITS_ONE_CERTIFICATION_MINT';

function fail(message) {
  throw new Error(message);
}

function lower(value) {
  return String(value).toLowerCase();
}

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphQuery(endpoint, query, variables = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) fail(`SUBGRAPH_QUERY_FAILED:${body.errors?.[0]?.message ?? response.status}`);
  return body.data ?? {};
}

async function apiGet(endpoint, path) {
  const response = await fetch(`${endpoint.replace(/\/+$/u, '')}${path}`, { headers: { accept: 'application/json' } });
  const body = await response.json();
  if (!response.ok) fail(`API_QUERY_FAILED:${response.status}`);
  return body;
}

const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
const privateKey = process.env.CERTIFICATION_BUYER_PRIVATE_KEY?.trim() ?? process.env.DEPLOYER_PRIVATE_KEY?.trim();
const subgraph = process.env.NEXMARKETS_SUBGRAPH_URL?.trim() || DEFAULT_SUBGRAPH;
const api = process.env.NEXMARKETS_API_URL?.trim();
const broadcast = process.argv.includes('--broadcast');
if (!rpcUrl) fail('Missing RH_TESTNET_RPC_URL.');
if (!privateKey) fail('Missing CERTIFICATION_BUYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY.');
if (!api) fail('Missing NEXMARKETS_API_URL.');

const artifact = JSON.parse(await readFile(new URL('../artifacts/testnet-certification/edition.json', import.meta.url), 'utf8'));
const termsHash = artifact.terms?.termsHash;
const terms = artifact.terms?.terms;
const configs = artifact.terms?.configs;
if (!termsHash || !terms || !Array.isArray(configs)) fail('Certification artifact is incomplete.');
if (lower(artifact.predictedEditionAddress) !== lower(EDITION)) fail('CERTIFICATION_EDITION_ARTIFACT_MISMATCH');
if (Number(terms.mintStartsAt) !== 1_787_348_550) fail('CERTIFICATION_MINT_START_ARTIFACT_MISMATCH');

const provider = new JsonRpcProvider(rpcUrl, Number(CHAIN_ID), { staticNetwork: true });
if ((await provider.getNetwork()).chainId !== CHAIN_ID) fail('RPC_CHAIN_ID_MISMATCH');
const wallet = new Wallet(privateKey, provider);
const recipientRaw = arg('recipient') ?? process.env.CERTIFICATION_BUYER_ADDRESS?.trim() ?? wallet.address;
if (!isAddress(recipientRaw)) fail('Invalid certification recipient.');
const recipient = getAddress(recipientRaw);

const edition = new Contract(EDITION, [
  'function totalMinted() view returns(uint256)',
  'function mintController() view returns(address)',
  'function ownerOf(uint256) view returns(address)',
  'function termsVersionHashOf(uint256) view returns(bytes32)'
], provider);
const registry = new Contract(REGISTRY, [
  'function activeTerms(address) view returns(bytes32,tuple(uint256,uint256,uint64,uint64,uint64,address,address,uint96,bytes32,bytes32))',
  'function isMintOpen(address,bytes32) view returns(bool)'
], provider);
const advantageRegistry = new Contract(ADVANTAGE_REGISTRY, [
  'function hashAdvantages(tuple(bytes32,uint8,uint64,uint64,uint256,bytes32)[]) view returns(bytes32)'
], provider);
const usdg = new Contract(MOCK_USDG, [
  'function balanceOf(address) view returns(uint256)',
  'function allowance(address,address) view returns(uint256)'
], provider);

const latest = await provider.getBlock('latest');
if (!latest) fail('LATEST_BLOCK_UNAVAILABLE');
const chainTimestamp = Number(latest.timestamp);
if (chainTimestamp < Number(terms.mintStartsAt)) {
  fail(`MINT_NOT_OPEN_CHAIN_TIMESTAMP_${chainTimestamp}_STARTS_${terms.mintStartsAt}`);
}

const [minted, controllerAddress, activeHash, isOpen, balance, allowance] = await Promise.all([
  edition.totalMinted(),
  edition.mintController(),
  registry.activeTerms(EDITION).then((value) => value[0]),
  registry.isMintOpen(EDITION, termsHash),
  usdg.balanceOf(wallet.address),
  usdg.allowance(wallet.address, CONTROLLER)
]);
if (BigInt(minted) !== 0n) fail(`CERTIFICATION_EDITION_ALREADY_MINTED:${minted}`);
if (lower(controllerAddress) !== lower(CONTROLLER)) fail('EDITION_CONTROLLER_MISMATCH');
if (lower(activeHash) !== lower(termsHash)) fail('ACTIVE_TERMS_HASH_MISMATCH');
if (!isOpen) fail('MINT_CONTROLLER_REPORTS_CLOSED');
const price = BigInt(terms.pricePerPass);
if (price !== 1_000_000n) fail(`CERTIFICATION_PRICE_UNEXPECTED:${price}`);
if (BigInt(balance) < price) fail(`INSUFFICIENT_MOCK_USDG:${balance}`);
if (BigInt(allowance) < price) fail(`INSUFFICIENT_CONTROLLER_ALLOWANCE:${allowance}`);

const configTuples = configs.map((config) => [
  config.advantageId,
  config.kind,
  config.startsAt,
  config.endsAt,
  config.totalUnits,
  config.definitionHash
]);
const calculatedAdvantagesHash = await advantageRegistry.hashAdvantages(configTuples);
if (lower(calculatedAdvantagesHash) !== lower(terms.advantagesHash)) fail('ADVANTAGE_COMMITMENT_MISMATCH');

// Verify both read paths are available before sending the one irreversible mint.
const [graphEdition, apiEdition] = await Promise.all([
  graphQuery(subgraph, 'query($address:Bytes!){ editions(where:{address:$address}){ address totalMinted currentTerms { hash } } }', { address: lower(EDITION) }),
  apiGet(api, `/v1/editions/${EDITION}`)
]);
if (!graphEdition.editions?.length || lower(graphEdition.editions[0].currentTerms?.hash) !== lower(termsHash)) {
  fail('CERTIFICATION_EDITION_OR_TERMS_NOT_VISIBLE_IN_SUBGRAPH');
}
if (!apiEdition?.data || lower(apiEdition.data.address ?? apiEdition.data.edition_address) !== lower(EDITION)) {
  fail('CERTIFICATION_EDITION_NOT_VISIBLE_IN_API');
}

const controller = new Contract(CONTROLLER, [
  'function mint((address edition,bytes32 termsVersionHash,address recipient,uint256 quantity,bytes32 intentId,address referralHint,(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[] advantageConfigs) request) returns(uint256)'
], wallet);
const intentId = keccak256(randomBytes(32));
if (!broadcast) {
  console.log(JSON.stringify({
    status: 'DRY_RUN_ONLY',
    chainId: Number(CHAIN_ID),
    edition: EDITION,
    termsHash,
    recipient,
    chainTimestamp,
    mintStartsAt: Number(terms.mintStartsAt),
    priceBaseUnits: price.toString(),
    intentId,
    message: 'Preflight passed. Re-run with --broadcast and CERTIFICATION_MINT_CONFIRM to send exactly one mint.'
  }, null, 2));
  process.exit(0);
}
if (process.env.CERTIFICATION_MINT_CONFIRM !== CONFIRM) {
  fail(`Broadcast blocked. Set CERTIFICATION_MINT_CONFIRM=${CONFIRM}.`);
}

const tx = await controller.mint([
  EDITION,
  termsHash,
  recipient,
  1n,
  intentId,
  ZeroAddress,
  configTuples
]);
const receipt = await tx.wait();
if (!receipt || Number(receipt.status) !== 1) fail(`CERTIFICATION_MINT_REVERTED:${tx.hash}`);

const eventInterface = new Interface([
  'event PrimaryMintSettled(address indexed payer,address indexed recipient,address indexed edition,bytes32 termsVersionHash,bytes32 intentId,uint256 firstTokenId,uint256 quantity,uint256 totalPaid,uint256 protocolFee)',
  'event EditionMinted(address indexed to,uint256 indexed firstTokenId,uint256 quantity,bytes32 indexed termsVersionHash,uint256 termsSupply,address royaltyReceiver,uint96 royaltyBps)'
]);
let primaryMint = null;
for (const log of receipt.logs) {
  try {
    const parsed = eventInterface.parseLog(log);
    if (parsed?.name === 'PrimaryMintSettled') primaryMint = parsed;
  } catch {
    // Unrelated logs are expected in the atomic mint transaction.
  }
}
if (!primaryMint) fail('PRIMARY_MINT_EVENT_MISSING');
if (BigInt(primaryMint.args.quantity) !== 1n) fail('MINT_QUANTITY_NOT_ONE');
const tokenId = BigInt(primaryMint.args.firstTokenId);
const rpcOwner = await edition.ownerOf(tokenId);
const rpcTerms = await edition.termsVersionHashOf(tokenId);
if (lower(rpcOwner) !== lower(recipient)) fail('RPC_OWNER_MISMATCH');
if (lower(rpcTerms) !== lower(termsHash)) fail('RPC_TOKEN_TERMS_MISMATCH');

const passId = `${lower(EDITION)}-${tokenId}`;
const passQuery = `query($passId:ID!,$transactionHash:Bytes!){ _meta { block { number hash } } pass(id:$passId){ id tokenId owner termsHash mintBlock mintTransactionHash edition { address } } primaryMints(where:{transactionHash:$transactionHash}){ firstTokenId quantity recipient termsHash transactionHash edition { address } } }`;
let indexed = null;
for (let attempt = 0; attempt < 120; attempt += 1) {
  const data = await graphQuery(subgraph, passQuery, { passId, transactionHash: lower(tx.hash) });
  const pass = data.pass;
  const mint = data.primaryMints?.find((item) => lower(item.transactionHash) === lower(tx.hash));
  if (
    Number(data._meta?.block?.number ?? 0) >= receipt.blockNumber &&
    pass &&
    lower(pass.owner) === lower(recipient) &&
    String(pass.tokenId) === tokenId.toString() &&
    lower(pass.mintTransactionHash) === lower(tx.hash) &&
    lower(pass.termsHash) === lower(termsHash) &&
    mint &&
    String(mint.firstTokenId) === tokenId.toString() &&
    String(mint.quantity) === '1' &&
    lower(mint.recipient) === lower(recipient)
  ) {
    indexed = { block: data._meta.block, pass, mint };
    break;
  }
  await sleep(5_000);
}
if (!indexed) fail('SUBGRAPH_CERTIFICATION_PASS_TIMEOUT');

let apiPass = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const body = await apiGet(api, `/v1/passes/${EDITION}/${tokenId}`);
  const candidate = body?.data;
  if (
    candidate &&
    String(candidate.tokenId) === tokenId.toString() &&
    lower(candidate.owner) === lower(recipient) &&
    lower(candidate.termsHash) === lower(termsHash) &&
    lower(candidate.mintTransactionHash) === lower(tx.hash) &&
    lower(candidate.edition?.address ?? candidate.edition_address) === lower(EDITION)
  ) {
    apiPass = candidate;
    break;
  }
  await sleep(5_000);
}
if (!apiPass) fail('API_CERTIFICATION_PASS_TIMEOUT_OR_MISMATCH');

console.log(JSON.stringify({
  status: 'CERTIFICATION_MINT_RPC_GOLDSKY_API_VERIFIED',
  chainId: Number(CHAIN_ID),
  edition: EDITION,
  termsHash,
  recipient,
  txHash: tx.hash,
  blockNumber: receipt.blockNumber,
  tokenId: tokenId.toString(),
  rpc: { receiptStatus: Number(receipt.status), owner: rpcOwner, termsHash: rpcTerms },
  goldsky: { indexedBlock: indexed.block.number, owner: indexed.pass.owner, tokenId: indexed.pass.tokenId, mintTransactionHash: indexed.pass.mintTransactionHash },
  api: { owner: apiPass.owner, tokenId: apiPass.tokenId, mintTransactionHash: apiPass.mintTransactionHash }
}, null, 2));
