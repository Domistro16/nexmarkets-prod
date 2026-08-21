import { readFile } from 'node:fs/promises';
import { id } from 'ethers';
import { parseDocument } from 'yaml';

const chains = JSON.parse(await readFile(new URL('../goldsky/robinhood-chains.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../goldsky/nexmarkets-events.json', import.meta.url), 'utf8'));
const pipeline = await readFile(new URL('../goldsky/nexmarkets-robinhood.turbo.yaml', import.meta.url), 'utf8');
const parsed = parseDocument(pipeline);
if (parsed.errors.length) throw new Error(`Invalid Goldsky YAML: ${parsed.errors[0].message}`);
const config = parsed.toJS();

if (chains.provider !== 'GOLDSKY_TURBO' || chains.customChainEnablementRequired !== false) throw new Error('Goldsky Turbo authority missing');
if (chains.networks['robinhood-mainnet'].chainId !== 4663 || chains.networks['robinhood-testnet'].chainId !== 46630) throw new Error('Robinhood chain configuration invalid');
if (chains.networks['robinhood-mainnet'].datasetPrefix !== 'robinhood_mainnet' || chains.networks['robinhood-testnet'].datasetPrefix !== 'robinhood_testnet') throw new Error('Goldsky dataset prefix configuration invalid');
if (chains.networks['robinhood-mainnet'].rawLogsVersion !== '1.1.0' || chains.networks['robinhood-mainnet'].rawBlocksVersion !== '1.1.0') throw new Error('Goldsky mainnet dataset versions invalid');
if (chains.networks['robinhood-testnet'].rawLogsVersion !== '1.1.0' || chains.networks['robinhood-testnet'].rawBlocksVersion !== '1.0.0') throw new Error('Goldsky testnet dataset versions invalid');
if (chains.networks['robinhood-mainnet'].status !== 'SUPPORTED' || chains.networks['robinhood-testnet'].status !== 'SUPPORTED') throw new Error('Goldsky Robinhood support status invalid');
if (!pipeline.includes('__ROBINHOOD_DATASET_PREFIX__.raw_logs') || !pipeline.includes('type: postgres')) throw new Error('Turbo pipeline source/sink incomplete');
if (!pipeline.includes('primary_key: chain_id,transaction_hash,log_index')) throw new Error('Goldsky idempotency key missing');
if (!pipeline.includes('__NEXMARKETS_EVENT_TOPIC0_LIST__')) throw new Error('Goldsky event topic deployment placeholder missing');
if (!config.sources?.robinhood_logs || !config.sources?.robinhood_blocks || !config.transforms?.nexmarkets_logs || !config.transforms?.nexmarkets_watermarks || !config.sinks?.postgres_events || !config.sinks?.postgres_watermarks) throw new Error('Goldsky YAML topology incomplete');
const requiredRoles = ['NexPassFactory','NexLaunchRegistry','NexMintController','NexPassEdition','NexAdvantageRegistry','NexListingRegistry','NexRoyaltyVault','ERC6551Registry','Seaport16'];
for (const role of requiredRoles) if (!catalog.events.some((event) => event.role === role)) throw new Error(`Goldsky event role missing: ${role}`);
const topics = catalog.events.map((event) => ({ ...event, topic0: id(event.signature) }));
if (new Set(topics.map((event) => event.topic0)).size !== topics.length) throw new Error('Duplicate event topic');
const referral = catalog.events.find((event) => event.signature.startsWith('ReferralHintSubmitted'));
if (referral?.canonical !== false) throw new Error('Referral hint must remain noncanonical');
console.log(JSON.stringify({ status: 'PASS', provider: chains.provider, events: topics.length, networks: ['robinhood-mainnet', 'robinhood-testnet'] }));
