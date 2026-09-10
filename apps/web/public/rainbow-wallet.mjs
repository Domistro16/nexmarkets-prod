let modalInstance = null;
let initPromise = null;
let currentAddress = null;
let currentChainId = null;
let currentProvider = null;
const accountListeners = new Set();
const chainListeners = new Set();
const connectionWaiters = new Set();

function normalizeAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) ? value : null;
}

function notifyAccount(address) {
  currentAddress = normalizeAddress(address);
  accountListeners.forEach((fn) => { try { fn(currentAddress); } catch (error) { console.error(error); } });
  if (currentAddress) {
    const identity = { address: currentAddress, chainId: currentChainId };
    [...connectionWaiters].forEach((waiter) => waiter.resolve(identity));
  }
}

function notifyChain(chainId) {
  currentChainId = chainId == null ? null : Number(chainId);
  chainListeners.forEach((fn) => { try { fn(currentChainId); } catch (error) { console.error(error); } });
}

function isLocalBrowser() {
  return typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

function shouldUseInjectedFallback() {
  // Automated browser tests can provide a deliberately minimal EIP-1193
  // stub. Production/local users should still get RainbowKit's wallet
  // chooser, even when an injected extension is present.
  return isLocalBrowser()
    && window.ethereum?.request
    && window.__nexmarketsUseInjectedFallback === true
    && !window.__useRainbowKitInLocal;
}

function ensureBridgeRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById('nm-rainbowkit-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'nm-rainbowkit-root';
    // Keep the bridge visually inert while allowing RainbowKit's modal portal
    // to render if the library chooses this element as its portal container.
    root.style.display = 'contents';
    document.body.appendChild(root);
  }
  return root;
}

async function initModal({ initialChainId = 84532, chainIds = [] } = {}) {
  if (modalInstance) return modalInstance;
  if (shouldUseInjectedFallback()) return null;
  if (initPromise) return initPromise;

  const initialize = (async () => {
    try {
      const { mountRainbowKit } = await import('./rainbowkit-bridge.mjs');
      const root = ensureBridgeRoot();
      if (!root) throw new Error('RAINBOWKIT_ROOT_REQUIRED');
      const controls = await mountRainbowKit({
        root,
        initialChainId,
        allowedChainIds: chainIds,
        onAccount: notifyAccount,
        onChain: notifyChain,
        onProvider: (provider) => { currentProvider = provider; }
      });
      modalInstance = controls;
      return modalInstance;
    } catch (error) {
      console.warn('RainbowKit initialization failed; using injected-wallet fallback.', error);
      return null;
    }
  })();
  initPromise = initialize;

  const result = await initPromise;
  if (!result) initPromise = null;
  return result;
}

async function connectInjected() {
  if (typeof window === 'undefined' || !window.ethereum?.request) throw new Error('EVM_WALLET_REQUIRED');
  currentProvider = window.ethereum;
  const [address] = await currentProvider.request({ method: 'eth_requestAccounts' });
  if (!normalizeAddress(address)) throw new Error('WALLET_ACCOUNT_REQUIRED');
  const chainId = Number(BigInt(await currentProvider.request({ method: 'eth_chainId' })));
  notifyAccount(address);
  notifyChain(chainId);
  return { address, chainId };
}

export async function openConnectModal({ chainId = 84532, chainIds = [] } = {}) {
  const modal = await initModal({ initialChainId: chainId, chainIds });
  if (modal?.openConnectModal) {
    await modal.openConnectModal();
    return { opened: true };
  }
  if (modal?.openAccountModal) {
    await modal.openAccountModal();
    return { opened: true, address: currentAddress, chainId: currentChainId };
  }
  if (shouldUseInjectedFallback() || !modal) return connectInjected();
  throw new Error('RAINBOWKIT_CONTROLS_UNAVAILABLE');
}

export async function openAccountModal() {
  const modal = await initModal();
  if (modal?.openAccountModal) return modal.openAccountModal();
  return null;
}

export async function openChainModal({ chainIds = [] } = {}) {
  const modal = await initModal({ chainIds });
  if (modal?.openChainModal) return modal.openChainModal();
  return null;
}

export async function disconnectWallet() {
  const modal = await initModal();
  if (modal?.disconnect) await modal.disconnect();
  currentProvider = null;
  notifyAccount(null);
  notifyChain(null);
}

export function waitForConnection({ timeoutMs = 120_000 } = {}) {
  if (currentAddress) return Promise.resolve({ address: currentAddress, chainId: currentChainId });
  let waiter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      connectionWaiters.delete(waiter);
      reject(new Error('WALLET_CONNECTION_TIMEOUT'));
    }, timeoutMs);
    waiter = {
      resolve: (value) => { clearTimeout(timer); connectionWaiters.delete(waiter); resolve(value); },
      reject: (error) => { clearTimeout(timer); connectionWaiters.delete(waiter); reject(error); }
    };
    connectionWaiters.add(waiter);
  });
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
  return currentAddress || (typeof window !== 'undefined' ? normalizeAddress(window.ethereum?.selectedAddress) : null);
}

export function getConnectedChainId() {
  return currentChainId;
}

export async function getWalletProvider() {
  if (currentProvider?.request) return currentProvider;
  if (typeof window !== 'undefined' && window.ethereum?.request) {
    currentProvider = window.ethereum;
    return currentProvider;
  }
  const modal = await initModal();
  return currentProvider || modal?.provider || null;
}
