import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { AbiCoder, Interface, concat, getAddress, getCreate2Address, id, isAddress, keccak256, recoverAddress, toUtf8Bytes } from 'ethers';
import { issueSession, issueWalletChallenge, assertChallengeUsable, assertSession, sessionCookie, verifyWalletChallengeSignature } from '@nexmarkets/auth';
import { buildNexMarketsOrder, buildProtocolCalldata, buildSeaportFulfillment, inspectImageBytes, MEDIA_POLICY, seaportOrderHash, seaportTypedData, transitionTransaction, validateAndNormalizeProjectPayload, validateProjectedNexMarketsOrder, verifySeaportOrderSignature } from '@nexmarkets/domain';
import { PostgresStore } from '@nexmarkets/data';
import { MetricsRegistry } from '@nexmarkets/observability';
import { JsonRpcClient } from '@nexmarkets/chain';
import { SubgraphClient } from '@nexmarkets/subgraph-client';
import { networkByKey, productionReadinessFromEnv } from '@nexmarkets/config';
import { createObjectStorageFromEnv } from './object-storage.mjs';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const INTENT_TYPE = Object.freeze({
  '/v1/mints/prepare': 'MINT', '/v1/terms/prepare': 'TERMS_PUBLISH', '/v1/listings/prepare': 'LISTING_CREATE',
  '/v1/listings/cancel': 'LISTING_CANCEL', '/v1/advantages/consume': 'ADVANTAGE_USE',
  '/v1/royalties/withdraw': 'ROYALTY_WITHDRAW'
});
const INTENT_SELECTORS = Object.freeze({
  MINT: [id('mint((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]))').slice(0, 10)],
  TERMS_PUBLISH: [id('publishTerms(address,(uint256,uint256,uint64,uint64,uint64,address,address,uint96,bytes32,bytes32))').slice(0, 10)],
  LISTING_CANCEL: [id('cancelListing(bytes32)').slice(0, 10)],
  ADVANTAGE_USE: [id('consumeQuantity(address,uint256,bytes32,uint256,bytes32)').slice(0, 10), id('redeem(address,uint256,bytes32,bytes32)').slice(0, 10), id('useAmount(address,uint256,bytes32,bytes32)').slice(0, 10)],
  ROYALTY_WITHDRAW: [id('withdraw(bytes32)').slice(0, 10)]
});
const MINT_OPEN_SELECTOR = id('isMintOpen(address,bytes32)').slice(0, 10);
const ADVANTAGES_DOMAIN = keccak256(toUtf8Bytes('NEXMARKETS_ADVANTAGES_V1'));
const ADVANTAGE_TUPLE = 'tuple(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[]';
const FACTORY_CONFIG_TUPLE = 'tuple(string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI)';
const FACTORY_LEGACY_INTERFACE = new Interface([`function createEdition(${FACTORY_CONFIG_TUPLE} config,address publisher,bytes32 salt) returns(address)`]);
const SAFE_EXEC_INTERFACE = new Interface(['function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns(bool)']);
const SAFE_HASH_INTERFACE = new Interface(['function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns(bytes32)']);
const SAFE_NONCE_SELECTOR = '0xaffed0e0';
const SAFE_EXECUTION_SUCCESS_TOPIC = id('ExecutionSuccess(bytes32,uint256)').toLowerCase();
// Event topic hashes use the canonical ABI signature without the `indexed`
// annotations (those annotations describe topics but are not part of the
// keccak input).  Keep this aligned with the deployed Factory topic.
const EDITION_CREATED_TOPIC = id('EditionCreated(address,bytes32,address,bytes32,address,address,uint32,bytes32)').toLowerCase();
const PINNED_CREATION_BYTECODE = "0x60e06040526001600c55348015610014575f5ffd5b50604051612c38380380612c3883398101604081905261003391610337565b6040810151815160208301515f61004a83826104af565b50600161005782826104af565b5050506001600160a01b03811661008757604051631e4fbdf760e01b81525f600482015260240160405180910390fd5b610090816101f3565b5060017f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f005560408101516001600160a01b03166100e057604051631c9670bb60e01b815260040160405180910390fd5b606081015161010257604051630609d2f760e01b815260040160405180910390fd5b60a08101516101245760405163fe8b4fc560e01b815260040160405180910390fd5b806080015163ffffffff165f0361014e576040516315ae672760e01b815260040160405180910390fd5b8060c00151515f036101735760405163180caec360e21b815260040160405180910390fd5b6060810151608090815260a080830151905281015163ffffffff1660c0908152810151600a906101a390826104af565b5060a08101516060820151608083015160405163ffffffff90911681527f3a34ed2682da72a47ed7c5d17d81cde3e653636dd09c3f4009a8f0294b3628e59060200160405180910390a350610569565b600880546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0905f90a35050565b634e487b7160e01b5f52604160045260245ffd5b60405160e081016001600160401b038111828210171561027a5761027a610244565b60405290565b5f82601f83011261028f575f5ffd5b81516001600160401b038111156102a8576102a8610244565b604051601f8201601f19908116603f011681016001600160401b03811182821017156102d6576102d6610244565b6040528181528382016020018510156102ed575f5ffd5b8160208501602083015e5f918101602001919091529392505050565b80516001600160a01b038116811461031f575f5ffd5b919050565b805163ffffffff8116811461031f575f5ffd5b5f60208284031215610347575f5ffd5b81516001600160401b0381111561035c575f5ffd5b820160e0818503121561036d575f5ffd5b610375610258565b81516001600160401b0381111561038a575f5ffd5b61039686828501610280565b82525060208201516001600160401b038111156103b1575f5ffd5b6103bd86828501610280565b6020830152506103cf60408301610309565b6040820152606082810151908201526103ea60808301610324565b608082015260a0828101519082015260c08201516001600160401b03811115610411575f5ffd5b61041d86828501610280565b60c083015250949350505050565b600181811c9082168061043f57607f821691505b60208210810361045d57634e487b7160e01b5f52602260045260245ffd5b50919050565b601f8211156104aa57805f5260205f20601f840160051c810160208510156104885750805b601f840160051c820191505b818110156104a7575f8155600101610494565b50505b505050565b81516001600160401b038111156104c8576104c8610244565b6104dc816104d6845461042b565b84610463565b6020601f82116001811461050e575f83156104f75750848201515b5f19600385901b1c1916600184901b1784556104a7565b5f84815260208120601f198516915b8281101561053d578785015182556020948501946001909201910161051d565b508482101561055a57868401515f19600387901b60f8161c191681555b50505050600190811b01905550565b60805160a05160c0516126826105b65f395f818161029401528181610820015281816108ea0152818161091c01528181611379015261147d01525f61041801525f6104b901526126825ff3fe";

function editionCreationCode() {
  try {
    const pinned = readFileSync(new URL('../../../packages/contracts/bytecode/NexPassEdition.creation.hex', import.meta.url), 'utf8').trim();
    if (pinned.startsWith('0x')) return pinned;
  } catch { /* local source checkouts may rely on the generated artifact */ }
  try {
    const artifact = JSON.parse(readFileSync(new URL('../../../packages/contracts/out/NexPassEdition.sol/NexPassEdition.json', import.meta.url), 'utf8'));
    const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode?.object;
    if (bytecode && bytecode !== '0x') return bytecode;
  } catch { /* fallback to embedded pinned constant */ }
  return PINNED_CREATION_BYTECODE;
}
export function predictEditionAddress({ factoryAddress, name, symbol, initialOwner, editionId, absoluteSupplyCap, artworkCommitment, baseTokenURI, salt }) {
  if (!isAddress(factoryAddress) || !isAddress(initialOwner)) throw Object.assign(new Error('FACTORY_CONFIGURATION_REQUIRED'), { status: 503 });
  const encodedConfig = AbiCoder.defaultAbiCoder().encode([FACTORY_CONFIG_TUPLE], [[name, symbol, factoryAddress, editionId, absoluteSupplyCap, artworkCommitment, baseTokenURI]]);
  return getCreate2Address(getAddress(factoryAddress), salt, keccak256(concat([editionCreationCode(), encodedConfig]))).toLowerCase();
}

function quantity(value, label) {
  try { return Number(BigInt(value)); } catch { throw Object.assign(new Error(`${label}_REQUIRED`), { status: 400 }); }
}

// Parse only the canonical Factory event. The receipt and transaction target
// are checked by the caller; this helper deliberately does not trust client
// supplied Edition metadata.
export function parseFactoryEditionCreatedReceipt(receipt, { factoryAddress, publisherAddress = null, editionAddress = null } = {}) {
  const factory = getAddress(factoryAddress ?? '');
  const log = (receipt?.logs ?? []).find((entry) => entry?.address && getAddress(entry.address) === factory && String(entry.topics?.[0] ?? '').toLowerCase() === EDITION_CREATED_TOPIC);
  if (!log || !Array.isArray(log.topics) || log.topics.length < 4) throw Object.assign(new Error('EDITION_CREATED_EVENT_REQUIRED'), { status: 400 });
  const edition = getAddress(`0x${String(log.topics[1]).slice(-40)}`);
  const editionId = String(log.topics[2]);
  const publisher = getAddress(`0x${String(log.topics[3]).slice(-40)}`);
  if (publisherAddress && publisher.toLowerCase() !== getAddress(publisherAddress).toLowerCase()) throw Object.assign(new Error('EDITION_PUBLISHER_MISMATCH'), { status: 403 });
  if (editionAddress && edition.toLowerCase() !== getAddress(editionAddress).toLowerCase()) throw Object.assign(new Error('EDITION_ADDRESS_MISMATCH'), { status: 400 });
  let decoded;
  try { decoded = AbiCoder.defaultAbiCoder().decode(['bytes32', 'address', 'address', 'uint32', 'bytes32'], log.data ?? '0x'); }
  catch { throw Object.assign(new Error('EDITION_CREATED_DATA_INVALID'), { status: 400 }); }
  return {
    edition: edition.toLowerCase(),
    editionId: editionId.toLowerCase(),
    publisher: publisher.toLowerCase(),
    salt: String(decoded[0]).toLowerCase(),
    editionOwner: String(decoded[1]).toLowerCase(),
    mintController: String(decoded[2]).toLowerCase(),
    absoluteSupplyCap: quantity(decoded[3], 'ABSOLUTE_SUPPLY_CAP'),
    artworkCommitment: String(decoded[4]).toLowerCase(),
    blockNumber: quantity(receipt?.blockNumber, 'RECEIPT_BLOCK_NUMBER'),
    blockHash: String(receipt?.blockHash ?? '').toLowerCase(),
    txHash: String(receipt?.transactionHash ?? '').toLowerCase(),
    logIndex: quantity(log.logIndex, 'EDITION_CREATED_LOG_INDEX')
  };
}
function canonicalAdvantagesHash(configs) {
  if (!Array.isArray(configs) || configs.length === 0) return '0x' + '00'.repeat(32);
  try {
    const coder = AbiCoder.defaultAbiCoder();
    return keccak256(coder.encode(['bytes32', ADVANTAGE_TUPLE], [ADVANTAGES_DOMAIN, configs.map((config) => [config.advantageId, config.kind, config.startsAt, config.endsAt, config.totalUnits, config.definitionHash])]));
  } catch { return null; }
}

