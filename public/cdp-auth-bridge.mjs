import React from 'react';
import { createRoot } from 'react-dom/client';
import { createCDPEmbeddedWallet } from '@coinbase/cdp-core';
import { useCurrentUser, useEvmAddress, useIsSignedIn, useSignOut } from '@coinbase/cdp-hooks';
import { CDPReactProvider } from '@coinbase/cdp-react/components/CDPReactProvider';
import { SignInModal } from '@coinbase/cdp-react/components/SignInModal';
import { http } from 'viem';
import { baseSepolia } from 'viem/chains';

export const CDP_AUTH_METHODS = Object.freeze(['oauth:google', 'oauth:apple', 'oauth:x']);

const READ_ONLY_RPC_METHODS = new Set([
  'eth_call',
  'eth_estimateGas',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'net_version'
]);

function normalizeAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) ? value : null;
}

async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  let payload = null;
  try { payload = await response.json(); } catch { throw new Error('CDP_RPC_INVALID_RESPONSE'); }
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `CDP_RPC_${response.status}`);
    if (payload?.error?.code != null) error.code = payload.error.code;
    throw error;
  }
  return payload?.result;
}

function hybridProvider(cdpProvider, rpcUrl) {
  return {
    isNexMarketsCdpWallet: true,
    request: ({ method, params = [] } = {}) => READ_ONLY_RPC_METHODS.has(method)
      ? rpcRequest(rpcUrl, method, params)
      : cdpProvider.request({ method, params }),
    on: (...args) => cdpProvider.on?.(...args),
    removeListener: (...args) => cdpProvider.removeListener?.(...args)
  };
}

function CdpAuthRuntime({ controls, config, onState, onError }) {
  const [open, setOpen] = React.useState(false);
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { isSignedIn } = useIsSignedIn();
  const { signOut } = useSignOut();
  const providerRef = React.useRef(null);
  const address = normalizeAddress(
    evmAddress
      || currentUser?.evmAccountObjects?.[0]?.address
      || currentUser?.evmAccounts?.[0]
  );

  const setModalOpen = React.useCallback((value) => {
    setOpen(Boolean(value));
    if (!value && !controls.signInCompleted) controls.onModalClosed?.();
  }, [controls]);

  const onSuccess = React.useCallback(() => {
    controls.signInCompleted = true;
    setOpen(false);
  }, [controls]);

  React.useEffect(() => {
    controls.openSignInModal = () => {
      controls.signInCompleted = false;
      setOpen(true);
      return true;
    };
    controls.closeSignInModal = () => setModalOpen(false);
    controls.signOut = signOut;
    controls.ready = true;
  }, [controls, setModalOpen, signOut]);

  React.useEffect(() => {
    if (!isSignedIn || !address) {
      onState({ isSignedIn: false, address: null, provider: null });
      return undefined;
    }
    try {
      if (!providerRef.current) {
        const embedded = createCDPEmbeddedWallet({
          chains: [baseSepolia],
          transports: { [baseSepolia.id]: http(config.rpcUrl || baseSepolia.rpcUrls.default.http[0]) },
          announceProvider: false
        });
        providerRef.current = hybridProvider(embedded.provider, config.rpcUrl || baseSepolia.rpcUrls.default.http[0]);
      }
      onState({ isSignedIn: true, address, provider: providerRef.current });
    } catch (error) {
      onError?.(error);
      onState({ isSignedIn: true, address, provider: null, error });
    }
    return undefined;
  }, [address, config.rpcUrl, isSignedIn, onError, onState]);

  return React.createElement(SignInModal, {
    open,
    setIsOpen: setModalOpen,
    authMethods: config.authMethods || CDP_AUTH_METHODS,
    onSuccess
  });
}

export async function mountCdpAuth({ root, projectId, chainId = baseSepolia.id, rpcUrl, onState, onError }) {
  if (!root) throw new Error('CDP_AUTH_ROOT_REQUIRED');
  if (!String(projectId || '').trim()) throw new Error('CDP_PROJECT_ID_REQUIRED');
  if (Number(chainId) !== baseSepolia.id) throw new Error('CDP_BASE_SEPOLIA_ONLY');

  const controls = {
    openSignInModal: null,
    closeSignInModal: null,
    signOut: null,
    onModalClosed: null,
    signInCompleted: false,
    ready: false,
    state: null
  };
  const cdpConfig = {
    projectId: String(projectId).trim(),
    appName: 'NexMarkets',
    showCoinbaseFooter: true,
    authMethods: CDP_AUTH_METHODS,
    ethereum: { createOnLogin: 'eoa' },
    disableAnalytics: true
  };
  const bridge = React.createElement(
    CDPReactProvider,
    { config: cdpConfig },
    React.createElement(CdpAuthRuntime, {
      controls,
      config: { rpcUrl: rpcUrl || baseSepolia.rpcUrls.default.http[0], authMethods: CDP_AUTH_METHODS },
      onState: (next) => { controls.state = next; onState?.(next); },
      onError
    })
  );
  createRoot(root).render(bridge);
  await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (controls.ready && controls.openSignInModal) return resolve();
      if (Date.now() - startedAt >= 2_000) return reject(new Error('CDP_AUTH_CONTROLS_UNAVAILABLE'));
      setTimeout(check, 25);
    };
    check();
  });
  return controls;
}
