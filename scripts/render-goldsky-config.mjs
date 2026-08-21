import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { id } from 'ethers';
import { parseDocument } from 'yaml';

const network = process.argv.includes('--mainnet') ? 'robinhood-mainnet' : 'robinhood-testnet';
const root = new URL('../', import.meta.url);
const chains = JSON.parse(await readFile(new URL('goldsky/robinhood-chains.json', root), 'utf8'));
const networkConfig = chains.networks[network];
if (!networkConfig) throw new Error(`Unknown Goldsky network: ${network}`);
const template = await readFile(new URL('goldsky/nexmarkets-robinhood.turbo.yaml', root), 'utf8');
const catalog = JSON.parse(await readFile(new URL('goldsky/nexmarkets-events.json', root), 'utf8'));
const topicList = [...new Set(catalog.events.map((event) => `'${id(event.signature)}'`))].join(',');
const rendered = template
  .replaceAll('__ROBINHOOD_DATASET_PREFIX__', networkConfig.datasetPrefix)
  .replaceAll('__ROBINHOOD_CHAIN_ID__', String(networkConfig.chainId))
  .replaceAll('__ROBINHOOD_RAW_LOGS_VERSION__', networkConfig.rawLogsVersion)
  .replaceAll('__ROBINHOOD_RAW_BLOCKS_VERSION__', networkConfig.rawBlocksVersion)
  .replace('__NEXMARKETS_EVENT_TOPIC0_LIST__', topicList);
const parsed = parseDocument(rendered);
if (parsed.errors.length) throw new Error(`rendered Goldsky YAML invalid: ${parsed.errors[0].message}`);
await mkdir(new URL('artifacts/goldsky/', root), { recursive: true });
await writeFile(new URL(`artifacts/goldsky/nexmarkets-robinhood-${network}.turbo.yaml`, root), rendered);
console.log(JSON.stringify({ status: 'PASS', provider: 'GOLDSKY_TURBO', network, dataset: networkConfig.datasetPrefix, topics: catalog.events.length }));
