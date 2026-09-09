const DECIMALS_SELECTOR = '0x313ce567';
const BALANCE_OF_SELECTOR = '0x70a08231';
const ALLOWANCE_SELECTOR = '0xdd62ed3e';
const APPROVE_SELECTOR = '0x095ea7b3';
const IS_APPROVED_FOR_ALL_SELECTOR = '0xe985e9c5';
const SET_APPROVAL_FOR_ALL_SELECTOR = '0xa22cb465';
const SEAPORT_COUNTER_SELECTOR = '0xf07ec373';
const CREATE_EDITION_SELECTOR = '0x7226fb6b';
const LEGACY_CREATE_EDITION_SELECTOR = '0xe6d9c24d';
const SAFE_NONCE_SELECTOR = '0xaffed0e0';
const SAFE_GET_TRANSACTION_HASH_SELECTOR = '0xd8d11f78';
const SAFE_EXEC_TRANSACTION_SELECTOR = '0x6a761202';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const EDITION_CREATED_TOPIC = '0x5a231ebeb338c6ecc26ede45355e42c2dd4c2268466e1de7742aba1f3a73d658';
const CHAIN_FAMILIES = Object.freeze({ 4663: 'ROBINHOOD', 46630: 'ROBINHOOD', 8453: 'BASE', 84532: 'BASE' });
function word(address) { return address.toLowerCase().replace('0x', '').padStart(64, '0'); }
function uintWord(value) { return BigInt(value).toString(16).padStart(64, '0'); }
function bytes32Word(value, label) {
  if (!/^0x[0-9a-f]{64}$/i.test(value ?? '')) throw new Error(`${label}_REQUIRED`);
  return value.slice(2).toLowerCase();
}
function stringTail(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  const data = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${uintWord(bytes.length)}${data.padEnd(Math.ceil(bytes.length / 32) * 64, '0')}`;
}
function bytesTail(value) {
  const data = String(value ?? '').replace(/^0x/u, '').toLowerCase();
  if (!/^(?:[0-9a-f]{2})*$/u.test(data)) throw new Error('BYTES_VALUE_REQUIRED');
  return `${uintWord(data.length / 2)}${data.padEnd(Math.ceil(data.length / 64) * 64, '0')}`;
}

export function encodeCreateEdition({ name, symbol, initialOwner, editionId, absoluteSupplyCap, artworkCommitment, baseTokenURI, salt }) {
  if (!/^0x[0-9a-f]{40}$/i.test(initialOwner ?? '')) throw new Error('EDITION_OWNER_REQUIRED');
  const cap = BigInt(absoluteSupplyCap);
  if (cap < 1n || cap > 0xffffffffn) throw new Error('INVALID_ABSOLUTE_SUPPLY_CAP');
  const tails = [stringTail(name), stringTail(symbol), stringTail(baseTokenURI)];
  const tupleHeadBytes = 7 * 32;
  const nameOffset = tupleHeadBytes;
  const symbolOffset = nameOffset + tails[0].length / 2;
  const uriOffset = symbolOffset + tails[1].length / 2;
  const tuple = [
    uintWord(nameOffset), uintWord(symbolOffset), word(initialOwner),
    bytes32Word(editionId, 'EDITION_ID'), uintWord(cap),
    bytes32Word(artworkCommitment, 'ARTWORK_COMMITMENT'), uintWord(uriOffset),
    ...tails
  ].join('');
  return `${CREATE_EDITION_SELECTOR}${uintWord(64)}${bytes32Word(salt, 'EDITION_SALT')}${tuple}`;
}

// The testnet Factory was deployed from the earlier Safe-controlled release.
// Keep this ABI-compatible encoder beside the permissionless one so the UI can
// execute the deployed contract through its configured Protocol Admin Safe,
// while preserving the direct path for a newer Factory deployment.
export function encodeLegacyCreateEdition({ name, symbol, initialOwner, publisher, editionId, absoluteSupplyCap, artworkCommitment, baseTokenURI, salt }) {
  if (!/^0x[0-9a-f]{40}$/i.test(initialOwner ?? '')) throw new Error('EDITION_OWNER_REQUIRED');
  if (!/^0x[0-9a-f]{40}$/i.test(publisher ?? '')) throw new Error('EDITION_PUBLISHER_REQUIRED');
  const cap = BigInt(absoluteSupplyCap);
  if (cap < 1n || cap > 0xffffffffn) throw new Error('INVALID_ABSOLUTE_SUPPLY_CAP');
  const tails = [stringTail(name), stringTail(symbol), stringTail(baseTokenURI)];
  const tupleHeadBytes = 7 * 32;
  const nameOffset = tupleHeadBytes;
  const symbolOffset = nameOffset + tails[0].length / 2;
  const uriOffset = symbolOffset + tails[1].length / 2;
  const tuple = [
    uintWord(nameOffset), uintWord(symbolOffset), word(initialOwner),
    bytes32Word(editionId, 'EDITION_ID'), uintWord(cap),
    bytes32Word(artworkCommitment, 'ARTWORK_COMMITMENT'), uintWord(uriOffset),
    ...tails
  ].join('');
  return `${LEGACY_CREATE_EDITION_SELECTOR}${uintWord(96)}${word(publisher)}${bytes32Word(salt, 'EDITION_SALT')}${tuple}`;
}

export function encodeSafeGetTransactionHash({ to, data, nonce, operation = 0, value = 0, safeTxGas = 0, baseGas = 0, gasPrice = 0, gasToken = ZERO_ADDRESS, refundReceiver = ZERO_ADDRESS }) {
  const tail = bytesTail(data);
  const head = [word(to), uintWord(value), uintWord(10 * 32), uintWord(operation), uintWord(safeTxGas), uintWord(baseGas), uintWord(gasPrice), word(gasToken), word(refundReceiver), uintWord(nonce)].join('');
  return `${SAFE_GET_TRANSACTION_HASH_SELECTOR}${head}${tail}`;
}

export function encodeSafeExecTransaction({ to, data, signature, operation = 0, value = 0, safeTxGas = 0, baseGas = 0, gasPrice = 0, gasToken = ZERO_ADDRESS, refundReceiver = ZERO_ADDRESS }) {
  const dataTail = bytesTail(data);
  const signatureTail = bytesTail(signature);
  const headBytes = 10 * 32;
  const signatureOffset = headBytes + dataTail.length / 2;
  const head = [word(to), uintWord(value), uintWord(headBytes), uintWord(operation), uintWord(safeTxGas), uintWord(baseGas), uintWord(gasPrice), word(gasToken), word(refundReceiver), uintWord(signatureOffset)].join('');
  return `${SAFE_EXEC_TRANSACTION_SELECTOR}${head}${dataTail}${signatureTail}`;
}

export function editionCreatedFromReceipt(receipt, factory, publisher) {
  const log = (receipt?.logs ?? []).find((entry) =>
    entry.address?.toLowerCase() === factory?.toLowerCase()
      && entry.topics?.[0]?.toLowerCase() === EDITION_CREATED_TOPIC
  );
  if (!log || log.topics.length < 4) throw new Error('EDITION_CREATED_EVENT_REQUIRED');
  const edition = `0x${log.topics[1].slice(-40)}`;
  const eventPublisher = `0x${log.topics[3].slice(-40)}`;
  if (publisher && eventPublisher.toLowerCase() !== publisher.toLowerCase()) throw new Error('EDITION_PUBLISHER_MISMATCH');
  return { edition, editionId: log.topics[2], publisher: eventPublisher };
}

export class NexWallet {
  constructor(provider = globalThis.ethereum) { this.provider = provider; this.address = null; this.chainId = null; }
  setProvider(provider) { if (!provider?.request) throw new Error('EVM_WALLET_REQUIRED'); this.provider = provider; return this; }
  async connect(requiredChainId = 4663) {
    if (!this.provider?.request) throw new Error('EVM_WALLET_REQUIRED');
    const [address] = await this.provider.request({ method: 'eth_requestAccounts' });
    this.address = address; this.chainId = Number(BigInt(await this.provider.request({ method: 'eth_chainId' })));
    if (this.chainId !== requiredChainId) throw new Error(`SWITCH_TO_${CHAIN_FAMILIES[requiredChainId] ?? 'SUPPORTED_NETWORK'}_${requiredChainId}`);
    return { address, chainId: this.chainId };
  }
  async switchChain({ chainId, name, rpcUrl, explorer } = {}) {
    if (!this.provider?.request || !Number.isInteger(Number(chainId))) throw new Error('EVM_WALLET_REQUIRED');
    const numericChainId = Number(chainId);
    const hexChainId = `0x${numericChainId.toString(16)}`;
    try {
      await this.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
    } catch (error) {
      if (![4902, -32603].includes(error?.code) && !/unknown chain|not added|unrecognized chain/i.test(error?.message ?? '')) throw error;
      if (!rpcUrl) throw new Error(`SWITCH_TO_${CHAIN_FAMILIES[numericChainId] ?? 'SUPPORTED_NETWORK'}_${numericChainId}`);
      await this.provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hexChainId,
          chainName: name ?? `${CHAIN_FAMILIES[numericChainId] ?? 'EVM'} Network`,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [rpcUrl],
          blockExplorerUrls: explorer ? [explorer] : undefined
        }]
      });
    }
    this.chainId = Number(BigInt(await this.provider.request({ method: 'eth_chainId' })));
    return this.chainId;
  }
  async signMessage(message) {
    if (!this.address) throw new Error('WALLET_NOT_CONNECTED');
    const encoded = `0x${[...new TextEncoder().encode(message)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    return this.provider.request({ method: 'personal_sign', params: [encoded, this.address] });
  }
  async signHash(hash) {
    if (!this.address || !/^0x[0-9a-f]{64}$/i.test(hash ?? '')) throw new Error('WALLET_HASH_REQUIRED');
    // Safe transaction hashes are already EIP-712 digests.  They must be
    // signed as the raw 32-byte digest; personal_sign would add the EIP-191
    // message prefix and Safe would reject the signature (GS026).  `eth_sign`
    // is the wallet RPC method for this raw-digest boundary.  Certification
    // wallets may expose the same operation under their namespaced method.
    try {
      return await this.provider.request({ method: 'eth_sign', params: [this.address, hash] });
    } catch (error) {
      if (this.provider?.isNexMarketsCertificationWallet) {
        return this.provider.request({ method: 'nexmarkets_signHash', params: [hash, this.address] });
      }
      throw error;
    }
  }
  async signTypedData(typedData) { if (!this.address) throw new Error('WALLET_NOT_CONNECTED'); return this.provider.request({ method: 'eth_signTypedData_v4', params: [this.address, JSON.stringify(typedData)] }); }
  async call(to, data) { return this.provider.request({ method: 'eth_call', params: [{ to, data }, 'latest'] }); }
  async erc20Balance(token, owner = this.address) { return BigInt(await this.call(token, `${BALANCE_OF_SELECTOR}${word(owner)}`)); }
  async erc20Allowance(token, owner, spender) { return BigInt(await this.call(token, `${ALLOWANCE_SELECTOR}${word(owner)}${word(spender)}`)); }
  async approveErc20(token, spender, amount) {
    if (!this.address) throw new Error('WALLET_NOT_CONNECTED');
    return this.submit({ to: token, data: `${APPROVE_SELECTOR}${word(spender)}${uintWord(amount)}`, value: '0x0' });
  }
  async erc721IsApprovedForAll(token, owner = this.address, operator) {
    if (!owner || !operator) throw new Error('NFT_APPROVAL_ADDRESSES_REQUIRED');
    return BigInt(await this.call(token, `${IS_APPROVED_FOR_ALL_SELECTOR}${word(owner)}${word(operator)}`)) !== 0n;
  }
  async approveErc721ForAll(token, operator, approved = true) {
    if (!this.address) throw new Error('WALLET_NOT_CONNECTED');
    return this.submit({ to: token, data: `${SET_APPROVAL_FOR_ALL_SELECTOR}${word(operator)}${uintWord(approved ? 1 : 0)}`, value: '0x0' });
  }
  async erc20Decimals(token) { return Number(BigInt(await this.call(token, DECIMALS_SELECTOR))); }
  async seaportCounter(seaport, owner = this.address) { return BigInt(await this.call(seaport, `${SEAPORT_COUNTER_SELECTOR}${word(owner)}`)); }
  async createEdition(factory, config) {
    if (!this.address) throw new Error('WALLET_NOT_CONNECTED');
    const data = encodeCreateEdition({ ...config, initialOwner: this.address });
    return this.submit({ to: factory, data, value: '0x0' });
  }
  async createEditionViaSafe(safe, factory, config) {
    if (!this.address) throw new Error('WALLET_NOT_CONNECTED');
    const salt = config.salt;
    const inner = encodeLegacyCreateEdition({ ...config, initialOwner: safe, publisher: this.address, salt });
    const nonce = BigInt(await this.call(safe, SAFE_NONCE_SELECTOR));
    const safeHash = await this.call(safe, encodeSafeGetTransactionHash({ to: factory, data: inner, nonce }));
    const signature = await this.signHash(safeHash);
    const data = encodeSafeExecTransaction({ to: factory, data: inner, signature });
    const txHash = await this.submit({ to: safe, data, value: '0x0' });
    return { txHash, safeHash, safeNonce: nonce.toString(), innerData: inner, executionMode: 'SAFE_LEGACY_FACTORY' };
  }
  async waitForReceipt(txHash, { timeoutMs = 180_000, pollMs = 1_500 } = {}) {
    if (!txHash || !this.provider?.request) throw new Error('TX_HASH_REQUIRED');
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const receipt = await this.provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
      if (receipt) {
        const status = receipt.status;
        if (status === '0x0' || status === 0 || status === false) throw new Error('TRANSACTION_REVERTED');
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    throw new Error('TRANSACTION_CONFIRMATION_TIMEOUT');
  }
  async submit(transaction) { if (!this.address) throw new Error('WALLET_NOT_CONNECTED'); return this.provider.request({ method: 'eth_sendTransaction', params: [{ ...transaction, from: this.address }] }); }
}
