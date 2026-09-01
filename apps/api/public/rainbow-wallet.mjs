import { robinhoodTestnet, robinhoodMainnet, chains } from './chains.mjs';

const PROJECT_ID = 'c4f79cc821944d9680842e34466bfb00';

let modalInstance = null;
let currentAddress = null;
let currentChainId = null;
const accountListeners = new Set();
const chainListeners = new Set();

function notifyAccount(address) {
  currentAddress = address;
  accountListeners.forEach((fn) => { try { fn(address); } catch (e) { console.error(e); } });
}

function notifyChain(chainId) {
  currentChainId = chainId;
  chainListeners.forEach((fn) => { try { fn(chainId); } catch (e) { console.error(e); } });
}

async function initModal() {
  if (modalInstance) return modalInstance;
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.ethereum && !window.__useAppKitInLocal) {
    return null;
  }
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('MODAL_TIMEOUT')), 2000));
    const importPromise = (async () => {
      const { createAppKit } = await import('https://esm.sh/@reown/appkit?bundle');
      const { WagmiAdapter } = await import('https://esm.sh/@reown/appkit-adapter-wagmi?bundle');
      const { http } = await import('https://esm.sh/@wagmi/core?bundle');

      const wagmiAdapter = new WagmiAdapter({
        ssr: false,
        networks: chains,
        projectId: PROJECT_ID,
        transports: {
          [robinhoodTestnet.id]: http('https://rpc.testnet.chain.robinhood.com'),
          [robinhoodMainnet.id]: http('https://rpc.mainnet.chain.robinhood.com')
        }
      });

      modalInstance = createAppKit({
        adapters: [wagmiAdapter],
        networks: [robinhoodTestnet, robinhoodMainnet],
        defaultNetwork: robinhoodTestnet,
        projectId: PROJECT_ID,
        metadata: {
          name: 'NexMarkets',
          description: 'Verifiable passes and utility editions on Robinhood Chain',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://nexmarkets.fun',
          icons: ['https://nexmarkets.fun/favicon.ico']
        },
        themeMode: 'dark',
        themeVariables: {
          '--w3m-accent': '#ffb000',
          '--w3m-color-mix': '#0d0e12',
          '--w3m-color-mix-strength': 40,
          '--w3m-border-radius-master': '1px'
        }
      });

      modalInstance.subscribeAccount((account) => {
        if (account.isConnected && account.address) {
          notifyAccount(account.address);
        } else {
          notifyAccount(null);
        }
      });

      modalInstance.subscribeNetwork((network) => {
        if (network.chainId) {
          notifyChain(Number(network.chainId));
        }
      });

      return modalInstance;
    })();

    return await Promise.race([importPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

export async function openConnectModal() {
  const modal = await initModal();
  if (modal) {
    return modal.open();
  }
  if (typeof window !== 'undefined' && window.ethereum?.request) {
    const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const chain = Number(await window.ethereum.request({ method: 'eth_chainId' }));
    notifyAccount(addr);
    notifyChain(chain);
    return { address: addr, chainId: chain };
  }
  throw new Error('EVM_WALLET_REQUIRED');
}

export async function openAccountModal() {
  const modal = await initModal();
  if (modal) {
    return modal.open({ view: 'Account' });
  }
}

export async function openChainModal() {
  const modal = await initModal();
  if (modal) {
    return modal.open({ view: 'Networks' });
  }
}

export async function disconnectWallet() {
  const modal = await initModal();
  if (modal) {
    await modal.disconnect();
  }
  notifyAccount(null);
}

export function onAccountChange(fn) {
  accountListeners.add(fn);
  return () => accountListeners.delete(fn);
}

export function onChainChange(fn) {
  chainListeners.add(fn);
  return () => chainListeners.delete(fn);
}

export function getConnectedAddress() {
  return currentAddress || (typeof window !== 'undefined' ? window.ethereum?.selectedAddress : null);
}

export function getConnectedChainId() {
  return currentChainId;
}
