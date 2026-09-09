import { Contract, Interface, JsonRpcProvider, Wallet, ZeroAddress, keccak256, toUtf8Bytes } from 'ethers';
import { mkdir, writeFile } from 'node:fs/promises';

const CHAIN_ID = 46630n;
const CONTROLLER = '0x0ea6f883808447f115c7b6c037902361c365555a';
const KNOWN_EDITION = '0x4171d62f43b4168b07a01c04594455dbc3298437';
const CONFIRM = 'I_UNDERSTAND_THIS_SUBMITS_AN_EXPECTED_REVERT_ON_TESTNET';
const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl || !privateKey) throw new Error('FINAL_LIVE_CHAIN_NEGATIVE_CREDENTIALS_REQUIRED');

const provider = new JsonRpcProvider(rpcUrl, Number(CHAIN_ID), { staticNetwork: true });
const wallet = new Wallet(privateKey, provider);
const edition = new Contract(KNOWN_EDITION, ['function totalMinted() view returns(uint256)'], provider);
const mintInterface = new Interface([
  'function mint((address edition,bytes32 termsVersionHash,address recipient,uint256 quantity,bytes32 intentId,address referralHint,(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[] advantageConfigs) request) returns(uint256)'
]);
const wrongEdition = '0x000000000000000000000000000000000000dead';
const request = [
  wrongEdition,
  keccak256(toUtf8Bytes('NEXMARKETS_FINAL_LIVE_WRONG_EDITION_TERMS')),
  wallet.address,
  1n,
  keccak256(toUtf8Bytes(`NEXMARKETS_FINAL_LIVE_WRONG_EDITION_${wallet.address}`)),
  ZeroAddress,
  []
];
const data = mintInterface.encodeFunctionData('mint', [request]);
const beforeMinted = await edition.totalMinted();

let staticFailure = null;
try {
  await provider.call({ from: wallet.address, to: CONTROLLER, data });
} catch (error) {
  staticFailure = {
    code: error.code ?? null,
    reason: error.reason ?? error.shortMessage ?? 'execution reverted',
    data: error.data ?? error.info?.error?.data ?? null
  };
}
if (!staticFailure) throw new Error('WRONG_EDITION_STATIC_CALL_UNEXPECTEDLY_SUCCEEDED');

const output = {
  schemaVersion: 1,
  status: process.argv.includes('--broadcast') ? 'SUBMITTING' : 'DRY_RUN_EXPECTED_REVERT_CONFIRMED',
  network: 'robinhood-testnet',
  chainId: Number(CHAIN_ID),
  wallet: wallet.address,
  input: { controller: CONTROLLER, wrongEdition, recipient: wallet.address, quantity: '1', termsVersionHash: request[1], intentId: request[4] },
  expected: 'MintClosed/TermsNotActive rejection; no unauthorized Pass minted',
  staticCall: staticFailure,
  transaction: null,
  resultingState: { knownEdition: KNOWN_EDITION, totalMintedBefore: beforeMinted.toString(), totalMintedAfter: null }
};
if (output.staticCall.data === '0x589ed34b') output.staticCall.decodedError = 'MintClosed()';

if (process.argv.includes('--broadcast')) {
  if (process.env.FINAL_LIVE_NEGATIVE_CONFIRM !== CONFIRM) throw new Error(`Set FINAL_LIVE_NEGATIVE_CONFIRM=${CONFIRM}`);
  const tx = await wallet.sendTransaction({ to: CONTROLLER, data, gasLimit: 500_000n });
  let receipt;
  try {
    receipt = await tx.wait();
  } catch (error) {
    receipt = error.receipt;
  }
  if (!receipt || Number(receipt.status) !== 0) throw new Error(`WRONG_EDITION_TRANSACTION_DID_NOT_REVERT:${tx.hash}`);
  const afterMinted = await edition.totalMinted();
  if (afterMinted !== beforeMinted) throw new Error('UNAUTHORIZED_MINT_CHANGED_KNOWN_EDITION_SUPPLY');
  output.status = 'PASS_REVERTED_ONCHAIN';
  output.transaction = { hash: tx.hash, blockNumber: receipt.blockNumber, status: Number(receipt.status), gasUsed: receipt.gasUsed.toString() };
  output.resultingState.totalMintedAfter = afterMinted.toString();
  await mkdir(new URL('../artifacts/testnet-certification/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/testnet-certification/final-live-chain-negative.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
}

console.log(JSON.stringify(output, null, 2));
