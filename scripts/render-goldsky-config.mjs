import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { id } from 'ethers';
import { parseDocument } from 'yaml';

const network = process.argv.includes('--mainnet') ? 'mainnet' : 'testnet';
const envName = `GOLDSKY_ROBINHOOD_${network.toUpperCase()}_DATASET_PREFIX`;
const dataset = process.env[envName];
if (!dataset || !/^[a-zA-Z0-9_.-]+$/.test(dataset)) throw new Error(`BLOCKED: ${envName} from dedicated-chain enablement is required`);
const root = new URL('../', import.meta.url);
const template = await readFile(new URL('goldsky/nexmarkets-robinhood.turbo.yaml', root), 'utf8');
const catalog = JSON.parse(await readFile(new URL('goldsky/nexmarkets-events.json', root), 'utf8'));
const topicList = [...new Set(catalog.events.map((event) => `'${id(event.signature)}'`))].join(',');
const rendered = template
  .replaceAll('__ROBINHOOD_DATASET_PREFIX__', dataset)
  .replace('__NEXMARKETS_EVENT_TOPIC0_LIST__', topicList);
const parsed = parseDocument(rendered);
if (parsed.errors.length) throw new Error(`rendered Goldsky YAML invalid: ${parsed.errors[0].message}`);
await mkdir(new URL('artifacts/goldsky/', root), { recursive: true });
await writeFile(new URL(`artifacts/goldsky/nexmarkets-robinhood-${network}.turbo.yaml`, root), rendered);
console.log(JSON.stringify({ status: 'PASS', provider: 'GOLDSKY_TURBO', network, topics: catalog.events.length }));