export function productionOrderPolicy(env = process.env) {
  return {
    usdg: env.USDG_ADDRESS ?? '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    protocolFeeRecipient: env.SECONDARY_FEE_RECIPIENT,
    royaltyVault: env.NEX_ROYALTY_VAULT_ADDRESS,
    zone: env.NEX_MARKETS_ZONE_ADDRESS,
    listingRegistry: env.NEX_LISTING_REGISTRY_ADDRESS,
    seaport: env.SEAPORT_16_ADDRESS ?? '0x0000000000000068F116a894984e2DB1123eB395',
    protocolAdminSafe: env.PROTOCOL_ADMIN_SAFE_ADDRESS,
    transactionTargets: {
      MINT: env.NEX_MINT_CONTROLLER_ADDRESS,
      EDITION_CREATE: env.NEX_PASS_FACTORY_ADDRESS,
      TERMS_PUBLISH: env.NEX_LAUNCH_REGISTRY_ADDRESS,
      LISTING_CANCEL: env.NEX_LISTING_REGISTRY_ADDRESS,
      ADVANTAGE_USE: env.NEX_ADVANTAGE_REGISTRY_ADDRESS,
      ROYALTY_WITHDRAW: env.NEX_ROYALTY_VAULT_ADDRESS
    }
  };
}

export function networkKeyForChainId(chainId) {
  return ({ 4663: 'robinhood-mainnet', 46630: 'robinhood-testnet', 8453: 'base-mainnet', 84532: 'base-sepolia' })[Number(chainId)] ?? null;
}

// These are public, verified testnet deployments. Environment variables still
// take precedence, but keeping the manifest-backed defaults here means the
// Vercel API and the browser cannot drift when only public testnet config is
// available. Mainnet deliberately has no fallback addresses below.
const VERIFIED_TESTNET_POLICIES = Object.freeze({
  'robinhood-testnet': Object.freeze({
    PROTOCOL_ADMIN_SAFE_ADDRESS: '0xCE54c8453fF48670781a6b908c1A3e9209FC95A0',
    SECONDARY_FEE_RECIPIENT: '0xCE54c8453fF48670781a6b908c1A3e9209FC95A0',
    NEX_ROYALTY_VAULT_ADDRESS: '0x9D69ab1897aFA9d6ffc97EEa6A936233a999DFa1',
    NEX_MARKETS_ZONE_ADDRESS: '0xF21dA23d8928b320124fBc17bd678c7C48c55af6',
    NEX_LISTING_REGISTRY_ADDRESS: '0xF8fD8D378F6a61Ecb207732F4f1d0c3E4Eb2c75c',
    NEX_MINT_CONTROLLER_ADDRESS: '0x0ea6F883808447f115C7b6C037902361C365555A',
    NEX_PASS_FACTORY_ADDRESS: '0x957DE0de07D33c9a89c791B876074657a7fFeEb6',
    NEX_LAUNCH_REGISTRY_ADDRESS: '0xeE3C8F330C0B2738201fDb2F1720D06c0D27620d',
    NEX_ADVANTAGE_REGISTRY_ADDRESS: '0x1e265Fee39d75b5211895820926B4ff77B4f1cDd'
  }),
  'base-sepolia': Object.freeze({
    PROTOCOL_ADMIN_SAFE_ADDRESS: '0xE6D0846e6C0b51C61FdDb593A1914b85181E5783',
    SECONDARY_FEE_RECIPIENT: '0xE6D0846e6C0b51C61FdDb593A1914b85181E5783',
    NEX_ROYALTY_VAULT_ADDRESS: '0x1C7fBa2bEfdCB18E316e1713fc22EaC78434DBF3',
    NEX_MARKETS_ZONE_ADDRESS: '0x1C7e6cE890d9c6DD9DF55f42449f9F2F34141B3e',
    NEX_LISTING_REGISTRY_ADDRESS: '0xdB57a21e01d85E67d75111534e3A99508e1e9187',
    NEX_MINT_CONTROLLER_ADDRESS: '0xe68Fc831a441eeA79865A890a279514C8C797677',
    NEX_PASS_FACTORY_ADDRESS: '0xc5Cdfcc91719379A778C16b2ab9190c004186E0C',
    NEX_LAUNCH_REGISTRY_ADDRESS: '0x707278D3a69e27bde2A14Ee70602d4A293C8C2aF',
    NEX_ADVANTAGE_REGISTRY_ADDRESS: '0xddf778F46b1A91f7B80B24fdB185372C633Acb15'
  })
});

function networkPolicyEnv(env, prefix, settlementAddress, seaportAddress, fallback = {}) {
  const policyEnv = { ...env };
  const mappings = {
    PROTOCOL_ADMIN_SAFE_ADDRESS: 'PROTOCOL_ADMIN_SAFE_ADDRESS',
    SECONDARY_FEE_RECIPIENT: 'SECONDARY_FEE_RECIPIENT',
    NEX_ROYALTY_VAULT_ADDRESS: 'NEX_ROYALTY_VAULT_ADDRESS',
    NEX_MARKETS_ZONE_ADDRESS: 'NEX_MARKETS_ZONE_ADDRESS',
    NEX_LISTING_REGISTRY_ADDRESS: 'NEX_LISTING_REGISTRY_ADDRESS',
    NEX_MINT_CONTROLLER_ADDRESS: 'NEX_MINT_CONTROLLER_ADDRESS',
    NEX_PASS_FACTORY_ADDRESS: 'NEX_PASS_FACTORY_ADDRESS',
    NEX_LAUNCH_REGISTRY_ADDRESS: 'NEX_LAUNCH_REGISTRY_ADDRESS',
    NEX_ADVANTAGE_REGISTRY_ADDRESS: 'NEX_ADVANTAGE_REGISTRY_ADDRESS'
  };
  for (const [target, suffix] of Object.entries(mappings)) {
    policyEnv[target] = env[`${prefix}_${suffix}`]
      ?? (prefix === 'ROBINHOOD_TESTNET' ? env[suffix] : undefined)
      ?? fallback[suffix];
  }
  policyEnv.USDG_ADDRESS = env[`${prefix}_USDC_ADDRESS`]
    ?? (prefix === 'ROBINHOOD_TESTNET' ? env.USDG_ADDRESS : undefined)
    ?? settlementAddress;
  policyEnv.SEAPORT_16_ADDRESS = env[`${prefix}_SEAPORT_16_ADDRESS`] ?? seaportAddress;
  return policyEnv;
}

function networkSubgraph(env, prefix, fallbackEndpoint, fallbackEdition, fallbackName) {
  const endpoint = env[`${prefix}_SUBGRAPH_URL`] ?? fallbackEndpoint;
  return new SubgraphClient({
    endpoint,
    certificationEditionAddress: env[`${prefix}_CERTIFICATION_EDITION_ADDRESS`] ?? fallbackEdition,
    certificationEditionName: env[`${prefix}_CERTIFICATION_EDITION_NAME`] ?? fallbackName
  });
}

async function attachSignedListingData(listings, store) {
  if (!Array.isArray(listings) || !store?.signedOrder) return listings ?? [];
  return Promise.all(listings.map(async (listing) => {
    const orderHash = listing.order_hash ?? listing.orderHash;
    if (!orderHash) return listing;
    const signed = await store.signedOrder(orderHash);
    if (!signed) return listing;
    return {
      ...listing,
      signature: signed.signature,
      counter: signed.counter,
      order_payload: signed.order_payload ?? signed.order ?? null
    };
  }));
}

export function createNetworkConfigs(env = process.env) {
  const baseSepoliaUsdc = env.BASE_SEPOLIA_USDC_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const baseMainnetUsdc = env.BASE_MAINNET_USDC_ADDRESS ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const rhTestnetSubgraph = networkSubgraph(
    env,
    'ROBINHOOD_TESTNET',
    env.NEXMARKETS_SUBGRAPH_URL ?? 'https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn',
    env.CERTIFICATION_EDITION_ADDRESS ?? '0x4171D62F43B4168b07a01C04594455DBc3298437',
    env.CERTIFICATION_EDITION_NAME ?? 'NexMarkets V1 Test Certification Edition'
  );
  const rhMainnetSubgraph = networkSubgraph(env, 'ROBINHOOD_MAINNET', env.RH_MAINNET_SUBGRAPH_URL, env.RH_MAINNET_CERTIFICATION_EDITION_ADDRESS, env.RH_MAINNET_CERTIFICATION_EDITION_NAME);
  const baseSepoliaSubgraph = networkSubgraph(env, 'BASE_SEPOLIA', env.BASE_SEPOLIA_SUBGRAPH_URL ?? env.BASE_SEPOLIA_NEXMARKETS_SUBGRAPH_URL ?? 'https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-base-sepolia/1.0.1/gn', env.BASE_SEPOLIA_CERTIFICATION_EDITION_ADDRESS, env.BASE_SEPOLIA_CERTIFICATION_EDITION_NAME);
  const baseMainnetSubgraph = networkSubgraph(env, 'BASE_MAINNET', env.BASE_MAINNET_SUBGRAPH_URL ?? env.BASE_MAINNET_NEXMARKETS_SUBGRAPH_URL, env.BASE_MAINNET_CERTIFICATION_EDITION_ADDRESS, env.BASE_MAINNET_CERTIFICATION_EDITION_NAME);
  const rhTestnetPolicy = networkPolicyEnv(env, 'ROBINHOOD_TESTNET', env.USDG_ADDRESS ?? '0x6A4F8832c23C51ba626Eba9d50c8F862647C1679', '0x0000000000000068F116a894984e2DB1123eB395', VERIFIED_TESTNET_POLICIES['robinhood-testnet']);
  const baseSepoliaPolicy = networkPolicyEnv(env, 'BASE_SEPOLIA', baseSepoliaUsdc, '0x0000000000000068F116a894984e2DB1123eB395', VERIFIED_TESTNET_POLICIES['base-sepolia']);
  const config = (key, chainId, rpcEnv, fallbackRpc, subgraph, policyEnv, readModelDisabled = false) => ({
    key,
    chainId,
    chain: new JsonRpcClient(env[rpcEnv] ?? fallbackRpc),
    subgraph,
    orderPolicy: productionOrderPolicy(policyEnv),
    productionReadiness: productionReadinessFromEnv(env),
    settlement: {
      symbol: networkByKey(key).settlement.symbol,
      address: policyEnv.USDG_ADDRESS ?? networkByKey(key).settlement.address,
      decimals: networkByKey(key).settlement.decimals ?? 6,
      mock: Boolean(networkByKey(key).settlement.mock),
      testnetOnly: Boolean(networkByKey(key).settlement.testnetOnly)
    },
    readModelDisabled
  });
  return {
    'robinhood-mainnet': config('robinhood-mainnet', 4663, 'RH_MAINNET_RPC_URL', 'https://rpc.mainnet.chain.robinhood.com', rhMainnetSubgraph, env, !rhMainnetSubgraph.enabled),
    'robinhood-testnet': config('robinhood-testnet', 46630, 'RH_TESTNET_RPC_URL', 'https://rpc.testnet.chain.robinhood.com', rhTestnetSubgraph, rhTestnetPolicy),
    'base-mainnet': config('base-mainnet', 8453, 'BASE_MAINNET_RPC_URL', 'https://mainnet.base.org', baseMainnetSubgraph, networkPolicyEnv(env, 'BASE_MAINNET', baseMainnetUsdc, '0x0000000000000068F116a894984e2DB1123eB395'), !baseMainnetSubgraph.enabled),
    'base-sepolia': config('base-sepolia', 84532, 'BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org', baseSepoliaSubgraph, baseSepoliaPolicy, !baseSepoliaSubgraph.enabled)
  };
}

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(JSON.stringify(payload, (_, value) => typeof value === 'bigint' ? value.toString() : value));
}

