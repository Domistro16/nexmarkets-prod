import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Contract, Interface, JsonRpcProvider, ZeroHash, getAddress } from 'ethers';

const root = new URL('../', import.meta.url);
const reportUrl = new URL('artifacts/verification/testnet-certification.md', root);
const artifactUrl = new URL('artifacts/testnet-certification/edition.json', root);
const lifecycleUrl = new URL('artifacts/testnet-certification/secondary-lifecycle.json', root);
const chainId = 46630n;
const addresses = {
  edition: '0x4171d62f43b4168b07a01c04594455dbc3298437',
  registry: '0xee3c8f330c0b2738201fdb2f1720d06c0d27620d',
  advantage: '0x1e265fee39d75b5211895820926b4ff77b4f1cdd',
  listing: '0xf8fd8d378f6a61ecb207732f4f1d0c3e4eb2c75c',
  vault: '0x9d69ab1897afa9d6ffc97eea6a936233a999dfa1',
  settlement: '0x6a4f8832c23c51ba626eba9d50c8f862647c1679'
};
const defaultSubgraph = 'https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn';

function lower(value) { return String(value ?? '').toLowerCase(); }
function asText(value) { return typeof value === 'bigint' ? value.toString() : String(value); }
function json(value) { return JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item); }

async function writeReport(markdown) {
  await mkdir(new URL('artifacts/verification/', root), { recursive: true });
  await writeFile(reportUrl, markdown, 'utf8');
}

async function graphQuery(endpoint, query, variables = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(`SUBGRAPH_QUERY_FAILED:${body.errors?.[0]?.message ?? response.status}`);
  return body.data ?? {};
}

