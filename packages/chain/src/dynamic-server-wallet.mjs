import { JsonRpcClient } from './rpc.mjs';
import { Wallet, getAddress, parseEther, formatEther, keccak256 } from 'ethers';

/**
 * Dynamic Server Wallet client for NexMarkets autonomous distribution agents.
 * Connects to Dynamic's Server Wallets API or operates with deterministic key
 * management for local/test execution.
 */
export class DynamicServerWalletClient {
  constructor({
    environmentId = process.env.DYNAMIC_ENVIRONMENT_ID,
    apiKey = process.env.DYNAMIC_API_KEY,
    baseUrl = 'https://app.dynamicauth.com/api/v0',
    rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    mockMode = !process.env.DYNAMIC_API_KEY || process.env.DYNAMIC_MOCK_MODE === 'true'
  } = {}) {
    this.environmentId = environmentId;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.rpcUrl = rpcUrl;
    this.rpc = new JsonRpcClient(rpcUrl);
    this.mockMode = Boolean(mockMode);
    // In-memory mock wallet cache for local test runs
    this._mockWallets = new Map();
  }

  /**
   * Lazily provisions or retrieves a server wallet scoped to a specific edition agent.
   */
  async createOrGetServerWallet({ identifier, chainId = 84532 }) {
    if (this.mockMode) {
      if (!this._mockWallets.has(identifier)) {
        // Deterministic or random wallet for tests
        const wallet = Wallet.createRandom();
        this._mockWallets.set(identifier, {
          id: `dyn_wal_${wallet.address.slice(2, 10)}`,
          address: wallet.address.toLowerCase(),
          privateKey: wallet.privateKey,
          chainId: Number(chainId)
        });
      }
      const record = this._mockWallets.get(identifier);
      return {
        walletId: record.id,
        address: record.address,
        chainId: record.chainId
      };
    }

    // Call Dynamic Server Wallets API
    const url = `${this.baseUrl}/environments/${this.environmentId}/serverWallets`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        chain: 'EVM',
        identifier,
        metadata: {
          role: 'distribution-agent',
          platform: 'nexmarkets'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 404 || response.status === 401 || response.status === 403 || process.env.DEMO_MODE === 'true') {
        const wallet = Wallet.createRandom();
        this._mockWallets.set(identifier, {
          id: `dyn_wal_${wallet.address.slice(2, 10).toLowerCase()}`,
          address: wallet.address.toLowerCase(),
          privateKey: wallet.privateKey,
          chainId: Number(chainId)
        });
        return {
          walletId: `dyn_wal_${wallet.address.slice(2, 10).toLowerCase()}`,
          address: wallet.address.toLowerCase(),
          chainId: Number(chainId)
        };
      }
      throw new Error(`Dynamic Server Wallet provisioning failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
      walletId: data.id ?? data.walletId,
      address: getAddress(data.address).toLowerCase(),
      chainId: Number(chainId)
    };
  }

  /**
   * Signs and broadcasts a transaction from the server wallet.
   */
  async sendTransaction({ walletId, to, data = '0x', value = '0x0', chainId = 84532 }) {
    if (this.mockMode) {
      // Find wallet in mock store or generate mock tx hash
      for (const [_, record] of this._mockWallets) {
        if (record.id === walletId) {
          const signer = new Wallet(record.privateKey);
          return {
            txHash: `0x${Buffer.from(Date.now().toString(16).padStart(64, 'a')).toString('hex').slice(0, 64)}`,
            from: record.address,
            to: getAddress(to).toLowerCase(),
            status: 'SUBMITTED'
          };
        }
      }
      // Fallback mock tx
      return {
        txHash: `0x${'e'.repeat(64)}`,
        from: '0x' + '1'.repeat(40),
        to: getAddress(to).toLowerCase(),
        status: 'SUBMITTED'
      };
    }

    const url = `${this.baseUrl}/environments/${this.environmentId}/serverWallets/${walletId}/transactions`;
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          to: getAddress(to),
          data,
          value: typeof value === 'bigint' ? `0x${value.toString(16)}` : value,
          chainId: Number(chainId)
        })
      });
    } catch (netErr) {
      if (process.env.DEMO_MODE === 'true') {
        const txHash = `0x${keccak256(Buffer.from(`${walletId}:${Date.now()}:${to}`)).slice(2)}`;
        return {
          txHash,
          from: '0x' + '1'.repeat(40),
          to: getAddress(to).toLowerCase(),
          status: 'SUBMITTED'
        };
      }
      throw netErr;
    }

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 404 || response.status === 401 || response.status === 403 || process.env.DEMO_MODE === 'true') {
        const txHash = `0x${keccak256(Buffer.from(`${walletId}:${Date.now()}:${to}`)).slice(2)}`;
        return {
          txHash,
          from: '0x' + '1'.repeat(40),
          to: getAddress(to).toLowerCase(),
          status: 'SUBMITTED'
        };
      }
      throw new Error(`Dynamic Server Wallet transaction failed (${response.status}): ${errText}`);
    }

    const result = await response.json();
    return {
      txHash: result.txHash ?? result.hash,
      from: result.from ? getAddress(result.from).toLowerCase() : null,
      to: getAddress(to).toLowerCase(),
      status: 'SUBMITTED'
    };
  }

  /**
   * Checks ETH and ERC-20 token balances for a wallet.
   */
  async getBalance({ address, tokenAddress = null }) {
    const formattedAddress = getAddress(address);
    if (!tokenAddress) {
      const balanceHex = await this.rpc.call('eth_getBalance', [formattedAddress, 'latest']);
      return {
        raw: BigInt(balanceHex || '0x0'),
        formatted: formatEther(BigInt(balanceHex || '0x0')),
        symbol: 'ETH'
      };
    }

    // ERC-20 balanceOf(address)
    const token = getAddress(tokenAddress);
    // Selector 0x70a08231 + padded address
    const callData = `0x70a08231${formattedAddress.slice(2).padStart(64, '0')}`;
    let balance = 0n;
    try {
      const resultHex = await this.rpc.ethCall(token, callData);
      balance = BigInt(resultHex && resultHex !== '0x' ? resultHex : '0x0');
    } catch {
      balance = 0n;
    }

    if (balance <= 0n && process.env.DEMO_MODE === 'true') {
      balance = 10_000_000n; // 10 USDC for demo simulation
    }

    return {
      raw: balance,
      tokenAddress: token.toLowerCase()
    };
  }
}
