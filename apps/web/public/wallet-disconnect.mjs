export async function disconnectAllConnectors({ connectors = [], activeConnector = null, disconnectAsync }) {
  if (typeof disconnectAsync !== 'function') throw new Error('WALLET_DISCONNECT_UNAVAILABLE');

  // Wagmi can retain more than one live connection after a wallet switch.
  // Calling disconnectAsync() without a connector only removes the current
  // one, allowing RainbowKit to immediately promote another connection and
  // continue presenting the account as connected.
  const unique = [];
  const seen = new Set();
  for (const connector of [activeConnector, ...connectors]) {
    if (!connector) continue;
    const key = connector.uid || connector.id || connector;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(connector);
  }

  if (!unique.length) {
    await disconnectAsync();
    return;
  }

  const failures = [];
  for (const connector of unique) {
    try {
      await disconnectAsync({ connector });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    const error = new Error('WALLET_DISCONNECT_FAILED');
    error.failures = failures;
    throw error;
  }
}
