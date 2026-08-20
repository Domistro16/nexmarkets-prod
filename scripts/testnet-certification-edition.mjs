import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getAddress,
  keccak256,
  toUtf8Bytes
} from 'ethers';

const network = 'robinhood-testnet';
const chainId = 46630n;
const root = new URL('../', import.meta.url);
const plan = JSON.parse(await readFile(new URL('artifacts/deployment-plan/robinhood-testnet.json', root), 'utf8'));
const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl || !privateKey) throw new Error('TESTNET_CERTIFICATION_CREDENTIALS_REQUIRED');
const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
if ((await provider.getNetwork()).chainId !== chainId) throw new Error('TESTNET_CHAIN_ID_MISMATCH');
const signer = new Wallet(privateKey, provider);
const publisher = await signer.getAddress();
const safeAddress = getAddress(plan.governance.safe);
const factoryAddress = getAddress(plan.contracts.NexPassFactory.address);
const registryAddress = getAddress(plan.contracts.NexLaunchRegistry.address);
const advantageAddress = getAddress(plan.contracts.NexAdvantageRegistry.address);
const artifactUrl = new URL('artifacts/testnet-certification/edition.json', root);
const phase = process.argv.find((arg) => arg.startsWith('--phase='))?.slice('--phase='.length) ?? 'create';
const broadcast = process.argv.includes('--broadcast');
if (phase !== 'create' && phase !== 'terms') throw new Error('TESTNET_CERTIFICATION_PHASE_INVALID');
if (broadcast && process.env.TESTNET_CERTIFICATION_CONFIRM !== 'I_UNDERSTAND_THIS_SUBMITS_A_TESTNET_CERTIFICATION_TRANSACTION') {
  throw new Error('TESTNET_CERTIFICATION_CONFIRMATION_REQUIRED');
}

