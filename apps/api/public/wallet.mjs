const DECIMALS_SELECTOR = '0x313ce567';
const BALANCE_OF_SELECTOR = '0x70a08231';
const ALLOWANCE_SELECTOR = '0xdd62ed3e';
const SEAPORT_COUNTER_SELECTOR = '0xf07ec373';
function word(address) { return address.toLowerCase().replace('0x', '').padStart(64, '0'); }

export class NexWallet {
  constructor(provider = globalThis.ethereum) { this.provider = provider; this.address = null; this.chainId = null; }
  async connect(requiredChainId = 4663) {
    if (!this.provider?.request) throw new Error('EVM_WALLET_REQUIRED');
    const [address] = await this.provider.request({ method: 'eth_requestAccounts' });
    this.address = address; this.chainId = Number(BigInt(await this.provider.request({ method: 'eth_chainId' })));
    if (this.chainId !== requiredChainId) throw new Error(`SWITCH_TO_ROBINHOOD_${requiredChainId}`);
    return { address, chainId: this.chainId };
  }
  async signMessage(message) {
    if (!this.address) throw new Error('WALLET_NOT_CONNECTED');
    const encoded = `0x${[...new TextEncoder().encode(message)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    return this.provider.request({ method: 'personal_sign', params: [encoded, this.address] });
  }
  async signTypedData(typedData) { if (!this.address) throw new Error('WALLET_NOT_CONNECTED'); return this.provider.request({ method: 'eth_signTypedData_v4', params: [this.address, JSON.stringify(typedData)] }); }
  async call(to, data) { return this.provider.request({ method: 'eth_call', params: [{ to, data }, 'latest'] }); }
  async erc20Balance(token, owner = this.address) { return BigInt(await this.call(token, `${BALANCE_OF_SELECTOR}${word(owner)}`)); }
  async erc20Allowance(token, owner, spender) { return BigInt(await this.call(token, `${ALLOWANCE_SELECTOR}${word(owner)}${word(spender)}`)); }
  async erc20Decimals(token) { return Number(BigInt(await this.call(token, DECIMALS_SELECTOR))); }
  async seaportCounter(seaport, owner = this.address) { return BigInt(await this.call(seaport, `${SEAPORT_COUNTER_SELECTOR}${word(owner)}`)); }
  async submit(transaction) { if (!this.address) throw new Error('WALLET_NOT_CONNECTED'); return this.provider.request({ method: 'eth_sendTransaction', params: [{ ...transaction, from: this.address }] }); }
}
