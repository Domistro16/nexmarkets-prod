import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getAddress,
  isAddress
} from 'ethers';

const CHAIN_ID = 46630n;
const SAFE = '0xCE54c8453fF48670781a6b908c1A3e9209FC95A0';
const MOCK_USDG = '0x6A4F8832c23C51ba626Eba9d50c8F862647C1679';
const DEFAULT_RECIPIENT = '0xD83deFbA240568040b39bb2C8B4DB7dB02d40593';
const DEFAULT_AMOUNT = 1_000_000n; // exactly 1 USDG at 6 decimals
const CONFIRM = 'I_UNDERSTAND_THIS_SUBMITS_A_TESTNET_SAFE_TRANSACTION';

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function fail(message) {
  throw new Error(message);
}

const network = arg('network') ?? 'robinhood-testnet';
if (network !== 'robinhood-testnet' || process.argv.includes('--mainnet')) {
  fail('TESTNET_ONLY_MOCK_USDG_MINT');
}

const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl) fail('Missing RH_TESTNET_RPC_URL.');
if (process.argv.includes('--broadcast') && !privateKey) fail('Missing DEPLOYER_PRIVATE_KEY.');

const recipientRaw = arg('to') ?? DEFAULT_RECIPIENT;
if (!isAddress(recipientRaw)) fail('Invalid --to address.');
const recipient = getAddress(recipientRaw);
const amount = BigInt(arg('amount') ?? DEFAULT_AMOUNT);
if (amount <= 0n) fail('Amount must be positive.');

const provider = new JsonRpcProvider(rpcUrl, Number(CHAIN_ID), { staticNetwork: true });
if ((await provider.getNetwork()).chainId !== CHAIN_ID) fail('RPC_CHAIN_ID_MISMATCH');

const safeAbi = [
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function VERSION() view returns(string)',
  'function nonce() view returns(uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns(bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns(bool)'
];
const tokenAbi = [
  'function owner() view returns(address)',
  'function symbol() view returns(string)',
  'function decimals() view returns(uint8)',
  'function balanceOf(address) view returns(uint256)',
  'function mint(address,uint256)'
];
const safe = new Contract(SAFE, safeAbi, provider);
const token = new Contract(MOCK_USDG, tokenAbi, provider);
const [safeCode, owners, threshold, version, tokenOwner, symbol, decimals, beforeBalance] = await Promise.all([
  provider.getCode(SAFE),
  safe.getOwners(),
  safe.getThreshold(),
  safe.VERSION(),
  token.owner(),
  token.symbol(),
  token.decimals(),
  token.balanceOf(recipient)
]);
if (safeCode === '0x') fail('TESTNET_PROTOCOL_ADMIN_SAFE_HAS_NO_CODE');
if (version !== '1.4.1') fail(`SAFE_VERSION_UNEXPECTED:${version}`);
if (BigInt(threshold) !== 1n) fail('SAFE_THRESHOLD_NOT_ONE; use a multisig execution flow instead.');
if (getAddress(tokenOwner) !== getAddress(SAFE)) fail('MOCK_USDG_OWNER_IS_NOT_PROTOCOL_ADMIN_SAFE');
if (symbol !== 'USDG' || Number(decimals) !== 6) fail('MOCK_USDG_METADATA_MISMATCH');

const broadcast = process.argv.includes('--broadcast');
const signer = broadcast ? new Wallet(privateKey, provider) : null;
if (signer && !owners.some((owner) => owner.toLowerCase() === signer.address.toLowerCase())) {
  fail('DEPLOYER_IS_NOT_A_PROTOCOL_ADMIN_SAFE_OWNER');
}

const mintInterface = new Interface(['function mint(address to,uint256 amount)']);
const data = mintInterface.encodeFunctionData('mint', [recipient, amount]);
const nonce = BigInt(await safe.nonce());
const safeTxGas = 0n;
const baseGas = 0n;
const gasPrice = 0n;
const safeTxHash = await safe.getTransactionHash(
  MOCK_USDG,
  0n,
  data,
  0,
  safeTxGas,
  baseGas,
  gasPrice,
  ZeroAddress,
  ZeroAddress,
  nonce
);

const record = {
  network,
  chainId: Number(CHAIN_ID),
  safe: SAFE,
  mockUsdg: MOCK_USDG,
  recipient,
  amount: amount.toString(),
  amountUsdg: Number(amount) / 1_000_000,
  safeNonce: nonce.toString(),
  safeTxHash,
  balanceBefore: beforeBalance.toString(),
  status: 'DRY_RUN_ONLY',
  txHash: null,
  blockNumber: null,
  balanceAfter: null
};

if (broadcast) {
  if (process.env.MOCK_USDG_MINT_CONFIRM !== CONFIRM) {
    fail(`Broadcast blocked. Set MOCK_USDG_MINT_CONFIRM=${CONFIRM}.`);
  }
  const tx = await safe.connect(signer).execTransaction(
    MOCK_USDG,
    0n,
    data,
    0,
    safeTxGas,
    baseGas,
    gasPrice,
    ZeroAddress,
    ZeroAddress,
    signer.signingKey.sign(safeTxHash).serialized
  );
  const receipt = await tx.wait();
  if (!receipt || Number(receipt.status) !== 1) fail(`MOCK_USDG_SAFE_MINT_REVERTED:${tx.hash}`);
  const afterBalance = await token.balanceOf(recipient);
  if (afterBalance - beforeBalance !== amount) fail('MOCK_USDG_BALANCE_DELTA_MISMATCH');
  record.status = 'EXECUTED_VERIFIED';
  record.txHash = tx.hash;
  record.blockNumber = receipt.blockNumber;
  record.balanceAfter = afterBalance.toString();
}

console.log(JSON.stringify(record, null, 2));