async function verify() {
  const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
  if (!rpcUrl) {
    await writeReport('# Testnet certification\n\n- Status: **BLOCKED**\n- Blocker: `RH_TESTNET_RPC_URL` is not configured.\n- No transaction was submitted and no hash was fabricated.\n');
    console.log(JSON.stringify({ status: 'BLOCKED', reason: 'RH_TESTNET_RPC_URL_REQUIRED', report: reportUrl.pathname }));
    process.exitCode = 2;
    return;
  }

  const editionArtifact = JSON.parse(await readFile(artifactUrl, 'utf8'));
  const lifecycleArtifact = JSON.parse(await readFile(lifecycleUrl, 'utf8'));
  const changeAskHash = lifecycleArtifact.secondarySale?.changeAskTxHash
    || lifecycleArtifact.secondarySale?.priceChangeTxHash
    || lifecycleArtifact.secondarySale?.askChangeTxHash
    || lifecycleArtifact.priceChange?.txHash
    || lifecycleArtifact.changeAsk?.txHash
    || null;
  const provider = new JsonRpcProvider(rpcUrl, Number(chainId), { staticNetwork: true });
  const network = await provider.getNetwork();
  if (network.chainId !== chainId) throw new Error(`RPC_CHAIN_ID_MISMATCH:${network.chainId}`);

  const edition = new Contract(addresses.edition, [
    'function code() view returns(bytes)',
    'function totalMinted() view returns(uint256)',
    'function ownerOf(uint256) view returns(address)',
    'function termsVersionHashOf(uint256) view returns(bytes32)'
  ], provider);
  const registry = new Contract(addresses.registry, [
    'function activeTerms(address) view returns(bytes32,tuple(uint256,uint256,uint64,uint64,uint64,address,address,uint96,bytes32,bytes32))'
  ], provider);
  const advantage = new Contract(addresses.advantage, [
    'function passInfo(address,uint256) view returns(tuple(bytes32 termsVersionHash,bytes32 advantagesHash,uint8 advantageCount,bool listed,bool initialized,uint64 listedAt))',
    'function remaining(address,uint256,bytes32) view returns(uint256)'
  ], provider);
  const listing = new Contract(addresses.listing, [
    'function listingInfo(bytes32) view returns(tuple(address edition,uint256 tokenId,address seller,bytes32 termsVersionHash,uint256 usdGPrice,address royaltyReceiver,uint96 royaltyBps,uint64 startTime,uint64 expiry,bytes32 zoneHash,uint8 status))',
    'function activeListingFor(address,uint256) view returns(bytes32)'
  ], provider);
  const vault = new Contract(addresses.vault, [
    'function claimInfo(bytes32) view returns(tuple(address edition,uint256 tokenId,address builder,uint256 amount,uint64 releaseAt,bool withdrawn))'
  ], provider);

  const receiptHashes = [
    ['Edition creation', editionArtifact.txHash, editionArtifact.blockNumber],
    ['Terms publication', editionArtifact.terms?.txHash, editionArtifact.terms?.blockNumber],
    ['Primary acquisition', lifecycleArtifact.primaryMint?.txHash, lifecycleArtifact.primaryMint?.block],
    ['Cancellation listing create', lifecycleArtifact.cancellation?.createTxHash, null],
    ['Cancellation', lifecycleArtifact.cancellation?.cancelTxHash, null],
    ['Secondary listing create', lifecycleArtifact.secondarySale?.listingCreateTxHash, null],
    ...(changeAskHash ? [['Change ask / replacement listing', changeAskHash, null]] : []),
    ['Secondary purchase', lifecycleArtifact.secondarySale?.fillTxHash, null],
    ['Stale listing create', lifecycleArtifact.staleListing?.listingCreateTxHash, null],
    ['Stale owner transfer', lifecycleArtifact.staleListing?.directTransferTxHash, null],
    ['Stale listing sync', lifecycleArtifact.staleListing?.syncTxHash, null]
  ];
  const receipts = [];
  for (const [label, hash, expectedBlock] of receiptHashes) {
    if (!hash) throw new Error(`MISSING_CERTIFICATION_HASH:${label}`);
    const receipt = await provider.getTransactionReceipt(hash);
    receipts.push({ label, hash, expectedBlock, found: Boolean(receipt), status: receipt ? Number(receipt.status) : null, block: receipt?.blockNumber ?? null });
  }
  const receiptFailures = receipts.filter((item) => !item.found || item.status !== 1 || (item.expectedBlock != null && item.block !== item.expectedBlock));
  const changeAskReceipt = changeAskHash ? receipts.find((item) => item.hash === changeAskHash) : null;
  const changeAsk = changeAskHash
    ? { status: changeAskReceipt?.found && changeAskReceipt.status === 1 ? 'PASS' : 'FAIL', txHash: changeAskHash, block: changeAskReceipt?.block ?? null }
    : { status: 'NOT_PROVEN', txHash: null, block: null };

  const primaryInterface = new Interface(['event PrimaryMintSettled(address indexed payer,address indexed recipient,address indexed edition,bytes32 termsVersionHash,bytes32 intentId,uint256 firstTokenId,uint256 quantity,uint256 totalPaid,uint256 protocolFee)']);
  const secondaryInterface = new Interface(['event SecondarySaleSettled(bytes32 indexed orderHash,address indexed buyer,uint256 salePrice,uint256 protocolFee,uint256 builderRoyalty,uint256 sellerProceeds)']);
  const royaltyInterface = new Interface(['event RoyaltyRecorded(bytes32 indexed orderHash,address indexed edition,uint256 indexed tokenId,address builder,uint256 amount,uint64 releaseAt)']);
  const primaryReceipt = await provider.getTransactionReceipt(lifecycleArtifact.primaryMint.txHash);
  const fillReceipt = await provider.getTransactionReceipt(lifecycleArtifact.secondarySale.fillTxHash);
  const parseEvent = (receipt, eventInterface, name) => receipt?.logs.flatMap((log) => {
    try { const parsed = eventInterface.parseLog(log); return parsed?.name === name ? [parsed] : []; } catch { return []; }
  }) ?? [];
  const primaryEvent = parseEvent(primaryReceipt, primaryInterface, 'PrimaryMintSettled')[0];
  const secondaryEvent = parseEvent(fillReceipt, secondaryInterface, 'SecondarySaleSettled')[0];
  const royaltyEvent = parseEvent(fillReceipt, royaltyInterface, 'RoyaltyRecorded')[0];
  const termsHash = lifecycleArtifact.termsHash;
  const [editionCode, minted, primaryOwner, tokenTerms, activeTerms, passState, quantityRemaining, secondaryInfo, staleInfo, claim, head] = await Promise.all([
    provider.getCode(addresses.edition),
    edition.totalMinted(),
    edition.ownerOf(1n),
    edition.termsVersionHashOf(1n),
    registry.activeTerms(addresses.edition),
    advantage.passInfo(addresses.edition, 1n),
    advantage.remaining(addresses.edition, 1n, lifecycleArtifact.advantages.quantityAdvantageId),
    listing.listingInfo(lifecycleArtifact.secondarySale.orderHash),
    listing.listingInfo(lifecycleArtifact.staleListing.orderHash),
    vault.claimInfo(lifecycleArtifact.secondarySale.orderHash),
    provider.getBlockNumber()
  ]);
  const onchain = {
    editionCode: editionCode !== '0x',
    totalMinted: asText(minted),
    currentOwner: primaryOwner,
    tokenTermsHash: tokenTerms,
    activeTermsHash: activeTerms[0],
    passListed: Boolean(passState.listed),
    passInitialized: Boolean(passState.initialized),
    quantityRemaining: asText(quantityRemaining),
    secondaryStatus: Number(secondaryInfo.status),
    staleStatus: Number(staleInfo.status),
    secondarySeller: secondaryInfo.seller,
    secondaryBuyer: secondaryEvent?.args?.buyer ?? lifecycleArtifact.secondarySale.buyer,
    secondaryAsk: secondaryEvent ? asText(secondaryEvent.args.salePrice) : lifecycleArtifact.secondarySale.price,
    royaltyBuilder: claim.builder,
    royaltyAmount: asText(claim.amount),
    latestBlock: head
  };
  const eventChecks = {
    primary: Boolean(primaryEvent) && lower(primaryEvent.args.edition) === addresses.edition && lower(primaryEvent.args.termsVersionHash) === lower(termsHash) && asText(primaryEvent.args.quantity) === '1' && asText(primaryEvent.args.totalPaid) === lifecycleArtifact.primaryMint.price && asText(primaryEvent.args.protocolFee) === lifecycleArtifact.primaryMint.protocolFee,
    secondary: Boolean(secondaryEvent) && lower(secondaryEvent.args.orderHash) === lower(lifecycleArtifact.secondarySale.orderHash) && lower(secondaryEvent.args.buyer) === lower(lifecycleArtifact.secondarySale.buyer) && asText(secondaryEvent.args.salePrice) === lifecycleArtifact.secondarySale.price && asText(secondaryEvent.args.protocolFee) === lifecycleArtifact.secondarySale.protocolFee && asText(secondaryEvent.args.builderRoyalty) === lifecycleArtifact.secondarySale.builderRoyalty && asText(secondaryEvent.args.sellerProceeds) === lifecycleArtifact.secondarySale.sellerProceeds,
    royalty: Boolean(royaltyEvent) && lower(royaltyEvent.args.orderHash) === lower(lifecycleArtifact.secondarySale.orderHash) && asText(royaltyEvent.args.amount) === lifecycleArtifact.secondarySale.builderRoyalty
  };
  const stateChecks = {
    edition: onchain.editionCode,
    terms: lower(onchain.activeTermsHash) === lower(termsHash) && lower(onchain.tokenTermsHash) === lower(termsHash),
    primaryOwnerOrTransferred: lower(onchain.currentOwner) === lower(lifecycleArtifact.staleListing.newOwner),
    advantage: onchain.passInitialized && onchain.passListed === false && onchain.quantityRemaining === lifecycleArtifact.advantages.postSaleRemaining,
    secondary: onchain.secondaryStatus === 3,
    stale: onchain.staleStatus === 5,
    royalty: lower(onchain.royaltyBuilder) === lower(lifecycleArtifact.secondarySale.royaltyVault.builder) && onchain.royaltyAmount === lifecycleArtifact.secondarySale.builderRoyalty && !claim.withdrawn
  };

  const subgraphEndpoint = process.env.NEXMARKETS_SUBGRAPH_URL?.trim() || defaultSubgraph;
  let subgraph = { endpoint: subgraphEndpoint, status: 'BLOCKED' };
  try {
    const data = await graphQuery(subgraphEndpoint, `query($passId:ID!,$orderHash:Bytes!){ _meta { block { number hash } } pass(id:$passId){ owner tokenId termsHash } listings(where:{orderHash:$orderHash}){ orderHash status buyer salePrice protocolFee builderRoyalty sellerProceeds } royaltyClaims(where:{orderHash:$orderHash}){ orderHash builder amount } }`, { passId: `${addresses.edition}-1`, orderHash: lower(lifecycleArtifact.secondarySale.orderHash) });
    const graphPass = data.pass;
    const graphSale = data.listings?.[0];
    const graphClaim = data.royaltyClaims?.[0];
    subgraph = {
      endpoint: subgraphEndpoint,
      status: graphPass && graphSale && graphClaim ? 'PASS' : 'INCOMPLETE',
      indexedBlock: data._meta?.block?.number ?? null,
      passOwner: graphPass?.owner ?? null,
      saleStatus: graphSale?.status ?? null,
      royaltyAmount: graphClaim?.amount ?? null
    };
  } catch (error) {
    subgraph.error = error.message;
  }

  const apiEndpoint = process.env.NEXMARKETS_API_URL?.trim();
  const api = { status: apiEndpoint ? 'BLOCKED' : 'NOT_CONFIGURED', endpoint: apiEndpoint ?? null };
  if (apiEndpoint) {
    try {
      const response = await fetch(`${apiEndpoint.replace(/\/+$/u, '')}/v1/passes/${addresses.edition}/1`, { headers: { accept: 'application/json' } });
      const body = await response.json();
      api.status = response.ok && body?.data ? 'PASS' : 'INCOMPLETE';
      api.httpStatus = response.status;
      api.owner = body?.data?.owner ?? null;
      api.quantityRemaining = body?.data?.advantages?.find((item) => lower(item.advantageId) === lower(lifecycleArtifact.advantages.quantityAdvantageId))?.remaining ?? null;
    } catch (error) { api.error = error.message; }
  }

  const pass = receiptFailures.length === 0 && changeAsk.status === 'PASS' && eventChecks.primary && eventChecks.secondary && eventChecks.royalty && Object.values(stateChecks).every(Boolean) && subgraph.status === 'PASS' && api.status === 'PASS';
  const lines = [
    '# Testnet certification',
    '',
    `- Status: **${pass ? 'PASS' : 'BLOCKED'}**`,
    `- Network: Robinhood testnet (chain ${chainId})`,
    '- Evidence source: independently re-read transaction receipts and current RPC/Subgraph/API state; no transaction was submitted by this verification run.',
    '',
    '## Transaction evidence',
    '',
    '| Operation | Transaction hash | Block | Receipt |',
    '|---|---|---:|---|',
    ...receipts.map((item) => `| ${item.label} | \`${item.hash}\` | ${item.block ?? 'missing'} | ${item.found && item.status === 1 && (item.expectedBlock == null || item.block === item.expectedBlock) ? 'PASS' : 'FAIL'} |`),
    '',
    '## Required lifecycle coverage',
    '',
    `- Primary acquisition: ${eventChecks.primary ? 'PASS' : 'FAIL'}; buyer/payer: \`${primaryEvent?.args?.payer ?? 'not parsed'}\`; serial: ${primaryEvent ? asText(primaryEvent.args.firstTokenId) : 'not parsed'}; payment: ${lifecycleArtifact.primaryMint.price} MockUSDG.`,
    `- Advantage initialization and transfer state: ${stateChecks.advantage ? 'PASS' : 'FAIL'}; remaining quantity after the recorded transfer/sale path: ${onchain.quantityRemaining}.`,
    `- Listing create: ${lifecycleArtifact.secondarySale?.listingCreateTxHash ? 'PASS' : 'NOT_PROVEN'}; delist/cancel: ${lifecycleArtifact.cancellation?.cancelTxHash ? 'PASS' : 'NOT_PROVEN'}; relist: ${lifecycleArtifact.secondarySale?.listingCreateTxHash ? 'PASS' : 'NOT_PROVEN'}.`,
    `- Change ask / replacement order: **${changeAsk.status}**${changeAsk.txHash ? `; transaction: \`${changeAsk.txHash}\`` : '; no replacement-order transaction is present in the supplied lifecycle artifact.'}`,
    `- Secondary purchase: ${eventChecks.secondary ? 'PASS' : 'FAIL'}; seller: \`${onchain.secondarySeller}\`; buyer: \`${onchain.secondaryBuyer}\`; ask: ${onchain.secondaryAsk} MockUSDG.`,
    `- Royalty: ${eventChecks.royalty && stateChecks.royalty ? 'PASS' : 'FAIL'}; Builder amount: ${onchain.royaltyAmount} MockUSDG.`,
    '',
    '## Primary settlement',
    '',
    `- Event parsed: ${eventChecks.primary ? 'PASS' : 'FAIL'}`,
    `- Gross: ${lifecycleArtifact.primaryMint.price} MockUSDG`,
    `- NexMarkets fee (5%): ${lifecycleArtifact.primaryMint.protocolFee}`,
    `- Builder proceeds: ${lifecycleArtifact.primaryMint.builderProceeds}`,
    `- Edition: \`${addresses.edition}\`; serial: ${primaryEvent ? asText(primaryEvent.args.firstTokenId) : '1'}; final owner after secondary/stale-transfer lifecycle: \`${onchain.currentOwner}\``,
    '',
    '## Secondary, Advantage and royalty evidence',
    '',
    `- Secondary event: ${eventChecks.secondary ? 'PASS' : 'FAIL'}`,
    `- Advantage event/state: ${stateChecks.advantage ? 'PASS' : 'FAIL'}; remaining quantity: ${onchain.quantityRemaining}`,
    `- Cancellation/relist/stale lifecycle state: ${stateChecks.secondary && stateChecks.stale ? 'PASS' : 'FAIL'} (filled=${onchain.secondaryStatus}, stale=${onchain.staleStatus})`,
    `- Builder royalty event/state: ${eventChecks.royalty && stateChecks.royalty ? 'PASS' : 'FAIL'}; amount: ${onchain.royaltyAmount}`,
    '',
    '## Read-model corroboration',
    '',
    `- Goldsky Subgraph: **${subgraph.status}**${subgraph.error ? ` (${subgraph.error})` : ''}`,
    `- API: **${api.status}**${api.error ? ` (${api.error})` : ''}`,
    '',
    '## Blocker',
    '',
    ...(pass ? ['- All receipt, chain-state, Subgraph and API checks passed.'] : ['- This run does not certify production: at least one required read-model or live-journey check is unavailable or failed.', `- Current RPC state: \`${json(onchain)}\``, '- A new mint was not attempted because the fixed certification Edition is already minted; the existing real transaction evidence was validated where available.', `- Required change-ask evidence: ${changeAsk.status}.`, '- Missing or failed external evidence must be resolved before production certification.'])
  ];
  await writeReport(`${lines.join('\n')}\n`);
  console.log(JSON.stringify({ status: pass ? 'PASS' : 'BLOCKED', receipts: receipts.length, receiptFailures, eventChecks, stateChecks, subgraph, api, report: reportUrl.pathname }));
  if (!pass) process.exitCode = 2;
}

verify().catch(async (error) => {
  await writeReport(`# Testnet certification\n\n- Status: **BLOCKED**\n- Blocker: ${String(error.message).replaceAll('\n', ' ')}\n- No transaction was submitted and no hash was fabricated.\n`);
  console.error(JSON.stringify({ status: 'BLOCKED', error: error.message, report: reportUrl.pathname }));
  process.exitCode = 2;
});
