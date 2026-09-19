/**
 * Dynamic x402 HTTP Payment Client
 * Implements the HTTP 402 Payment Required pattern for autonomous agent resource purchasing.
 */
export class X402PaymentClient {
  constructor({ serverWalletClient, walletId, chainId = 84532 } = {}) {
    if (!serverWalletClient) throw new Error('SERVER_WALLET_CLIENT_REQUIRED');
    this.serverWallet = serverWalletClient;
    this.walletId = walletId;
    this.chainId = Number(chainId);
  }

  /**
   * Performs an HTTP request with automatic 402 payment negotiation and retry.
   */
  async fetchWithPayment(url, options = {}) {
    const initialResponse = await fetch(url, options);
    if (initialResponse.status !== 402) {
      return initialResponse;
    }

    // Parse payment requirement from headers or body
    const paymentAddress = initialResponse.headers.get('x-payment-address');
    const paymentAmount = initialResponse.headers.get('x-payment-amount');
    const paymentAsset = initialResponse.headers.get('x-payment-asset');
    const requiredChainId = Number(initialResponse.headers.get('x-payment-chain-id') || this.chainId);

    let paymentDetails = null;
    if (paymentAddress && paymentAmount) {
      paymentDetails = {
        recipient: paymentAddress,
        amount: paymentAmount,
        asset: paymentAsset,
        chainId: requiredChainId
      };
    } else {
      try {
        const body = await initialResponse.json();
        paymentDetails = body.paymentDetails ?? body;
      } catch {
        throw new Error('HTTP 402 Payment Required received, but failed to parse payment details.');
      }
    }

    if (!paymentDetails?.recipient || !paymentDetails?.amount) {
      throw new Error(`Incomplete 402 payment details: ${JSON.stringify(paymentDetails)}`);
    }

    // Execute the payment via Dynamic Server Wallet
    let data = '0x';
    let value = '0x0';
    let target = paymentDetails.recipient;

    if (paymentDetails.asset && paymentDetails.asset !== '0x0000000000000000000000000000000000000000') {
      // ERC-20 transfer(address,uint256)
      target = paymentDetails.asset;
      const recipientClean = paymentDetails.recipient.toLowerCase().replace(/^0x/, '').padStart(64, '0');
      const amountClean = BigInt(paymentDetails.amount).toString(16).padStart(64, '0');
      data = `0xa9059cbb${recipientClean}${amountClean}`;
    } else {
      // Native ETH payment
      value = `0x${BigInt(paymentDetails.amount).toString(16)}`;
    }

    const paymentTx = await this.serverWallet.sendTransaction({
      walletId: this.walletId,
      to: target,
      data,
      value,
      chainId: paymentDetails.chainId || this.chainId
    });

    // Retry request with payment evidence
    const retryHeaders = new Headers(options.headers || {});
    retryHeaders.set('Authorization', `x402 ${paymentTx.txHash}`);
    retryHeaders.set('X-Payment-Tx-Hash', paymentTx.txHash);
    retryHeaders.set('X-Payment-Wallet', paymentTx.from ?? '');

    return fetch(url, {
      ...options,
      headers: retryHeaders
    });
  }
}