const factory = new Contract(factoryAddress, [
  'function owner() view returns(address)',
  'function predictEditionAddress((string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI),bytes32) view returns(address)',
  'event EditionCreated(address indexed edition,bytes32 indexed editionId,address indexed publisher,bytes32 salt,address protocolAdmin,address mintController,uint32 absoluteSupplyCap,bytes32 artworkCommitment)'
], provider);
const safeAbi = [
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function nonce() view returns(uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns(bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns(bool)'
];
const safe = new Contract(safeAddress, safeAbi, provider);
const safeInterface = new Interface(safeAbi);
const certification = {
  name: 'NexMarkets V1 Test Certification Edition',
  symbol: 'NEXTEST',
  initialOwner: safeAddress,
  editionId: keccak256(toUtf8Bytes('NEXMARKETS_TEST_CERTIFICATION_EDITION_2026_08_20')),
  absoluteSupplyCap: 3,
  artworkCommitment: keccak256(toUtf8Bytes('NEXMARKETS_TEST_CERTIFICATION_ARTWORK_V1')),
  baseTokenURI: 'https://test.invalid/nexmarkets-certification/metadata/',
  salt: keccak256(toUtf8Bytes('NEXMARKETS_TEST_CERTIFICATION_EDITION_SALT_2026_08_20')),
  publisher
};
const factoryInterface = new Interface(['function createEdition((string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI),address publisher,bytes32 salt) returns(address)']);

if (phase === 'create') {
  if (await factory.owner() !== safeAddress) throw new Error('TEST_FACTORY_OWNER_MISMATCH');
  const predicted = getAddress(await factory.predictEditionAddress(certification, certification.salt));
  const existing = await provider.getCode(predicted);
  if (existing !== '0x') throw new Error(`TEST_EDITION_ADDRESS_OCCUPIED ${predicted}`);
  const data = factoryInterface.encodeFunctionData('createEdition', [certification, publisher, certification.salt]);
  const nonce = BigInt(await safe.nonce());
  const safeTxHash = await safe.getTransactionHash(factoryAddress, 0n, data, 0, 0n, 0n, 0n, ZeroAddress, ZeroAddress, nonce);
  const record = { schemaVersion: 1, network, chainId: Number(chainId), testOnly: true, phase, publisher, safe: safeAddress, factory: factoryAddress, certification, predictedEditionAddress: predicted, safeNonce: nonce.toString(), safeTxHash, status: broadcast ? 'SUBMITTED' : 'DRY_RUN_ONLY', txHash: null, blockNumber: null, terms: null };
  if (broadcast) {
    const signature = signer.signingKey.sign(safeTxHash).serialized;
    const tx = await safe.connect(signer).execTransaction(factoryAddress, 0n, data, 0, 0n, 0n, 0n, ZeroAddress, ZeroAddress, signature);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`TEST_EDITION_CREATION_REVERTED ${tx.hash}`);
    const code = await provider.getCode(predicted);
    if (code === '0x') throw new Error('TEST_EDITION_CODE_MISSING');
    record.status = 'CREATED_VERIFIED';
    record.txHash = tx.hash;
    record.blockNumber = receipt.blockNumber;
  }
  if (broadcast) {
    await mkdir(new URL('artifacts/testnet-certification/', root), { recursive: true });
    await writeFile(artifactUrl, `${JSON.stringify(record, null, 2)}\n`);
  }
  console.log(JSON.stringify(record, null, 2));
} else {
  const prior = JSON.parse(await readFile(artifactUrl, 'utf8'));
  if (prior.status !== 'CREATED_VERIFIED' || !prior.predictedEditionAddress) throw new Error('TEST_EDITION_NOT_CREATED');
  const edition = getAddress(prior.predictedEditionAddress);
  const code = await provider.getCode(edition);
  if (code === '0x') throw new Error('TEST_EDITION_CODE_MISSING');
  const now = Number((await provider.getBlock('latest')).timestamp);
  // Leave a small publication buffer so the on-chain `previewStartsAt < block.timestamp`
  // guard cannot make an otherwise valid Terms transaction stale in the mempool.
  const previewStartsAt = now + 5 * 60;
  const mintStartsAt = previewStartsAt + 24 * 60 * 60;
  const mintEndsAt = mintStartsAt + 7 * 24 * 60 * 60;
  const configs = [
    { advantageId: keccak256(toUtf8Bytes('NEXTEST_TIME')), kind: 0, startsAt: previewStartsAt, endsAt: mintEndsAt, totalUnits: 0, definitionHash: keccak256(toUtf8Bytes('NEXTEST_TIME_DEFINITION_V1')) },
    { advantageId: keccak256(toUtf8Bytes('NEXTEST_QUANTITY')), kind: 1, startsAt: previewStartsAt, endsAt: mintEndsAt, totalUnits: 2, definitionHash: keccak256(toUtf8Bytes('NEXTEST_QUANTITY_DEFINITION_V1')) },
    { advantageId: keccak256(toUtf8Bytes('NEXTEST_CONNECTED')), kind: 2, startsAt: previewStartsAt, endsAt: mintEndsAt, totalUnits: 0, definitionHash: keccak256(toUtf8Bytes('NEXTEST_CONNECTED_DEFINITION_V1')) }
  ];
  const advantage = new Contract(advantageAddress, ['function hashAdvantages((bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[]) view returns(bytes32)'], provider);
  const advantagesHash = await advantage.hashAdvantages(configs);
  const terms = {
    activeSupply: 3,
    pricePerPass: 1_000_000,
    previewStartsAt,
    mintStartsAt,
    mintEndsAt,
    primaryRecipient: publisher,
    royaltyReceiver: publisher,
    royaltyBps: 300,
    advantagesHash,
    referralTermsHash: keccak256(toUtf8Bytes('NEXTEST_REFERRAL_TERMS_V1'))
  };
  const registryAbi = [
    'function publishTerms(address,(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash) terms) returns(bytes32)',
    'function activeTerms(address) view returns(bytes32,(uint256,uint256,uint64,uint64,uint64,address,address,uint96,bytes32,bytes32))'
  ];
  const registryInterface = new Interface(registryAbi);
  const registry = new Contract(registryAddress, registryAbi, provider);
  const data = registryInterface.encodeFunctionData('publishTerms', [edition, terms]);
  const callResult = await provider.call({ to: registryAddress, from: publisher, data });
  const previewTermsHash = registryInterface.decodeFunctionResult('publishTerms', callResult)[0];
  if (!broadcast) {
    console.log(JSON.stringify({ status: 'DRY_RUN_ONLY', edition, termsHash: previewTermsHash, previewStartsAt, mintStartsAt, mintEndsAt, configCount: configs.length }, null, 2));
    process.exit(0);
  }
  const tx = await signer.sendTransaction({ to: registryAddress, data });
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`TEST_TERMS_REVERTED ${tx.hash}`);
  const [termsHash, onchainTerms] = await registry.activeTerms(edition);
  const updated = { ...prior, terms: { termsHash, terms, configs, previewStartsAt, mintStartsAt, mintEndsAt, status: 'PUBLISHED_VERIFIED', txHash: tx.hash, blockNumber: receipt.blockNumber, blockTimestamp: now }, lifecycleStatus: 'TESTNET_PREVIEW_ACTIVE' };
  await mkdir(new URL('artifacts/testnet-certification/', root), { recursive: true });
  await writeFile(artifactUrl, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(JSON.stringify({ status: updated.terms.status, edition, termsHash, previewStartsAt, mintStartsAt, mintEndsAt, txHash: tx.hash, blockNumber: receipt.blockNumber, configCount: configs.length, onchainPrice: String(onchainTerms[1]) }, null, 2));
}
