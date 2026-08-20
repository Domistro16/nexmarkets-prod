import { readFile } from 'node:fs/promises';
import { id } from 'ethers';
import { parseDocument } from 'yaml';

const chains = JSON.parse(await readFile(new URL('../goldsky/robinhood-chains.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../goldsky/nexmarkets-events.json', import.meta.url), 'utf8'));
const pipeline = await readFile(new URL('../goldsky/nexmarkets-robinhood.turbo.yaml', import.meta.url), 'utf8');
const parsed = parseDocument(pipeline);
if (parsed.errors.length) throw new Error(`Invalid Goldsky YAML: ${parsed.errors[0].message}`);
const config = parsed.toJS();

if (chains.provider !== 'GOLDSKY_TURBO' || chains.customChainEnablementRequired !== true) throw new Error('Goldsky Turbo authority missing');
if (chains.networks['robinhood-mainnet'].chainId !== 4663 || chains.networks['robinhood-testnet'].chainId !== 46630) throw new Error('Robinhood chain configuration invalid');
if (!pipeline.includes('__ROBINHOOD_DATASET_PREFIX__.raw_logs') || !pipeline.includes('type: postgres')) throw new Error('Turbo pipeline source/sink incomplete');
if (!pipeline.includes('primary_key: chain_id,transaction_hash,log_index')) throw new Error('Goldsky idempotency key missing');
if (!pipeline.includes('__NEXMARKETS_EVENT_TOPIC0_LIST__')) throw new Error('Goldsky event topic deployment placeholder missing');
if (!config.sources?.robinhood_logs || !config.sources?.robinhood_blocks || !config.transforms?.nexmarkets_logs || !config.sinks?.postgres_events) throw new Error('Goldsky YAML topology incomplete');
const requiredRoles = ['NexPassFactory','NexLaunchRegistry','NexMintController','NexPassEdition','NexAdvantageRegistry','NexListingRegistry','NexRoyaltyVault','ERC6551Registry','Seaport16'];
for (const role of requiredRoles) if (!catalog.events.some((event) => event.role === role)) throw new Error(`Goldsky event role missing: ${role}`);
const topics = catalog.events.map((event) => ({ ...event, topic0: id(event.signature) }));
if (new Set(topics.map((event) => event.topic0)).size !== topics.length) throw new Error('Duplicate event topic');
const referral = catalog.events.find((event) => event.signature.startsWith('ReferralHintSubmitted'));
if (referral?.canonical !== false) throw new Error('Referral hint must remain noncanonical');
console.log(JSON.stringify({ status: 'PASS', provider: chains.provider, events: topics.length, externalPrerequisite: 'GOLDSKY_DEDICATED_ROBINHOOD_CHAIN_ENABLEMENT' }));
