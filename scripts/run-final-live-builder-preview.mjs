import { chromium } from '@playwright/test';
import { JsonRpcProvider, Wallet, getBytes } from 'ethers';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const BASE = process.env.NEXMARKETS_LIVE_WEB_URL?.trim() || 'http://localhost:4174';
const ARTWORK = fileURLToPath(new URL('../artifacts/verification/live-assets/nexmarkets-testnet-certification.png', import.meta.url));
const OUT = new URL('../artifacts/verification/final-live-browser/', import.meta.url);
const rpcUrl = process.env.RH_TESTNET_RPC_URL?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl || !privateKey) throw new Error('FINAL_LIVE_BROWSER_CREDENTIALS_REQUIRED');

const provider = new JsonRpcProvider(rpcUrl, 46630, { staticNetwork: true });
const signer = new Wallet(privateKey, provider);
const runId = process.env.FINAL_LIVE_RUN_ID?.trim() || '2026-09-09-a';
const projectName = `NexMarkets Final Live ${runId}`;
const record = {
  schemaVersion: 1,
  status: 'STARTED',
  runId,
  baseUrl: BASE,
  wallet: signer.address,
  projectName,
  stages: [],
  providerMethods: [],
  consoleErrors: [],
  pageErrors: [],
  project: null,
  artwork: null
};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
function redactSignedUrl(value) {
  return String(value).replace(/https:\/\/[^\s'"]+X-Amz-[^\s'"]+/giu, '[REDACTED_PRESIGNED_URL]');
}
page.on('console', (message) => { if (message.type() === 'error') record.consoleErrors.push(redactSignedUrl(message.text())); });
page.on('pageerror', (error) => record.pageErrors.push(error.message));

await page.exposeFunction('__nexmarketsLivePersonalSign', async (message) => signer.signMessage(getBytes(message)));
await page.exposeFunction('__nexmarketsLiveTypedSign', async (raw) => {
  const typed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const types = { ...typed.types };
  delete types.EIP712Domain;
  return signer.signTypedData(typed.domain, types, typed.message);
});
await page.exposeFunction('__nexmarketsLiveCall', async (transaction, blockTag = 'latest') => provider.call(transaction, blockTag));
await page.exposeFunction('__nexmarketsLiveSend', async (transaction) => {
  const request = { ...transaction };
  delete request.from;
  if (request.gas && !request.gasLimit) request.gasLimit = request.gas;
  delete request.gas;
  const response = await signer.sendTransaction(request);
  return response.hash;
});
await page.exposeFunction('__nexmarketsLiveReceipt', async (hash) => provider.send('eth_getTransactionReceipt', [hash]));
await page.addInitScript(({ address }) => {
  window.__nexmarketsProviderMethods = [];
  window.ethereum = {
    isNexMarketsCertificationWallet: true,
    request: async ({ method, params = [] }) => {
      window.__nexmarketsProviderMethods.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'eth_chainId') return '0xb626';
      if (method === 'net_version') return '46630';
      if (method === 'personal_sign') return window.__nexmarketsLivePersonalSign(params[0]);
      if (method === 'eth_signTypedData_v4') return window.__nexmarketsLiveTypedSign(params[1]);
      if (method === 'eth_call') return window.__nexmarketsLiveCall(params[0], params[1] || 'latest');
      if (method === 'eth_sendTransaction') return window.__nexmarketsLiveSend(params[0]);
      if (method === 'eth_getTransactionReceipt') return window.__nexmarketsLiveReceipt(params[0]);
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      throw Object.assign(new Error(`UNSUPPORTED_CERTIFICATION_WALLET_METHOD:${method}`), { code: 4200 });
    }
  };
}, { address: signer.address });

async function snap(name) {
  const path = fileURLToPath(new URL(`${name}.png`, OUT));
  await page.screenshot({ path, fullPage: true });
  record.stages.push({ name, screenshot: `artifacts/verification/final-live-browser/${name}.png` });
}

try {
  await page.goto(`${BASE}/create`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await page.waitForFunction(() => window.nexmarketsV2?.state?.authenticated === true, null, { timeout: 30_000 });
  await snap('01-builder-connected');

  await page.locator('#cName').fill(projectName);
  await page.locator('#cBuilder').fill('NexMarkets Certification Builder');
  await page.locator('#cHandle').fill('@nexmarkets-cert');
  await page.locator('#cDesc').fill('A fresh end-to-end testnet product proving the complete NexMarkets Pass lifecycle.');
  await page.locator('#cAbout').fill('This certification-only product verifies the real Builder, Preview, Debut, primary acquisition, immutable Pass artwork, Advantage, listing, replacement-order, secondary purchase, royalty, and public social flows using Robinhood testnet infrastructure.');
  await page.locator('#cCategory').selectOption('tools');
  await page.locator('[data-product-state="Beta"]').click();
  await page.locator('#cEvidenceType').selectOption('Docs');
  await page.locator('#cEvidenceUrl').fill('https://docs.nexmarkets.fun/');
  await page.locator('#cSupportUrl').fill('https://nexmarkets.fun/');
  await snap('02-create-phase-1');
  await page.locator('#nextStage').click();

  await page.locator('#cEdition').fill('Final Live Certification Edition');
  await page.locator('#cSeries').fill('CERT-2026');
  await page.locator('#cSupply').fill('3');
  await page.locator('[data-pass-cost="paid"]').click();
  await page.locator('#cPrice').fill('1');
  await page.locator('#cRoyalty').selectOption('3');
  await snap('03-create-phase-2');
  await page.locator('#nextStage').click();

  await snap('04-create-phase-3-advantages');
  await page.locator('#nextStage').click();

  await page.locator('#artUpload').setInputFiles(ARTWORK);
  await page.waitForFunction(() => Boolean(window.__nmV2GetCreateData?.().artAssetId), null, { timeout: 120_000 });
  await page.locator('#nmRandomPassToggle').click();
  await page.waitForFunction(() => window.__nmV2GetCreateData?.().randomPassMode === true, null, { timeout: 10_000 });
  const manualSelectorCount = await page.locator('#create [data-pass-design]').count();
  if (manualSelectorCount !== 0) throw new Error(`RANDOM_MODE_MANUAL_SELECTORS_VISIBLE:${manualSelectorCount}`);
  record.artwork = await page.evaluate(() => {
    const data = window.__nmV2GetCreateData?.() || {};
    return { assetId: data.artAssetId, url: data.artSrc, randomPassMode: data.randomPassMode, randomPassSeed: data.randomPassSeed };
  });
  await snap('05-create-phase-4-artwork-random');
  await page.locator('#nextStage').click();

  await page.locator('[data-preview-hours="48"]').click();
  await snap('06-create-phase-5-timing');
  await page.locator('#nextStage').click();

  await page.locator('#cReviewAdvantages').check();
  await page.locator('#cReviewEvidence').check();
  await page.locator('#cReviewPreview').check();
  await snap('07-create-phase-6-review');
  await page.locator('#nextStage').click();
  await page.locator('#projectActionMount').getByRole('button', { name: 'Publish your Debut' }).click();
  await page.locator('#projectActionMount').getByText('Pass created', { exact: true }).waitFor({ timeout: 60_000 });
  record.project = await page.evaluate(() => window.nexmarketsV2?.state?.lastSavedProject ?? null);
  record.providerMethods = await page.evaluate(() => window.__nexmarketsProviderMethods || []);
  record.status = 'PASS_PRODUCT_PUBLISHED_THROUGH_UI';
  await snap('08-product-published');
} catch (error) {
  record.status = 'FAIL';
  record.error = error.message;
  await snap('failure').catch(() => {});
  throw error;
} finally {
  record.finishedAt = new Date().toISOString();
  await writeFile(new URL('builder-preview.json', OUT), `${JSON.stringify(record, null, 2)}\n`);
  await browser.close();
}

console.log(JSON.stringify({ status: record.status, projectName, projectId: record.project?.id ?? null, artwork: record.artwork, screenshots: record.stages.length }, null, 2));