async function readBody(req, maxBytes = 1_048_576) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
}

function cookies(req) {
  return Object.fromEntries(((req.headers ?? {}).cookie ?? '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('='); return [decodeURIComponent(part.slice(0, index).trim()), decodeURIComponent(part.slice(index + 1))];
  }));
}

export class RateLimiter {
  constructor({ limit = 120, windowMs = 60_000 } = {}) { this.limit = limit; this.windowMs = windowMs; this.buckets = new Map(); }
  take(key, now = Date.now()) {
    const prior = this.buckets.get(key);
    const bucket = !prior || prior.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : prior;
    bucket.count += 1; this.buckets.set(key, bucket);
    if (bucket.count > this.limit) throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
  }
}

function securityHeaders(requestId) {
  return {
    'x-request-id': requestId, 'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'strict-transport-security': 'max-age=31536000; includeSubDomains'
  };
}

function formatHeldDuration(since) {
  if (!since) return 'Recent';
  const ms = Date.now() - new Date(since).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 365) {
    const yrs = Math.floor(days / 365);
    return `${yrs} yr${yrs > 1 ? 's' : ''}`;
  }
  if (days >= 30) {
    const mos = Math.floor(days / 30);
    return `${mos} mo${mos > 1 ? 's' : ''}`;
  }
  if (days >= 1) return `${days} day${days > 1 ? 's' : ''}`;
  const hrs = Math.floor(ms / (60 * 60 * 1000));
  if (hrs >= 1) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return 'Just now';
}

