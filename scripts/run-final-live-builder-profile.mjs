import { chromium } from '@playwright/test';
import { JsonRpcProvider, Wallet, getBytes } from 'ethers';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.NEXMARKETS_LIVE_WEB_URL?.trim() || 'http://localhost:4176';
const OUT = new URL('../artifacts/verification/final-live-browser/', import.meta.url);
const provider = new JsonRpcProvider(process.env.RH_TESTNET_RPC_URL, 46630, { staticNetwork: true });
const signer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
const record = { schemaVersion: 1, status: 'STARTED', baseUrl: BASE, wallet: signer.address, screenshots: [] };
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.on('request', (request) => {
  if (!request.url().includes('/v1/builder/profile')) return;
  record.profileRequests ||= [];
  let body = null;
  try { body = request.postDataJSON(); } catch { body = request.postData(); }
  record.profileRequests.push({ method: request.method(), url: request.url(), body });
});
await page.exposeFunction('__nexmarketsLivePersonalSign', async (message) => signer.signMessage(getBytes(message)));
const installCertificationWallet = async (target) => {
  await target.exposeFunction('__nexmarketsLivePersonalSign', async (message) => signer.signMessage(getBytes(message)));
  await target.addInitScript(({ address }) => {
  window.ethereum = { request: async ({ method, params = [] }) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
    if (method === 'eth_chainId') return '0xb626';
    if (method === 'net_version') return '46630';
    if (method === 'personal_sign') return window.__nexmarketsLivePersonalSign(params[0]);
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
    throw Object.assign(new Error(`UNSUPPORTED_CERTIFICATION_WALLET_METHOD:${method}`), { code: 4200 });
  } };
  }, { address: signer.address });
};
// The first page has already received the wallet bridge above; use the same
// helper for a fresh browser context below so both checks exercise the real UI.
await page.addInitScript(({ address }) => {
  window.ethereum = { request: async ({ method, params = [] }) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
    if (method === 'eth_chainId') return '0xb626';
    if (method === 'net_version') return '46630';
    if (method === 'personal_sign') return window.__nexmarketsLivePersonalSign(params[0]);
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
    throw Object.assign(new Error(`UNSUPPORTED_CERTIFICATION_WALLET_METHOD:${method}`), { code: 4200 });
  } };
}, { address: signer.address });

const profileValues = (target) => target.evaluate(() => Object.fromEntries(
  ['ebdName', 'ebdHandle', 'ebdTagline', 'ebdAbout', 'ebdWebsite', 'ebdX'].map((id) => [id, document.getElementById(id)?.value])
));
const ensureAuthenticatedAndOpenBuilder = async (target) => {
  if (await target.evaluate(() => window.nexmarketsV2?.state?.authenticated !== true)) {
  const connect = target.getByRole('button', { name: 'Connect wallet' }).first();
    if (await connect.count() && await connect.isVisible().catch(() => false)) await connect.click();
    else await target.evaluate(() => window.nexmarketsV2?.connect?.());
  }
  await target.waitForFunction(() => window.nexmarketsV2?.state?.authenticated === true, null, { timeout: 30_000 });
  await target.locator('[data-dash="builder"]').click();
  await target.locator('#ebdName').waitFor({ state: 'visible', timeout: 30_000 });
};

async function snap(name) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, OUT)), fullPage: true });
  record.screenshots.push(`artifacts/verification/final-live-browser/${name}.png`);
}

