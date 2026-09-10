import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ConnectButton,
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
  useAccountModal,
  useChainModal,
  useConnectModal
} from '@rainbow-me/rainbowkit';
import { base, injectedWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, WagmiProvider, useAccount, useDisconnect, useWalletClient } from 'wagmi';
import { http } from 'viem';
import { mainnet as viemMainnet } from 'viem/chains';
import { robinhoodTestnet, robinhoodMainnet, baseSepolia, baseMainnet, chains } from './chains.mjs';
import '@rainbow-me/rainbowkit/styles.css';

const PROJECT_ID = 'c4f79cc821944d9680842e34466bfb00';
const NEXMARKETS_THEME = darkTheme({
  accentColor: '#ffb000',
  accentColorForeground: '#151713',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small'
});

// RainbowKit's profile hooks reference the canonical mainnet object even when
// the product exposes a different set of chains. Keep that module initialized
// without adding Ethereum to the selectable networks.
const RAINBOWKIT_MAINNET_ID = viemMainnet.id;

async function connectorProvider(connector, walletClient) {
  if (connector?.getProvider) {
    try {
      const provider = await connector.getProvider();
      if (provider?.request) return provider;
    } catch {}
  }
  if (walletClient?.transport?.request) return walletClient.transport;
  if (typeof window !== 'undefined' && window.ethereum?.request) return window.ethereum;
  return null;
}

function RainbowBridge({ controls, onAccount, onChain, onProvider }) {
  const account = useAccount();
  const walletClient = useWalletClient();
  const disconnect = useDisconnect();
  const connectModal = useConnectModal();
  const accountModal = useAccountModal();
  const chainModal = useChainModal();

  React.useEffect(() => {
    let active = true;
    const connected = Boolean(account.isConnected && account.address);
    // Publish wagmi's account state immediately. Provider discovery can be
    // asynchronous for WalletConnect/Base Account and must not block the
    // connection waiter from resolving.
    onChain(connected ? account.chainId : null);
    onAccount(connected ? account.address : null);
    connectorProvider(account.connector, walletClient.data).then((provider) => {
      if (!active) return;
      if (provider) {
        controls.provider = provider;
        onProvider(provider);
      }
    });
    return () => { active = false; };
  }, [account.connector, account.address, account.chainId, account.isConnected, walletClient.data, controls, onAccount, onChain, onProvider]);

  React.useEffect(() => {
    controls.openConnectModal = connectModal.openConnectModal || null;
    controls.openAccountModal = accountModal.openAccountModal || null;
    controls.openChainModal = chainModal.openChainModal || null;
    controls.disconnect = disconnect.disconnect || null;
    // RainbowKit initially renders while wagmi is resolving its connection
    // status. Do not let the adapter fall through to the injected-wallet
    // error path until the actual modal control is available.
    controls.ready = Boolean(connectModal.openConnectModal || accountModal.openAccountModal);
  }, [connectModal.openConnectModal, accountModal.openAccountModal, chainModal.openChainModal, disconnect.disconnect, controls]);

  // RainbowKit owns the modal UI. The product keeps its existing visual
  // account chip; this inert instance supplies RainbowKit's modal host.
  return React.createElement(
    'div',
    { style: { display: 'none' } },
    React.createElement(ConnectButton, { label: 'Connect wallet' })
  );
}

export async function mountRainbowKit({ root, initialChainId = baseSepolia.id, onAccount, onChain, onProvider }) {
  const initialChain = chains.find((chain) => chain.id === Number(initialChainId)) || baseSepolia;
  const isBaseNetwork = initialChain.id === baseSepolia.id || initialChain.id === baseMainnet.id;
  const connectors = connectorsForWallets(
    [{ groupName: 'Recommended', wallets: [
      ...(isBaseNetwork ? [base] : []),
      injectedWallet,
      walletConnectWallet
    ] }],
    { appName: 'NexMarkets', projectId: PROJECT_ID }
  );
  const wagmiConfig = createConfig({
    chains,
    connectors,
    ssr: false,
    transports: {
      [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
      [robinhoodMainnet.id]: http(robinhoodMainnet.rpcUrls.default.http[0]),
      [baseSepolia.id]: http(baseSepolia.rpcUrls.default.http[0]),
      [baseMainnet.id]: http(baseMainnet.rpcUrls.default.http[0])
    }
  });
  const queryClient = new QueryClient();
  const controls = {
    openConnectModal: null,
    openAccountModal: null,
    openChainModal: null,
    disconnect: null,
    provider: null,
    ready: false
  };
  const bridge = React.createElement(
    WagmiProvider,
    { config: wagmiConfig },
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
      RainbowKitProvider,
        { theme: NEXMARKETS_THEME, initialChain },
        React.createElement(RainbowBridge, { controls, onAccount, onChain, onProvider })
      )
    )
  );
  createRoot(root).render(bridge);
  await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (controls.ready) return resolve();
      if (Date.now() - startedAt >= 2_000) return reject(new Error('RAINBOWKIT_CONTROLS_UNAVAILABLE'));
      setTimeout(check, 25);
    };
    check();
  });
  return controls;
}
