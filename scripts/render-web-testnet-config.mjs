// Explicit development-only override; normal builds target mainnet.
process.env.NEXMARKETS_WEB_NETWORK = 'robinhood-testnet';
await import('./render-web-config.mjs');
