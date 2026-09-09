import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { networkByKey } from '../packages/config/src/networks.mjs';

const root = new URL('../', import.meta.url);
const deployment = JSON.parse(await readFile(new URL('deployments/robinhood-testnet.v1-deployment.json', root), 'utf8'));
const browser = JSON.parse(await readFile(new URL('apps/web/public/config.json', root), 'utf8'));
const testnet = networkByKey('robinhood-testnet');
const mainnet = networkByKey('robinhood-mainnet');

assert.equal(testnet.settlement.mock, true);
assert.equal(testnet.settlement.testnetOnly, true);
assert.equal(testnet.settlement.productionForbidden, true);
assert.equal(testnet.settlement.address.toLowerCase(), deployment.mockUsdg.address.toLowerCase());
assert.equal(mainnet.settlement.mock, undefined);
assert.equal(mainnet.settlement.address.toLowerCase(), '0x5fc5360d0400a0fd4f2af552add042d716f1d168');
assert.equal(browser.networks['robinhood-testnet'].settlementSymbol, 'MockUSDG');
assert.equal(browser.networks['robinhood-testnet'].settlement.mock, true);
assert.equal(browser.networks['base-sepolia'].settlementSymbol, 'USDC');

const report = `# Payment-token configuration\n\n- Status: **PASS (scoped testnet configuration)**\n- Robinhood testnet settlement: **MockUSDG** at \`${deployment.mockUsdg.address}\`.\n- Scope: development/testnet only; the testnet config is marked \`mock: true\`, \`testnetOnly: true\`, and \`productionForbidden: true\`.\n- Robinhood mainnet settlement: **USDG** at \`${mainnet.settlement.address}\`; mainnet manifest validation rejects a mock token.\n- Base Sepolia settlement: **USDC** at \`${networkByKey('base-sepolia').settlement.address}\`.\n- Frontend labels are sourced from the chain-specific settlement object and display \`MockUSDG\` on Robinhood testnet.\n\nThis resolves the MockUSDG finding through the explicitly allowed testnet-only outcome. It is not evidence that production deployment is complete; live token bytecode and the required live-chain journey remain separate certification gates.\n`;
await mkdir(new URL('artifacts/verification/', root), { recursive: true });
await writeFile(new URL('artifacts/verification/payment-token-report.md', root), report, 'utf8');
console.log(JSON.stringify({ status: 'PASS', testnet: { symbol: testnet.settlement.symbol, address: testnet.settlement.address, mock: true }, mainnet: { symbol: mainnet.settlement.symbol, address: mainnet.settlement.address, mock: false } }));