try {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await page.waitForFunction(() => window.nexmarketsV2?.state?.authenticated === true, null, { timeout: 30_000 });
  await page.locator('[data-dash="builder"]').click();
  await page.locator('#ebdName').fill('NexMarkets Certification Builder');
  await page.locator('#ebdHandle').fill('@nexmarkets-cert');
  await page.locator('#ebdTagline').fill('Independent live lifecycle certification on Robinhood testnet.');
  await page.locator('#ebdAbout').fill('This Builder identity exists to execute and preserve NexMarkets funded-wallet certification evidence across Product, Edition, Pass, Advantage, Market, and public social flows.');
  await page.locator('#ebdWebsite').fill('https://nexmarkets.fun/');
  await page.locator('#ebdX').fill('@nexmarkets-cert');
  record.runtime = await page.evaluate(() => ({
    liveCallback: typeof window.__nmV2SaveBuilderProfile,
    visibleCallback: String(window.nmEliteSaveBuilderProfile || '').slice(0, 240),
    selectedBuilderId: window.nexmarketsV2?.state?.selectedBuilderId,
    managedBuilders: window.nexmarketsV2?.state?.managedBuilders?.map((row) => ({ id: row.id, builder_id: row.builder_id, hasProfile: Boolean(row.profile) })),
    saveButtons: [...document.querySelectorAll('button')].filter((button) => button.textContent?.trim() === 'Save public profile').map((button) => ({ onclick: button.getAttribute('onclick'), visible: Boolean(button.offsetWidth && button.offsetHeight) })),
    fieldMatches: Object.fromEntries(['ebdName', 'ebdHandle', 'ebdTagline', 'ebdAbout', 'ebdWebsite', 'ebdX'].map((id) => [id, [...document.querySelectorAll(`[id="${id}"]`)].map((element) => ({ value: element.value, visible: Boolean(element.offsetWidth && element.offsetHeight), connected: element.isConnected }))])),
    values: Object.fromEntries(['ebdName', 'ebdHandle', 'ebdTagline', 'ebdAbout', 'ebdWebsite', 'ebdX'].map((id) => [id, document.getElementById(id)?.value]))
  }));
  if (record.runtime.liveCallback !== 'function') throw new Error(`LIVE_PROFILE_CALLBACK_UNAVAILABLE:${record.runtime.liveCallback}`);
  await snap('09-builder-profile-before-save');
  record.valuesAfterScreenshot = await page.evaluate(() => Object.fromEntries(
    ['ebdName', 'ebdHandle', 'ebdTagline', 'ebdAbout', 'ebdWebsite', 'ebdX'].map((id) => [id, document.getElementById(id)?.value])
  ));
  if (record.valuesAfterScreenshot.ebdName !== 'NexMarkets Certification Builder') throw new Error('BUILDER_PROFILE_FORM_RESET_BEFORE_CLICK');
  const responsePromise = page.waitForResponse((response) => response.url().includes('/v1/builder/profile'), { timeout: 10_000 }).catch(() => null);
  const saveButton = page.locator('#dash-builder button[onclick^="nmEliteSaveBuilderProfile"]');
  if (await saveButton.count() !== 1) throw new Error(`BUILDER_PROFILE_SAVE_BUTTON_COUNT:${await saveButton.count()}`);
  await saveButton.click();
  const response = await responsePromise;
  if (!response) {
    throw new Error('BUILDER_PROFILE_REQUEST_NOT_EMITTED');
  }
  record.profileResponse = { status: response.status(), requestBody: response.request().postDataJSON(), body: await response.text() };
  if (!response.ok()) throw new Error(`BUILDER_PROFILE_HTTP_${response.status()}`);
  await page.waitForFunction(() => {
    const row = window.nexmarketsV2?.state?.managedBuilders?.find((item) => item.profile?.display_name === 'NexMarkets Certification Builder');
    return Boolean(row?.profile?.builder_id);
  }, null, { timeout: 30_000 });
  await snap('10-builder-profile-saved');
  const result = await page.evaluate(() => {
    const row = window.nexmarketsV2.state.managedBuilders.find((item) => item.profile?.display_name === 'NexMarkets Certification Builder');
    return { builderId: row?.id || row?.builder_id, profile: row?.profile, selectedBuilderId: window.nexmarketsV2.state.selectedBuilderId };
  });
  // Prove the persisted profile is rehydrated from the API after a reload and
  // in a separate browser session. These checks do not mutate the profile.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ensureAuthenticatedAndOpenBuilder(page);
  record.reloadValues = await profileValues(page);
  if (record.reloadValues.ebdName !== 'NexMarkets Certification Builder' || record.reloadValues.ebdHandle !== '@nexmarkets-cert') throw new Error('BUILDER_PROFILE_RELOAD_MISMATCH');
  const freshContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const freshPage = await freshContext.newPage();
  try {
    await installCertificationWallet(freshPage);
    await freshPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await ensureAuthenticatedAndOpenBuilder(freshPage);
    record.newSessionValues = await profileValues(freshPage);
    if (record.newSessionValues.ebdName !== 'NexMarkets Certification Builder' || record.newSessionValues.ebdHandle !== '@nexmarkets-cert') throw new Error('BUILDER_PROFILE_NEW_SESSION_MISMATCH');
  } finally {
    await freshContext.close();
  }
  record.status = 'PASS_BUILDER_PROFILE_SAVED_THROUGH_UI';
  Object.assign(record, result);
} catch (error) {
  record.status = 'FAIL'; record.error = error.message;
  await snap('builder-profile-failure').catch(() => {});
  throw error;
} finally {
  record.finishedAt = new Date().toISOString();
  await writeFile(new URL('builder-profile.json', OUT), `${JSON.stringify(record, null, 2)}\n`);
  await browser.close();
}
console.log(JSON.stringify({ status: record.status, builderId: record.builderId, displayName: record.profile?.display_name }, null, 2));