function epochSeconds(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function formatPassVault(pass) {
  if (!pass) return null;
  const tba = pass.token_bound_account ?? pass.tokenBoundAccount ?? pass.tba?.account ?? null;
  return {
    name: 'Pass Vault',
    address: tba,
    compatible: true,
    standard: 'ERC-6551',
    registry: '0x000000006551c19487814612e58FE06813775758',
    framing: "Every Pass is ERC-6551 compatible. As the ecosystem grows, Passes accumulate. What they accumulate is determined by each builder's Edition design.",
    description: "Every Pass has a Vault. What flows into it is decided by the builder who created the Edition. Platform activity, tokens, exclusive drops, future distributions — builders choose what their holders accumulate. We provide the infrastructure. They decide what it means.",
    regulatoryBoundary: "Builders decide what flows into the Pass wallet. Platform decides nothing on their behalf. Completely permissionless. Zero regulatory exposure."
  };
}

function mediaAssetView(row) {
  if (!row) return null;
  return {
    id: row.id,
    assetKey: row.id,
    filename: row.original_filename ?? row.filename,
    mimeType: row.mime_type ?? row.mimeType,
    byteSize: Number(row.byte_size ?? row.byteSize ?? 0),
    sha256: row.sha256,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    uploadStatus: row.upload_status ?? row.uploadStatus ?? 'PREPARED',
    safetyStatus: row.safety_status ?? row.safetyStatus ?? 'PENDING',
    url: row.public_url ?? row.publicUrl ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    uploadedAt: row.uploaded_at ?? row.uploadedAt ?? null,
    verifiedAt: row.verified_at ?? row.verifiedAt ?? null
  };
}

function mediaIdFromUrl(value) {
  const match = String(value || '').match(/(?:^|https?:\/\/[^/]+)\/v1\/media\/([^/?#]+)\/content(?:[?#].*)?$/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function launchMediaReferences(launchDraft) {
  const project = launchDraft?.project || {};
  const design = launchDraft?.design || {};
  const references = [
    { role: 'banner', id: project.banner?.assetId || mediaIdFromUrl(project.banner?.src), url: project.banner?.src },
    { role: 'logo', id: design.logoAssetId || mediaIdFromUrl(design.logoSrc), url: design.logoSrc },
    { role: 'artwork', id: design.artAssetId || mediaIdFromUrl(design.artSrc), url: design.artSrc }
  ];
  for (const [index, entry] of (design.artEdition || []).entries()) {
    references.push({ role: `artwork:${index + 1}`, id: entry.assetId || (/^med_/i.test(entry.assetKey || '') ? entry.assetKey : null) || mediaIdFromUrl(entry.url || entry.src), url: entry.url || entry.src });
  }
  return references.filter((reference) => reference.id);
}

async function assertApprovedMediaReferences(store, accountId, launchDraft) {
  const references = launchMediaReferences(launchDraft);
  if (!references.length) return;
  const ids = [...new Set(references.map((reference) => reference.id))];
  const rows = store.mediaByIds ? await store.mediaByIds(ids) : await Promise.all(ids.map((id) => store.mediaById?.(id)));
  const byId = new Map((rows || []).filter(Boolean).map((row) => [row.id, row]));
  for (const reference of references) {
    const row = byId.get(reference.id);
    if (!row) throw Object.assign(new Error('MEDIA_REFERENCE_NOT_FOUND'), { status: 400 });
    if ((row.owner_account_id ?? row.ownerAccountId) !== accountId) throw Object.assign(new Error('MEDIA_OWNER_MISMATCH'), { status: 403 });
    if ((row.safety_status ?? row.safetyStatus) !== 'APPROVED') throw Object.assign(new Error('MEDIA_NOT_APPROVED'), { status: 400 });
    const approvedUrl = row.public_url ?? row.publicUrl;
    if (reference.url && approvedUrl && reference.url !== approvedUrl) throw Object.assign(new Error('MEDIA_REFERENCE_MISMATCH'), { status: 400 });
  }
}

function assertLaunchArtworkReady(launchDraft) {
  const design = launchDraft?.design || {};
  const isStableUrl = (value) => /^(?:https?:\/\/|\/v1\/media\/[^/]+\/content(?:[?#].*)?$)/i.test(String(value || '').trim());
  if (design.artMode === 'collection') {
    const supply = Number(launchDraft?.edition?.supply || 0);
    if (!Array.isArray(design.artEdition) || design.artEdition.length !== supply || design.artEdition.some((entry) => !isStableUrl(entry.url || entry.src))) {
      throw Object.assign(new Error('COLLECTION_ARTWORK_NOT_READY'), { status: 400 });
    }
    return;
  }
  if (!isStableUrl(design.artSrc)) throw Object.assign(new Error('ARTWORK_NOT_READY'), { status: 400 });
}

export function createApiServer({
  store,
  chainId = 4663,
  allowedOrigin = process.env.APP_ORIGIN ?? 'https://nexmarkets.fun',
  secureCookies = process.env.NODE_ENV !== 'test',
  rateLimiter = new RateLimiter(),
  logger = { info() {}, error() {} },
  orderPolicy = {},
  metrics = new MetricsRegistry(),
  requireIndexedReadiness = false,
  chain = null,
  subgraph = null,
  networkConfigs = null,
  maxIndexerLagBlocks = 120,
  maxFinalityLagBlocks = 120,
  storage = null,
  productionReadiness = null,
  requireProductionReadiness = false
} = {}) {
  if (!store) throw new Error('store required');
  const defaultChainId = chainId;
  const defaultChain = chain;
  const defaultSubgraph = subgraph;
  const defaultOrderPolicy = orderPolicy;
  return http.createServer(async (req, res) => {
    const headers = req.headers ?? {};
    const requestId = headers['x-request-id']?.toString().slice(0, 128) || randomUUID();
    const correlationId = headers['x-correlation-id']?.toString().slice(0, 128) || requestId;
    const startedAt = Date.now();
    for (const [key, value] of Object.entries(securityHeaders(requestId))) res.setHeader?.(key, value);
    try {
      metrics.increment('nexmarkets_api_requests_total');
      rateLimiter.take(req.socket?.remoteAddress ?? headers['x-forwarded-for'] ?? 'unknown');
      const url = new URL(req.url ?? '/', allowedOrigin);
      const requestedNetwork = headers['x-nex-network']?.toString().trim() || null;
      const selectedNetwork = networkConfigs
        ? networkConfigs[requestedNetwork ?? networkKeyForChainId(defaultChainId)]
        : null;
      if (networkConfigs && !selectedNetwork) throw Object.assign(new Error('NETWORK_UNSUPPORTED'), { status: 400 });
      const fallbackChainId = defaultChainId;
      const fallbackChain = defaultChain;
      const fallbackSubgraph = defaultSubgraph;
      const fallbackOrderPolicy = defaultOrderPolicy;
      const chainId = selectedNetwork?.chainId ?? fallbackChainId;
      const chain = selectedNetwork?.chain ?? fallbackChain;
      const subgraph = selectedNetwork?.subgraph ?? fallbackSubgraph;
      const orderPolicy = selectedNetwork?.orderPolicy ?? fallbackOrderPolicy;
      const readiness = selectedNetwork?.productionReadiness ?? productionReadiness;
      const readModelDisabled = Boolean(selectedNetwork?.readModelDisabled && !subgraph?.enabled);
      const origin = headers.origin;
      if (origin && new URL(origin).origin !== new URL(allowedOrigin).origin) {
        const reqHost = headers['x-forwarded-host'] || headers.host;
        if (!reqHost || new URL(origin).host !== reqHost) throw Object.assign(new Error('ORIGIN_REJECTED'), { status: 403 });
      }

      // The site root belongs to the static web shell. If a Vercel project
      // route sends `/` through this listener, redirect it to the immutable
      // entrypoint rather than exposing an API status payload as the page.
      // API health remains available at `/healthz` and all `/v1/*` routes are
      // handled below as before.
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
        res.writeHead(307, { location: '/index.html', 'cache-control': 'no-store' });
        return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'ok', service: 'api', version: 'v1', requestId });
      if (req.method === 'GET' && url.pathname === '/readyz') {
        if (requireProductionReadiness && readiness && !readiness.productionReady) throw Object.assign(new Error(`PRODUCTION_READINESS_BLOCKED:${readiness.blockers.join(',')}`), { status: 503 });
        await store.ready(); metrics.set('nexmarkets_db_ready', 1);
        const subgraphStatus = requireIndexedReadiness && subgraph?.enabled ? await subgraph.indexingStatus() : null;
        const indexer = requireIndexedReadiness && !subgraphStatus ? await store.indexerHealth(chainId) : null;
        if (requireIndexedReadiness && !indexer && !subgraphStatus) throw Object.assign(new Error('INDEXER_NOT_READY'), { status: 503 });
        if (requireIndexedReadiness && !chain?.getBlockNumber) throw Object.assign(new Error('CHAIN_HEAD_UNAVAILABLE'), { status: 503 });
        let chainHead = null; let indexedLag = null; let finalityLag = null;
        if ((indexer || subgraphStatus) && chain?.getBlockNumber) {
          chainHead = await chain.getBlockNumber();
          const landed = subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0);
          const finalized = subgraphStatus ? landed : Number(indexer.finalized_watermark_block_number ?? indexer.finalized_block_number ?? 0);
          indexedLag = chainHead - landed; finalityLag = chainHead - finalized;
          if (indexedLag > maxIndexerLagBlocks || finalityLag > maxFinalityLagBlocks) {
            logger.info?.({ event: 'indexer_stale', chainHead, landedBlock: landed, finalizedBlock: finalized, indexedLag, finalityLag, maxIndexerLagBlocks, maxFinalityLagBlocks });
            throw Object.assign(new Error('INDEXER_STALE'), { status: 503 });
          }
        }
        if (indexer || subgraphStatus) { const landed = subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0); metrics.set('nexmarkets_indexer_latest_block', landed); metrics.set('nexmarkets_indexer_lag_blocks', indexedLag ?? 0); }
        return json(res, 200, { status: 'ready', database: 'ok', productionReadiness: readiness, indexer: (indexer || subgraphStatus) ? 'fresh' : 'not-required', indexerProvider: subgraphStatus ? 'GOLDSKY_SUBGRAPH' : indexer ? 'GOLDSKY_TURBO_DEPRECATED' : null, chainHead, landedBlock: subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : indexer ? Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0) : null, latestEventBlock: indexer ? Number(indexer.latest_event_block_number ?? indexer.latest_block_number ?? 0) : null, indexedLag, finalityLag, requestId });
      }
      if (req.method === 'GET' && url.pathname === '/metrics') { res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }); return res.end(metrics.render()); }
      if (req.method === 'GET' && url.pathname === '/v1/stats') {
        const stats = readModelDisabled ? {} : await store.getPlatformStats();
        return json(res, 200, {
          data: {
            ...stats,
            heroCopy: "Get there early. Own your place in what's next.",
            tagline: "A Pass is your position in a builder's story.",
            howItWorks: [
              { step: 1, text: "Find it early on Discover." },
              { step: 2, text: "Mint your numbered Pass." },
              { step: 3, text: "Use your Advantage, keep it, or sell it when the Market opens." }
            ],
            royaltyFraming: "Builder royalties are earned, not assumed. Every 30-day cycle, fees queue for release. Holders can challenge. Clean builders get paid. The market polices itself.",
            passVaultFraming: "Every Pass has a Vault. What flows into it is decided by the builder who created the Edition. Platform activity, tokens, exclusive drops, future distributions — builders choose what their holders accumulate. We provide the infrastructure. They decide what it means."
          }
        });
      }
      if (req.method === 'GET' && url.pathname === '/v1/builders/featured') return json(res, 200, { data: await store.getFeaturedBuilders() });
      if (req.method === 'GET' && /^\/v1\/builders\/[^/]+\/milestones$/.test(url.pathname)) {
        const builderId = url.pathname.split('/')[3];
        return json(res, 200, { data: await store.getMilestonesByBuilder(builderId) });
      }
      if (req.method === 'GET' && /^\/v1\/builders\/[^/]+\/questions$/.test(url.pathname)) {
        const builderId = url.pathname.split('/')[3];
        const profile = await store.getBuilderProfile(builderId);
        if (!profile) throw Object.assign(new Error('BUILDER_NOT_FOUND'), { status: 404 });
        const canonicalBuilderId = profile.builder_id ?? profile.builderId ?? profile.id ?? builderId;
        return json(res, 200, { data: store.getQuestionsByBuilder ? await store.getQuestionsByBuilder(canonicalBuilderId) : [] });
      }
      if (req.method === 'GET' && /^\/v1\/builders\/[^/]+\/activity$/.test(url.pathname)) {
        const builderId = url.pathname.split('/')[3];
        const activity = store.getActivityByBuilder ? await store.getActivityByBuilder(builderId, { limit: 20 }) : await store.getMilestonesByBuilder(builderId, { limit: 20 });
        return json(res, 200, { data: activity });
      }
      if (req.method === 'GET' && /^\/v1\/builders\/[^/]+$/.test(url.pathname) && !['featured'].includes(url.pathname.split('/')[3])) {
        const builderId = url.pathname.split('/')[3];
        const profile = await store.getBuilderProfile(builderId);
        if (!profile) throw Object.assign(new Error('BUILDER_NOT_FOUND'), { status: 404 });
        return json(res, 200, { data: profile });
      }
      if (req.method === 'GET' && /^\/v1\/projects\/[^/]+\/holders$/.test(url.pathname)) {
        if (readModelDisabled) return json(res, 200, { data: [] });
        const slug = decodeURIComponent(url.pathname.split('/')[3]);
        const project = await store.projectBySlug(slug);
        if (!project) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
        const editionAddress = project.editionAddress ?? project.edition_address ?? project.editions?.[0]?.edition_address ?? project.editions?.[0]?.editionAddress;
        const holders = editionAddress ? await store.getHolders(editionAddress) : [];
        const formatted = holders.map((h) => ({
          ...h,
          serialNumber: `#${String(h.token_id ?? h.tokenId).padStart(3, '0')}`,
          heldDuration: formatHeldDuration(h.held_since ?? h.heldSince ?? h.updated_at ?? h.created_at)
        }));
        return json(res, 200, { data: formatted });
      }
      if (req.method === 'GET' && /^\/v1\/editions\/[^/]+\/holders$/.test(url.pathname)) {
        if (readModelDisabled) return json(res, 200, { data: [] });
        const address = url.pathname.split('/')[3];
        const holders = await store.getHolders(address);
        const formatted = holders.map((h) => ({
          ...h,
          serialNumber: `#${String(h.token_id ?? h.tokenId).padStart(3, '0')}`,
          heldDuration: formatHeldDuration(h.held_since ?? h.heldSince ?? h.updated_at ?? h.created_at)
        }));
        return json(res, 200, { data: formatted });
      }
      if (req.method === 'GET' && url.pathname === '/v1/discover') {
        let raw = [];
        if (!readModelDisabled) {
          try { raw = subgraph?.enabled ? await subgraph.discover() : await store.discover(); }
          catch (error) { logger.info?.({ event: 'discover_subgraph_fallback', error: error.message }); raw = await store.discover(); }
        }
        const now = Date.now();
        const data = (await Promise.all((raw ?? []).map(async (project) => {
          // Goldsky supplies the chain/indexed Edition record, while the
          // Postgres project row owns the approved public product copy and
          // frozen Pass/artwork configuration. Join them before the browser
          // creates its view model so public routes cannot fall back to demo
          // content merely because the subgraph is the selected authority.
          let source = project;
          const editionAddress = project.edition_address ?? project.editionAddress ?? project.address;
          if (!project.content && editionAddress && store.projectByEditionAddress) {
            const linkedProject = await store.projectByEditionAddress(editionAddress);
            if (linkedProject) source = { ...project, slug: linkedProject.slug ?? project.slug, project_id: linkedProject.id, project_name: linkedProject.name, builder_account_id: linkedProject.builder_account_id ?? linkedProject.builderAccountId, content: linkedProject.content, project: linkedProject };
          }
          // Some indexers expose launch timing on the discovery entity but
          // only expose the canonical Terms object on the Edition detail.
          // Resolve that detail before classifying lifecycle; otherwise a
          // valid published Edition can be dropped as DRAFT simply because
          // the discovery projection is sparse. The detail remains an
          // indexed read, never a frontend/status fixture.
          if (!(source.currentTerms ?? source.current_terms ?? source.active_terms_hash) && editionAddress && subgraph?.editionByAddress) {
            try {
              const detail = await subgraph.editionByAddress(editionAddress);
              if (detail) source = { ...source, ...detail, currentTerms: detail.currentTerms ?? detail.current_terms ?? source.currentTerms, current_terms: detail.current_terms ?? detail.currentTerms ?? source.current_terms };
            } catch (error) { logger.info?.({ event: 'discover_edition_detail_fallback', error: error.message, editionAddress }); }
          }
          const currentTerms = source.currentTerms ?? source.current_terms ?? null;
          const termsHash = currentTerms?.hash ?? currentTerms?.terms_hash ?? source.active_terms_hash ?? null;
          const starts = currentTerms?.mintStartsAt ?? currentTerms?.mint_starts_at ?? source.mint_starts_at ?? source.mintStartsAt;
          const ends = currentTerms?.mintEndsAt ?? currentTerms?.mint_ends_at ?? source.mint_ends_at ?? source.mintEndsAt;
          const startsEpoch = epochSeconds(starts);
          const endsEpoch = epochSeconds(ends);
          const cap = Number(source.absolute_supply_cap ?? source.absoluteSupplyCap ?? 0);
          const minted = Number(source.total_minted ?? source.totalMinted ?? 0);
          let statusTag = 'DRAFT';
          if (termsHash && startsEpoch != null && endsEpoch == null) statusTag = 'PREVIEW';
          else if (termsHash && (startsEpoch == null || endsEpoch == null)) statusTag = 'DRAFT';
          else if (termsHash && startsEpoch * 1000 > now) statusTag = 'PREVIEW';
          else if (termsHash && (endsEpoch * 1000 < now || (cap > 0 && minted >= cap))) statusTag = 'CLOSED';
          else if (termsHash) {
            // Timing alone is not launch authority. The Registry's
            // isMintOpen view also accounts for pause/disable state and the
            // Edition's on-chain minted cap. If that proof is unavailable,
            // fail closed as Preview rather than presenting a Terms-less or
            // otherwise unverified Edition as an open Debut.
            let mintOpen = null;
            const launchRegistry = orderPolicy.transactionTargets?.TERMS_PUBLISH;
            if (chain?.ethCall && isAddress(launchRegistry ?? '') && isAddress(editionAddress ?? '') && /^0x[0-9a-f]{64}$/i.test(String(termsHash))) {
              try {
                const encoded = AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'], [editionAddress, termsHash]);
                const result = await chain.ethCall(launchRegistry, `${MINT_OPEN_SELECTOR}${encoded.slice(2)}`);
                mintOpen = BigInt(result) !== 0n;
              } catch { mintOpen = null; }
            }
            // Unit/in-memory callers intentionally omit a chain adapter; keep
            // their timing-only fixture semantics. A configured production
            // chain, however, must prove the Registry view before DEBUT.
            statusTag = mintOpen === true || (mintOpen === null && !chain?.ethCall) ? 'DEBUT' : 'PREVIEW';
          }
          const watcherCount = readModelDisabled ? 0 : await store.getWatchlistCount?.(source.project_id ?? source.id ?? source.slug) ?? 0;
          const links = source.content?.links ?? source.launchDraft?.links ?? source.links ?? {};
          return { ...source, statusTag, watcherCount, links };
        }))).filter((project) => project.statusTag !== 'DRAFT');
        return json(res, 200, { data, authority: subgraph?.enabled ? 'GOLDSKY_SUBGRAPH_READ_MODEL' : 'POSTGRES_READ_MODEL' });
      }
      if (req.method === 'GET' && url.pathname === '/v1/market/listings') {
        const listings = readModelDisabled ? [] : subgraph?.enabled ? await subgraph.listings() : await store.listings();
        return json(res, 200, { data: await attachSignedListingData(listings, store), authority: subgraph?.enabled ? 'GOLDSKY_SUBGRAPH_READ_MODEL_PLUS_SIGNED_ORDER' : 'NEX_LISTING_REGISTRY_PROJECTION' });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/v1/projects/')) {
        const identifier = decodeURIComponent(url.pathname.slice(13));
        let project = readModelDisabled ? null : await store.projectBySlug(identifier);
        if (!project && /^0x[0-9a-f]{40}$/i.test(identifier) && store.projectByEditionAddress) project = await store.projectByEditionAddress(identifier);
        return json(res, 200, { data: project });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/v1/editions/')) {
        const address = url.pathname.slice(13);
        const indexed = readModelDisabled ? null : subgraph?.enabled ? await subgraph.editionByAddress(address) : await store.editionByAddress(address);
        let linkedProject = null;
        if (indexed && store.projectByEditionAddress) linkedProject = await store.projectByEditionAddress(address);
        const commitments = store.termsCommitmentsForEdition ? await store.termsCommitmentsForEdition(address) : [];
        if (indexed && commitments.length) {
          const byHash = new Map(commitments.map((row) => [String(row.advantagesHash).toLowerCase(), row.configs]));
          const enrich = (term) => {
            const hash = String(term?.advantagesHash ?? term?.advantages_hash ?? '').toLowerCase();
            return hash && byHash.has(hash) ? { ...term, advantageConfigs: byHash.get(hash) } : term;
          };
          indexed.currentTerms = enrich(indexed.currentTerms ?? indexed.current_terms);
          indexed.current_terms = indexed.currentTerms;
          indexed.terms = Array.isArray(indexed.terms) ? indexed.terms.map(enrich) : indexed.terms;
        }
        const data = indexed && linkedProject
          ? { ...indexed, project_id: linkedProject.id, project_slug: linkedProject.slug, project_name: linkedProject.name, builder_account_id: linkedProject.builder_account_id ?? linkedProject.builderAccountId, content: linkedProject.content, project: linkedProject }
          : indexed;
        return json(res, 200, { data, authority: subgraph?.enabled ? 'GOLDSKY_SUBGRAPH_READ_MODEL_PLUS_PROJECT_CONTENT' : 'CHAIN_PROJECTION' });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/v1/passes/')) {
        const [, , , edition, tokenId] = url.pathname.split('/');
        const rawPass = readModelDisabled ? null : subgraph?.enabled ? await subgraph.pass(edition, tokenId) : await store.pass(edition, tokenId);
        if (!rawPass) return json(res, 404, { error: { code: 'NOT_FOUND', requestId } });
        return json(res, 200, { data: { ...rawPass, passVault: formatPassVault(rawPass) }, authority: subgraph?.enabled ? 'GOLDSKY_SUBGRAPH_READ_MODEL_PLUS_RPC_VERIFICATION' : 'CHAIN_PROJECTION' });
      }
      if (req.method === 'GET' && /^\/v1\/media\/[^/]+\/content$/.test(url.pathname)) {
        if (!storage?.prepareDownload || !store.mediaById) throw Object.assign(new Error('MEDIA_STORAGE_UNAVAILABLE'), { status: 503 });
        const mediaId = decodeURIComponent(url.pathname.split('/')[3]);
        const row = await store.mediaById(mediaId);
        const safetyStatus = row?.safety_status ?? row?.safetyStatus;
        if (!row || safetyStatus !== 'APPROVED') throw Object.assign(new Error('MEDIA_NOT_FOUND'), { status: 404 });
        const key = row.storage_key ?? row.storageKey;
        const download = await storage.prepareDownload({ key, expiresInSeconds: 300 });
        res.writeHead(307, { location: download.url, 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' });
        return res.end();
      }

      if (req.method === 'POST' && url.pathname === '/v1/auth/challenge') {
        const input = await readBody(req);
        const challenge = issueWalletChallenge({ accountId: `pending:${input.address?.toLowerCase()}`, address: input.address, origin: allowedOrigin, chainId });
        await store.saveChallenge(challenge);
        return json(res, 201, { nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt, chainId });
      }
      if (req.method === 'POST' && url.pathname === '/v1/auth/verify') {
        const input = await readBody(req); const challenge = await store.challenge(input.nonce);
        if (!challenge) throw Object.assign(new Error('CHALLENGE_NOT_FOUND'), { status: 404 });
        assertChallengeUsable(challenge, { accountId: challenge.accountId, address: challenge.address, origin: allowedOrigin, chainId });
        verifyWalletChallengeSignature(challenge, input.signature);
        const issued = issueSession({ accountId: 'pending', walletId: 'pending' });
        const identity = await store.consumeChallengeAndCreateSession({ challenge, session: issued.record, signature: input.signature });
        return json(res, 200, { accountId: identity.accountId, wallet: challenge.address, csrfToken: issued.csrfToken }, { 'set-cookie': sessionCookie(issued.token, { secure: secureCookies }) });
      }

      const token = cookies(req).nexmarkets_session;
      const session = token ? await store.sessionByToken(token) : null;
      if (!session) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
      assertSession(session, token, { csrfToken: req.headers['x-csrf-token'], mutation: req.method !== 'GET' });
      if (Number(session.chainId) !== Number(chainId)) throw Object.assign(new Error('SESSION_NETWORK_MISMATCH'), { status: 401 });

      if (req.method === 'POST' && url.pathname === '/v1/auth/logout') { await store.revokeSession(session.id); await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'SESSION_REVOKED', objectType: 'SESSION', objectId: session.id, requestId, correlationId }); return json(res, 200, { status: 'revoked' }, { 'set-cookie': 'nexmarkets_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' }); }
      if (req.method === 'GET' && url.pathname === '/v1/me/passes') {
        const rawPasses = readModelDisabled ? [] : await store.ownedPasses(session.walletAddress);
        const data = (rawPasses ?? []).map((pass) => ({ ...pass, passVault: formatPassVault(pass) }));
        return json(res, 200, { data, authority: 'CHAIN_PROJECTION' });
      }
      if (req.method === 'GET' && url.pathname === '/v1/me/builders') {
        const builders = store.listBuildersForAccount ? await store.listBuildersForAccount(session.accountId) : [];
        return json(res, 200, { data: builders, authority: 'BUILDER_MEMBERSHIP' });
      }
      if (req.method === 'POST' && url.pathname === '/v1/builder/identities') {
        const input = await readBody(req);
        const displayName = String(input.displayName ?? input.display_name ?? '').trim().slice(0, 80);
        if (!displayName) throw Object.assign(new Error('BUILDER_DISPLAY_NAME_REQUIRED'), { status: 400 });
        const builder = await store.createBuilderIdentity(session.accountId, { displayName, bio: String(input.bio ?? '').slice(0, 1200), links: input.links ?? {} });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'BUILDER_IDENTITY_CREATED', objectType: 'BUILDER', objectId: builder.id, requestId, correlationId });
        return json(res, 201, { data: builder, authority: 'BUILDER_MEMBERSHIP' });
      }
      if (req.method === 'PUT' && url.pathname === '/v1/builder/profile') {
        const input = await readBody(req);
        const avatarUrl = String(input.avatarUrl ?? input.avatar_url ?? '').trim();
        if (/^(?:data|blob):/i.test(avatarUrl)) throw Object.assign(new Error('INVALID_AVATAR_URL'), { status: 400 });
        const avatarMediaId = mediaIdFromUrl(avatarUrl);
        if (avatarMediaId) await assertApprovedMediaReferences(store, session.accountId, { design: { logoAssetId: avatarMediaId, logoSrc: avatarUrl } });
        const links = {
          ...(input.links && typeof input.links === 'object' ? input.links : {}),
          ...(input.handle != null ? { handle: String(input.handle).slice(0, 80) } : {}),
          ...(input.positioning != null || input.tagline != null ? { positioning: String(input.positioning ?? input.tagline).slice(0, 180) } : {}),
          ...(input.website != null ? { website: String(input.website).slice(0, 300) } : {}),
          ...(input.x != null ? { x: String(input.x).slice(0, 120) } : {})
        };
        const profile = await store.upsertBuilderProfile(session.accountId, { ...input, links }, { builderId: input.builderId ?? input.builder_id ?? url.searchParams.get('builderId') });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'BUILDER_PROFILE_UPDATED', objectType: 'BUILDER_PROFILE', objectId: profile.id, requestId, correlationId });
        return json(res, 200, { data: profile });
      }
      if (req.method === 'POST' && url.pathname === '/v1/builder/editions/link') {
        const input = await readBody(req);
        const factoryAddress = orderPolicy.transactionTargets?.EDITION_CREATE;
        if (!isAddress(factoryAddress ?? '')) throw Object.assign(new Error('PASS_FACTORY_CONFIGURATION_REQUIRED'), { status: 503 });
        if (!/^0x[0-9a-fA-F]{64}$/.test(String(input.txHash ?? ''))) throw Object.assign(new Error('TX_HASH_REQUIRED'), { status: 400 });
        if (!isAddress(input.editionAddress ?? input.edition ?? '')) throw Object.assign(new Error('EDITION_ADDRESS_REQUIRED'), { status: 400 });
        if (!chain?.getTransactionReceipt || !chain?.getTransactionByHash) throw Object.assign(new Error('RPC_RECEIPT_VERIFICATION_UNAVAILABLE'), { status: 503 });
        const txHash = String(input.txHash).toLowerCase();
        const [receipt, transaction] = await Promise.all([chain.getTransactionReceipt(txHash), chain.getTransactionByHash(txHash)]);
        if (!receipt || !transaction) throw Object.assign(new Error('FACTORY_RECEIPT_NOT_FOUND'), { status: 409 });
        if (!['0x1', '0x01', 1, true].includes(receipt.status)) throw Object.assign(new Error('FACTORY_RECEIPT_REVERTED'), { status: 409 });
        let receiptAuthority = 'RPC_FACTORY_RECEIPT';
        if (!transaction.to) throw Object.assign(new Error('FACTORY_RECEIPT_TARGET_MISMATCH'), { status: 400 });
        const transactionInput = transaction.input ?? transaction.data ?? '0x';
        if (getAddress(transaction.to) !== getAddress(factoryAddress)) {
          // The live Robinhood testnet Factory was deployed from the earlier
          // Safe-controlled release. Its createEdition(config,publisher,salt)
          // entry point is callable only by the Protocol Admin Safe, so the
          // Builder owner legitimately submits a Safe execTransaction wrapper.
          const safeAddress = orderPolicy.protocolAdminSafe;
          if (!isAddress(safeAddress) || getAddress(transaction.to) !== getAddress(safeAddress)) throw Object.assign(new Error('FACTORY_RECEIPT_TARGET_MISMATCH'), { status: 400 });
          let safeCall;
          try { safeCall = SAFE_EXEC_INTERFACE.parseTransaction({ data: transactionInput }); } catch { safeCall = null; }
          if (!safeCall || safeCall.name !== 'execTransaction') throw Object.assign(new Error('SAFE_FACTORY_EXECUTION_REQUIRED'), { status: 400 });
          const [target, value, innerData, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures] = safeCall.args;
          if (getAddress(target) !== getAddress(factoryAddress) || BigInt(value) !== 0n || Number(operation) !== 0 || BigInt(safeTxGas) !== 0n || BigInt(baseGas) !== 0n || BigInt(gasPrice) !== 0n || getAddress(gasToken) !== getAddress('0x0000000000000000000000000000000000000000') || getAddress(refundReceiver) !== getAddress('0x0000000000000000000000000000000000000000')) throw Object.assign(new Error('SAFE_FACTORY_CALL_MISMATCH'), { status: 400 });
          let legacyCall;
          try { legacyCall = FACTORY_LEGACY_INTERFACE.parseTransaction({ data: innerData }); } catch { legacyCall = null; }
          if (!legacyCall || legacyCall.name !== 'createEdition') throw Object.assign(new Error('LEGACY_FACTORY_CALL_REQUIRED'), { status: 400 });
          const config = legacyCall.args[0];
          if (getAddress(config.initialOwner) !== getAddress(safeAddress) || getAddress(legacyCall.args[1]) !== getAddress(session.walletAddress)) throw Object.assign(new Error('SAFE_FACTORY_PUBLISHER_MISMATCH'), { status: 403 });
          // Safe emits ExecutionSuccess with the exact EIP-712 transaction
          // hash it executed.  Verify the Builder signature against that
          // receipt-bound hash.  Some Robinhood RPC nodes do not retain the
          // historical Safe storage needed for an eth_call at the receipt
          // block, while the event remains authoritative and immutable.
          const executionLog = (receipt.logs ?? []).find((entry) => entry?.address && getAddress(entry.address) === getAddress(safeAddress) && String(entry.topics?.[0] ?? '').toLowerCase() === SAFE_EXECUTION_SUCCESS_TOPIC && entry.topics?.[1]);
          const safeHash = executionLog ? String(executionLog.topics[1]).toLowerCase() : null;
          if (!safeHash) {
            if (!chain.ethCall) throw Object.assign(new Error('SAFE_RECEIPT_VERIFICATION_UNAVAILABLE'), { status: 503 });
            const blockTag = `0x${BigInt(receipt.blockNumber).toString(16)}`;
            const nonceRaw = await chain.ethCall(safeAddress, SAFE_NONCE_SELECTOR, blockTag);
            const nonceAfter = BigInt(nonceRaw);
            if (nonceAfter === 0n) throw Object.assign(new Error('SAFE_NONCE_UNAVAILABLE'), { status: 409 });
            const safeHashData = SAFE_HASH_INTERFACE.encodeFunctionData('getTransactionHash', [target, value, innerData, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonceAfter - 1n]);
            const reconstructed = await chain.ethCall(safeAddress, safeHashData, blockTag);
            if (recoverAddress(reconstructed, signatures) !== getAddress(session.walletAddress)) throw Object.assign(new Error('SAFE_SIGNATURE_MISMATCH'), { status: 403 });
          } else if (recoverAddress(safeHash, signatures) !== getAddress(session.walletAddress)) {
            throw Object.assign(new Error('SAFE_SIGNATURE_MISMATCH'), { status: 403 });
          }
          receiptAuthority = 'RPC_SAFE_EXECUTION_PLUS_FACTORY_RECEIPT';
        }
        const created = parseFactoryEditionCreatedReceipt(receipt, { factoryAddress, publisherAddress: session.walletAddress, editionAddress: input.editionAddress ?? input.edition });
        if (created.txHash && created.txHash !== txHash) throw Object.assign(new Error('FACTORY_RECEIPT_HASH_MISMATCH'), { status: 400 });
        const linked = await store.linkEditionToProject({
          accountId: session.accountId,
          builderId: input.builderId ?? input.builder_id ?? null,
          projectId: input.projectId ?? input.project_id,
          edition: {
            chainId,
            edition: created.edition,
            editionId: created.editionId,
            factoryAddress: getAddress(factoryAddress),
            publisher: created.publisher,
            absoluteSupplyCap: created.absoluteSupplyCap,
            artworkCommitment: created.artworkCommitment,
            blockNumber: created.blockNumber,
            blockHash: created.blockHash || String(receipt.blockHash ?? '').toLowerCase(),
            txHash,
            logIndex: created.logIndex
          }
        });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'EDITION_LINKED_TO_PROJECT', objectType: 'EDITION', objectId: linked.id, requestId, correlationId, metadata: { txHash, projectId: linked.project_id, editionAddress: linked.edition_address } });
        return json(res, 200, { data: linked, authority: `${receiptAuthority}_PLUS_POSTGRES_PROJECT_LINK` });
      }
      if (req.method === 'POST' && url.pathname === '/v1/builder/milestones') {
        const input = await readBody(req);
        const milestone = await store.createMilestone(input.builderId ?? input.builder_id ?? session.accountId, input);
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'BUILDER_MILESTONE_CREATED', objectType: 'BUILDER_MILESTONE', objectId: milestone.id, requestId, correlationId });
        return json(res, 201, { data: milestone });
      }
      if (req.method === 'POST' && /^\/v1\/builders\/[^/]+\/questions$/.test(url.pathname)) {
        const builderId = url.pathname.split('/')[3];
        const profile = await store.getBuilderProfile(builderId);
        if (!profile) throw Object.assign(new Error('BUILDER_NOT_FOUND'), { status: 404 });
        const input = await readBody(req);
        const question = await store.createQuestion(session.accountId, profile.builder_id ?? profile.builderId ?? profile.id ?? builderId, input);
        return json(res, 201, { data: question });
      }
      if (req.method === 'POST' && /^\/v1\/builder\/questions\/[^/]+\/answer$/.test(url.pathname)) {
        const questionId = url.pathname.split('/')[4];
        const input = await readBody(req);
        const question = await store.answerQuestion(session.accountId, questionId, input);
        return json(res, 200, { data: question });
      }
      if (req.method === 'POST' && /^\/v1\/builders\/[^/]+\/follow$/.test(url.pathname)) {
        const builderId = url.pathname.split('/')[3];
        const result = await store.followBuilder(session.accountId, builderId);
        return json(res, 200, { data: result });
      }
      if (req.method === 'DELETE' && /^\/v1\/builders\/[^/]+\/follow$/.test(url.pathname)) {
        const builderId = url.pathname.split('/')[3];
        const result = await store.unfollowBuilder(session.accountId, builderId);
        return json(res, 200, { data: result });
      }
      if (req.method === 'GET' && /^\/v1\/builders\/[^/]+\/follow-status$/.test(url.pathname)) {
        const builderId = url.pathname.split('/')[3];
        const status = await store.getFollowStatus(session.accountId, builderId);
        return json(res, 200, { data: status });
      }
      if (req.method === 'GET' && url.pathname === '/v1/me/following') {
        const followed = await store.getFollowedBuilders(session.accountId);
        return json(res, 200, { data: followed });
      }
      if (req.method === 'POST' && /^\/v1\/projects\/[^/]+\/watch$/.test(url.pathname)) {
        const slug = decodeURIComponent(url.pathname.split('/')[3]);
        const result = await store.watchProject(session.accountId, slug);
        return json(res, 200, { data: result });
      }
      if (req.method === 'DELETE' && /^\/v1\/projects\/[^/]+\/watch$/.test(url.pathname)) {
        const slug = decodeURIComponent(url.pathname.split('/')[3]);
        const result = await store.unwatchProject(session.accountId, slug);
        return json(res, 200, { data: result });
      }
      if (req.method === 'GET' && url.pathname === '/v1/me/watchlist') {
        const watchlist = await store.getWatchlist(session.accountId);
        return json(res, 200, { data: watchlist });
      }
      if (req.method === 'GET' && url.pathname === '/v1/feed') {
        const feed = await store.getFeed(session.accountId);
        return json(res, 200, { data: feed });
      }
      if (req.method === 'GET' && url.pathname === '/v1/me/advantages') return json(res, 200, { data: readModelDisabled ? [] : await store.advantagesForOwner(session.walletAddress), authority: 'NEX_ADVANTAGE_REGISTRY_PROJECTION' });
      if (req.method === 'GET' && url.pathname === '/v1/builder/drafts') {
        const dashboard = readModelDisabled ? { projects: [] } : await store.builderDashboard(session.accountId, { builderId: url.searchParams.get('builderId') });
        const drafts = (dashboard.projects ?? []).filter((project) => String(project.status ?? '').toUpperCase() === 'DRAFT');
        return json(res, 200, { data: drafts });
      }
      if (req.method === 'GET' && /^\/v1\/builder\/drafts\/[^/]+$/.test(url.pathname)) {
        const draftId = decodeURIComponent(url.pathname.split('/')[4]);
        const dashboard = readModelDisabled ? { projects: [] } : await store.builderDashboard(session.accountId, { builderId: url.searchParams.get('builderId') });
        const draft = (dashboard.projects ?? []).find((project) => project.content?.draftId === draftId || project.launchDraft?.draftId === draftId || project.id === draftId);
        if (!draft) throw Object.assign(new Error('DRAFT_NOT_FOUND'), { status: 404 });
        return json(res, 200, { data: draft });
      }
      if (req.method === 'GET' && url.pathname === '/v1/builder/dashboard') return json(res, 200, { data: readModelDisabled ? { projects: [], editions: [], royalties: [], referrals: [], primarySales: [], earnings: { grossAmountUsdg: '0', nexmarketsFeeUsdg: '0', builderProceedsUsdg: '0', referralObligationUsdg: '0', salesCount: 0, unitsSold: 0 } } : await store.builderDashboard(session.accountId, { builderId: url.searchParams.get('builderId') }), authority: 'POSTGRES_BUILDER_AND_PRIMARY_ACCOUNTING' });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/transactions/')) { const tx = await store.transaction(url.pathname.slice(17), session.accountId, chainId); if (!tx) throw Object.assign(new Error('NOT_FOUND'), { status: 404 }); return json(res, 200, { data: tx }); }
      if (req.method === 'POST' && /^\/v1\/transactions\/[^/]+\/events$/.test(url.pathname)) {
        const id = url.pathname.split('/')[3]; const input = await readBody(req);
        const transaction = await store.transaction(id, session.accountId, chainId);
        if (!transaction) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
        if (!['WALLET_PENDING', 'SUBMITTED', 'CANCELLED'].includes(input.state)) throw Object.assign(new Error('USER_TRANSACTION_STATE_REJECTED'), { status: 400 });
        if (transaction.state !== input.state) transitionTransaction(transaction.state, input.state);
        if (input.state === 'SUBMITTED' && !/^0x[0-9a-fA-F]{64}$/.test(input.txHash ?? '')) throw Object.assign(new Error('TX_HASH_REQUIRED'), { status: 400 });
        const eventId = String(input.eventId ?? '').slice(0, 160);
        if (!eventId) throw Object.assign(new Error('EVENT_ID_REQUIRED'), { status: 400 });
        const updated = await store.updateTransaction({ id, accountId: session.accountId, eventId, fromState: transaction.state, toState: input.state, evidence: { txHash: input.txHash?.toLowerCase() } });
        return json(res, 200, { data: updated });
      }
      if (req.method === 'POST' && url.pathname === '/v1/builder/projects') {
        const input = await readBody(req);
        const draftIntent = String(input.intent ?? input.status ?? '').trim().toUpperCase() === 'DRAFT';
        if (draftIntent) {
          const normalized = validateAndNormalizeProjectPayload(input, { status: 'DRAFT', allowIncomplete: true, freezeAssignments: false });
          const project = await store.createProject({
            accountId: session.accountId,
            builderId: input.builderId ?? input.builder_id ?? url.searchParams.get('builderId'),
            body: {
              slug: normalized.slug,
              name: normalized.name,
              summary: normalized.summary,
              status: 'DRAFT',
              launchDraft: normalized.launchDraft
            }
          });
          await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'PROJECT_DRAFT_SAVED', objectType: 'PROJECT', objectId: project.id, requestId, correlationId });
          return json(res, 201, { data: project });
        }
        // Creating a Pass is an immediate public product action. On-chain
        // Edition deployment is a separate workflow and must not gate this
        // record's creation.
        const normalized = validateAndNormalizeProjectPayload(input, { status: 'PUBLISHED', freezeAssignments: true });
        const debutAt = new Date(normalized.launchDraft.preview.opensAt);
        const hasExplicitTiming = Boolean(input.launchDraft?.preview?.opensAt || input.launchDraft?.preview?.startsAt);
        if (hasExplicitTiming && input.publicationMode !== 'ONCHAIN' && (Number.isNaN(debutAt.getTime()) || debutAt.getTime() < Date.now() + 24 * 60 * 60 * 1000)) {
          throw Object.assign(new Error('PREVIEW_WINDOW_REQUIRED'), { status: 400 });
        }
        normalized.launchDraft.preview.startsAt = normalized.launchDraft.preview.startsAt || new Date().toISOString();
        normalized.launchDraft.preview.publishedAt = new Date().toISOString();
        normalized.launchDraft.preview.termsVersion = normalized.launchDraft.preview.termsVersion || 'v1.0';
        assertLaunchArtworkReady(normalized.launchDraft);
        await assertApprovedMediaReferences(store, session.accountId, normalized.launchDraft);
        const project = await store.createProject({
          accountId: session.accountId,
          builderId: input.builderId ?? input.builder_id ?? url.searchParams.get('builderId'),
          body: {
            slug: normalized.slug,
            name: normalized.name,
            summary: normalized.summary,
            status: normalized.status,
            launchDraft: normalized.launchDraft
          }
        });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'PROJECT_CREATED', objectType: 'PROJECT', objectId: project.id, requestId, correlationId });
        return json(res, 201, { data: project });
      }
      if ((req.method === 'POST' && url.pathname === '/v1/builder/drafts') || (req.method === 'PUT' && /^\/v1\/builder\/drafts\/[^/]+$/.test(url.pathname))) {
        const input = await readBody(req);
        const routeDraftId = req.method === 'PUT' ? decodeURIComponent(url.pathname.split('/')[4]) : null;
        const draftId = String(routeDraftId ?? input.draftId ?? input.launchDraft?.draftId ?? `draft-${randomUUID()}`).slice(0, 120);
        const launchDraft = { ...(input.launchDraft ?? {}), draftId, status: 'DRAFT' };
        const normalized = validateAndNormalizeProjectPayload({ ...input, draftId, launchDraft, status: 'DRAFT' }, { status: 'DRAFT', allowIncomplete: true });
        const project = await store.createProject({
          accountId: session.accountId,
          builderId: input.builderId ?? input.builder_id ?? url.searchParams.get('builderId'),
          body: {
            slug: normalized.slug,
            name: normalized.name,
            summary: normalized.summary,
            status: 'DRAFT',
            launchDraft: normalized.launchDraft
          }
        });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'PROJECT_DRAFT_SAVED', objectType: 'PROJECT', objectId: project.id, requestId, correlationId });
        return json(res, 200, { data: project });
      }
      if (req.method === 'POST' && url.pathname === '/v1/media/uploads') {
        if (!storage?.prepareUpload) throw Object.assign(new Error('MEDIA_STORAGE_UNAVAILABLE'), { status: 503 });
        const input = await readBody(req);
        if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MEDIA_POLICY.maxBytes || !/^image\/(jpeg|png|webp|avif)$/.test(input.mimeType ?? '') || !/^[0-9a-f]{64}$/.test(input.sha256 ?? '')) throw Object.assign(new Error('INVALID_MEDIA'), { status: 400 });
        const extension = String(input.filename ?? '').split('.').pop()?.toLowerCase();
        const extensions = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/avif': ['avif'] };
        if (!extensions[input.mimeType]?.includes(extension)) throw Object.assign(new Error('MIME_EXTENSION_MISMATCH'), { status: 400 });
        const key = `${session.accountId}/${randomUUID()}/${String(input.filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const row = await store.createMedia({ accountId: session.accountId, metadata: { storageKey: key, filename: input.filename, mimeType: input.mimeType, byteSize: input.byteSize, sha256: input.sha256, safetyStatus: 'PENDING' } });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'MEDIA_UPLOAD_PREPARED', objectType: 'MEDIA', objectId: row.id, requestId, correlationId, metadata: { mimeType: input.mimeType, byteSize: input.byteSize } });
        const asset = mediaAssetView(row);
        if (asset.safetyStatus === 'APPROVED' && asset.url) return json(res, 200, { data: { asset, upload: null, deduplicated: true } });
        const storageKey = row.storage_key ?? row.storageKey;
        return json(res, 201, { data: { asset, upload: await storage.prepareUpload({ key: storageKey, mimeType: input.mimeType, byteSize: input.byteSize, sha256: input.sha256 }), deduplicated: storageKey !== key } });
      }
      if (req.method === 'POST' && /^\/v1\/media\/[^/]+\/complete$/.test(url.pathname)) {
        if (!storage?.readObject || !store.mediaById || !store.approveMedia) throw Object.assign(new Error('MEDIA_STORAGE_UNAVAILABLE'), { status: 503 });
        const mediaId = decodeURIComponent(url.pathname.split('/')[3]);
        const row = await store.mediaById(mediaId);
        const ownerAccountId = row?.owner_account_id ?? row?.ownerAccountId;
        if (!row) throw Object.assign(new Error('MEDIA_NOT_FOUND'), { status: 404 });
        if (ownerAccountId !== session.accountId) throw Object.assign(new Error('MEDIA_OWNER_MISMATCH'), { status: 403 });
        const existing = mediaAssetView(row);
        if (existing.safetyStatus === 'APPROVED' && existing.url) return json(res, 200, { data: { asset: existing, deduplicated: true } });
        const storageKey = row.storage_key ?? row.storageKey;
        const expectedMime = row.mime_type ?? row.mimeType;
        const expectedSize = Number(row.byte_size ?? row.byteSize);
        const expectedHash = String(row.sha256 || '').toLowerCase();
        const object = await storage.readObject({ key: storageKey, maxBytes: MEDIA_POLICY.maxBytes });
        const inspected = inspectImageBytes({ bytes: object.bytes, mimeType: expectedMime });
        if (inspected.byteSize !== expectedSize) throw Object.assign(new Error('MEDIA_SIZE_MISMATCH'), { status: 400 });
        if (inspected.sha256 !== expectedHash || (object.metadataChecksum && object.metadataChecksum.toLowerCase() !== expectedHash)) throw Object.assign(new Error('MEDIA_CHECKSUM_MISMATCH'), { status: 400 });
        const publicUrl = `/v1/media/${encodeURIComponent(row.id)}/content`;
        const approved = await store.approveMedia({ id: row.id, accountId: session.accountId, publicUrl, width: inspected.width, height: inspected.height, mimeType: inspected.mimeType, byteSize: inspected.byteSize, sha256: inspected.sha256 });
        if (!approved) throw Object.assign(new Error('MEDIA_OWNER_MISMATCH'), { status: 403 });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'MEDIA_UPLOAD_VERIFIED', objectType: 'MEDIA', objectId: row.id, requestId, correlationId, metadata: { mimeType: inspected.mimeType, byteSize: inspected.byteSize, width: inspected.width, height: inspected.height, sha256: inspected.sha256 } });
        return json(res, 200, { data: { asset: mediaAssetView(approved), deduplicated: false } });
      }

      if (req.method === 'POST' && url.pathname === '/v1/listings/signed-order') {
        const input = await readBody(req); const listing = await store.listing(input.orderHash ?? '');
        if (String(input.order?.offerer ?? '').toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error('SELLER_SESSION_MISMATCH'), { status: 403 });
        const computedHash = seaportOrderHash(input.order, input.counter);
        if (computedHash.toLowerCase() !== String(input.orderHash).toLowerCase()) throw Object.assign(new Error('ORDER_HASH_MISMATCH'), { status: 400 });
        if (listing) validateProjectedNexMarketsOrder(input.order, listing, orderPolicy);
        else if (String(input.order.zone).toLowerCase() !== String(orderPolicy.zone).toLowerCase()) throw Object.assign(new Error('ZONE_MISMATCH'), { status: 400 });
        verifySeaportOrderSignature({ order: input.order, counter: input.counter, signature: input.signature, chainId: session.chainId, seaport: orderPolicy.seaport });
        const stored = await store.storeSignedOrder({ accountId: session.accountId, chainId: session.chainId, orderHash: computedHash, seller: session.walletAddress, order: input.order, counter: input.counter, signature: input.signature });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'SEAPORT_ORDER_STORED', objectType: 'LISTING', objectId: computedHash, requestId, correlationId });
        return json(res, 201, { data: stored, authority: 'SIGNED_ORDER_CAPABILITY_ONLY' });
      }

      if (req.method === 'POST' && url.pathname === '/v1/listings/buy') {
        const input = await readBody(req); const idempotencyKey = req.headers['idempotency-key']?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'), { status: 400 });
        const signed = await store.signedOrder(input.orderHash ?? '');
        if (!signed || signed.status !== 'ACTIVE' || new Date(signed.expires_at ?? signed.expiresAt).getTime() <= Date.now()) throw Object.assign(new Error('ACTIVE_SIGNED_LISTING_REQUIRED'), { status: 409 });
        const order = signed.order_payload ?? signed.order;
        const listing = await store.listing(input.orderHash); validateProjectedNexMarketsOrder(order, listing, orderPolicy);
        verifySeaportOrderSignature({ order, counter: signed.counter, signature: signed.signature, chainId: session.chainId, seaport: orderPolicy.seaport });
        const prepared = buildSeaportFulfillment({ order, signature: signed.signature, seaport: orderPolicy.seaport });
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: 'LISTING_BUY', intentId: input.orderHash, idempotencyKey, correlationId, requestId, toAddress: prepared.to, calldata: prepared.data });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'TRANSACTION_PREPARED', objectType: 'CHAIN_TRANSACTION', objectId: transaction.id, requestId, correlationId, metadata: { intentType: 'LISTING_BUY', orderHash: input.orderHash } });
        return json(res, 201, { transaction, prepared, totalBuyerPayment: String(listing.price_usdg ?? listing.priceUsdg), walletMustSign: true, serverCustodiesKey: false });
      }

      if (req.method === 'POST' && url.pathname === '/v1/terms/hash') {
        const input = await readBody(req);
        const advantagesHash = canonicalAdvantagesHash(input.configs ?? input.advantageConfigs ?? []);
        if (!advantagesHash) throw Object.assign(new Error('ADVANTAGES_COMMITMENT_INVALID'), { status: 400 });
        return json(res, 200, { data: { advantagesHash } });
      }

      if (req.method === 'POST' && INTENT_TYPE[url.pathname]) {
        const input = await readBody(req); const idempotencyKey = req.headers['idempotency-key']?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'), { status: 400 });
        let prepared = { calldata: input.calldata ?? null, payload: input };
        if (url.pathname === '/v1/listings/prepare') {
          if (String(input.seller).toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error('SELLER_SESSION_MISMATCH'), { status: 403 });
          // Deployment policy wins over untrusted request fields.
          prepared = buildNexMarketsOrder({ ...input, ...orderPolicy });
          if (prepared.orderHash) prepared.typedData = seaportTypedData(prepared.order, input.counter, { chainId: session.chainId, seaport: orderPolicy.seaport });
        } else {
          const intentType = INTENT_TYPE[url.pathname]; const target = orderPolicy.transactionTargets?.[intentType];
          if (!isAddress(target ?? '')) throw Object.assign(new Error('CONTRACT_CONFIGURATION_REQUIRED'), { status: 503 });
          if (input.to !== undefined && (!isAddress(input.to) || getAddress(input.to) !== getAddress(target))) throw Object.assign(new Error('TRANSACTION_TARGET_REJECTED'), { status: 400 });
          let calldata = input.calldata; const protocolInput = input;
          if (intentType === 'TERMS_PUBLISH') {
            if (!isAddress(input.edition ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(input.terms?.advantagesHash ?? '')) throw Object.assign(new Error('TERMS_COMMITMENT_REQUIRED'), { status: 400 });
            const computedAdvantagesHash = canonicalAdvantagesHash(input.advantageConfigs ?? []);
            if (!computedAdvantagesHash || computedAdvantagesHash.toLowerCase() !== input.terms.advantagesHash.toLowerCase()) throw Object.assign(new Error('ADVANTAGES_COMMITMENT_MISMATCH'), { status: 400 });
            await store.saveTermsCommitment?.({ builderAccountId: session.accountId, builderId: input.builderId ?? input.builder_id ?? null, editionAddress: input.edition, advantagesHash: input.terms.advantagesHash, termsPayload: input.terms, configs: input.advantageConfigs ?? [] });
            // The persisted commitment and calldata must describe the same
            // Terms snapshot; callers cannot substitute opaque calldata here.
            calldata = undefined;
          }
          if (intentType === 'MINT' && input.edition && input.termsVersionHash) {
            // A prepared transaction is not an authorization to mint. The
            // API must reject Preview/closed Editions before a wallet can
            // broadcast anything; the Edition/MintController remains the
            // final on-chain authority as well.
            let indexedEdition = null;
            try { indexedEdition = subgraph?.enabled ? await subgraph.editionByAddress(input.edition) : await store.editionByAddress?.(input.edition); } catch {}
            const terms = indexedEdition?.currentTerms ?? indexedEdition?.current_terms ?? null;
            const activeHash = terms?.hash ?? terms?.terms_hash ?? terms?.termsHash ?? indexedEdition?.active_terms_hash ?? null;
            if (!terms || !activeHash) throw Object.assign(new Error('MINT_TERMS_REQUIRED'), { status: 409 });
            if (String(activeHash).toLowerCase() !== String(input.termsVersionHash).toLowerCase()) throw Object.assign(new Error('MINT_TERMS_STALE'), { status: 409 });
            const now = Math.floor(Date.now() / 1000);
            const starts = epochSeconds(terms.mintStartsAt ?? terms.mint_starts_at ?? indexedEdition.mint_starts_at);
            const ends = epochSeconds(terms.mintEndsAt ?? terms.mint_ends_at ?? indexedEdition.mint_ends_at);
            if (starts == null || now < starts) throw Object.assign(new Error('MINT_NOT_OPEN_PREVIEW'), { status: 409 });
            if (ends != null && now >= ends) throw Object.assign(new Error('MINT_CLOSED'), { status: 409 });
            const cap = Number(indexedEdition.absolute_supply_cap ?? indexedEdition.absoluteSupplyCap ?? 0);
            const minted = Number(indexedEdition.total_minted ?? indexedEdition.totalMinted ?? 0);
            const quantity = Number(input.quantity ?? 1);
            if (cap > 0 && minted + quantity > cap) throw Object.assign(new Error('SUPPLY_EXHAUSTED'), { status: 409 });
          }
          if (calldata === undefined) calldata = buildProtocolCalldata(intentType, protocolInput, { walletAddress: session.walletAddress, idempotencyKey });
          if (!/^0x[0-9a-fA-F]+$/.test(calldata ?? '') || !INTENT_SELECTORS[intentType]?.includes(calldata.slice(0, 10).toLowerCase())) throw Object.assign(new Error('CALLDATA_SELECTOR_REJECTED'), { status: 400 });
          prepared = { to: getAddress(target), data: calldata, value: '0x0' };
        }
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: INTENT_TYPE[url.pathname], intentId: input.intentId ?? idempotencyKey, idempotencyKey, correlationId, requestId, toAddress: prepared.to ?? prepared.registryTransaction?.to ?? null, calldata: prepared.data ?? prepared.registryTransaction?.data ?? null });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'TRANSACTION_PREPARED', objectType: 'CHAIN_TRANSACTION', objectId: transaction.id, requestId, correlationId, metadata: { intentType: INTENT_TYPE[url.pathname] } });
        return json(res, 201, { transaction, prepared, walletMustSign: true, serverCustodiesKey: false });
      }
      return json(res, 404, { error: { code: 'NOT_FOUND', requestId } });
    } catch (error) {
      metrics.increment('nexmarkets_api_failures_total');
      const clientFailure = /(?:INVALID|MISMATCH|REJECTED|REQUIRED|CONFLICT|expired|consumed|challenge|signature|wrong|extra|surcharge|price|tokenId|listing|seller|zoneHash|royaltyBps|CALLDATA|TARGET|PROJECT_BUILDER|PRODUCTION_READINESS)/i.test(error.message);
      const status = error.status ?? (/AUTH|SESSION/.test(error.message) ? 401 : /CSRF|ORIGIN/.test(error.message) ? 403 : clientFailure ? 400 : 500);
      const code = status >= 500 && !/PRODUCTION_READINESS/.test(error.message) ? 'INTERNAL_ERROR' : error.message;
      logger.error?.({ event: 'api_request_failed', requestId, correlationId, method: req.method, path: req.url?.split('?')[0], code, error: error.message, durationMs: Date.now() - startedAt });
      return json(res, status, { error: { code, requestId } });
    } finally {
      logger.info?.({ event: 'api_request_complete', requestId, correlationId, method: req.method, path: req.url?.split('?')[0], durationMs: Date.now() - startedAt });
    }
  });
}

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const store = new PostgresStore(); const port = Number(process.env.PORT || 4010); const networkConfigs = createNetworkConfigs(process.env); const defaultKey = process.env.NEXMARKETS_DEFAULT_NETWORK ?? (process.env.ROBINHOOD_CHAIN_ID ? networkKeyForChainId(Number(process.env.ROBINHOOD_CHAIN_ID)) : 'base-sepolia'); const configured = networkConfigs[defaultKey ?? 'base-sepolia']; const chainId = configured.chainId; const rpc = configured.chain; const subgraph = configured.subgraph;
  const secureCookies = process.env.SECURE_COOKIES === 'true' ? true : process.env.SECURE_COOKIES === 'false' ? false : process.env.NODE_ENV !== 'test';
  const requireIndexedReadiness = process.env.REQUIRE_INDEXED_READINESS !== 'false';
  const logger = process.env.LOG_API_ERRORS === 'true' ? console : { info() {}, error() {} };
  const storage = createObjectStorageFromEnv(process.env);
  const server = createApiServer({ store, chainId, chain: rpc, subgraph, secureCookies, logger, storage, maxIndexerLagBlocks: Number(process.env.INDEXER_MAX_LAG_BLOCKS ?? 120), maxFinalityLagBlocks: Number(process.env.INDEXER_MAX_FINALITY_LAG_BLOCKS ?? 120), orderPolicy: configured.orderPolicy, networkConfigs, requireIndexedReadiness, productionReadiness: configured.productionReadiness, requireProductionReadiness: process.env.NODE_ENV === 'production' });
  server.listen(port, () => console.log(JSON.stringify({ event: 'api_started', port })));
  const shutdown = async () => { server.close(); await store.close(); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

let defaultServerlessListener = null;

export default async function handler(req, res) {
  if (!defaultServerlessListener) {
    const networkConfigs = createNetworkConfigs(process.env);
    const requestedChainId = process.env.ROBINHOOD_CHAIN_ID ? Number(process.env.ROBINHOOD_CHAIN_ID) : null;
    const configured = networkConfigs[process.env.NEXMARKETS_DEFAULT_NETWORK ?? (requestedChainId ? networkKeyForChainId(requestedChainId) : 'base-sepolia') ?? 'base-sepolia'];
    const chainId = configured.chainId;
    const rpc = configured.chain;
    const subgraph = configured.subgraph;
    const storage = createObjectStorageFromEnv(process.env);
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED_FOR_PRODUCTION');
    let store = null;
    if (process.env.DATABASE_URL) {
      store = new PostgresStore({ connectionString: process.env.DATABASE_URL });
    } else {
      const { MemoryStore } = await import('./memory-store.mjs'); store = new MemoryStore();
    }
    const server = createApiServer({
      store,
      chainId,
      chain: rpc,
      subgraph,
      allowedOrigin: process.env.APP_ORIGIN ?? 'https://nexmarkets.fun',
      secureCookies: process.env.NODE_ENV === 'production',
      orderPolicy: configured.orderPolicy,
      networkConfigs,
      rateLimiter: new RateLimiter({ limit: 300, windowMs: 60_000 }),
      storage,
      requireIndexedReadiness: false,
      productionReadiness: productionReadinessFromEnv(process.env),
      requireProductionReadiness: isProduction
    });
    defaultServerlessListener = server.listeners('request')[0];
  }
  if (req.url.startsWith('/api/v1/')) req.url = req.url.replace('/api/v1/', '/v1/');
  else if (req.url === '/api/v1') req.url = '/v1/discover';
  else if (req.url.startsWith('/api/')) req.url = req.url.replace('/api/', '/');
  return defaultServerlessListener(req, res);
}
