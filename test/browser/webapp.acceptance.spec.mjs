import { test, expect } from '@playwright/test';
import { Wallet, getBytes } from 'ethers';

const EDITION = '0x4171D62F43B4168b07a01C04594455DBc3298437';
const TERMS = '0xe357b55e43ce7d7724a3c4fab02814fd0dd590d731247c6e54237f47f2635745';
const OWNER = '0x1111111111111111111111111111111111111111';
const TBA = '0x2222222222222222222222222222222222222222';
const ADVANTAGE_HASH = `0x${'a'.repeat(64)}`;

function fixture() {
  const terms = {
    version: 1, hash: TERMS, terms_hash: TERMS, pricePerPass: '1000000', price_usdg: '1000000',
    previewStartsAt: 1787340000, mintStartsAt: 1787348550, mintEndsAt: 1789940550,
    royaltyBps: 300, royalty_bps: 300, advantagesHash: ADVANTAGE_HASH,
    referralTermsHash: `0x${'b'.repeat(64)}`
  };
  const edition = {
    edition_address: EDITION, address: EDITION, name: 'NexMarkets V1 Test Certification Edition',
    absolute_supply_cap: 3, absoluteSupplyCap: 3, totalMinted: 1, total_minted: 1, publisher: OWNER,
    currentTerms: terms, termsHistory: [terms]
  };
  const pass = {
    edition_address: EDITION, token_id: '1', owner_address: OWNER, terms_hash: TERMS,
    token_bound_account: TBA,
    advantages: [
      { advantageId: `0x${'3'.repeat(64)}`, kind: 'QUANTITY_BASED', remainingUnits: '4', userFacingRemaining: '4' },
      { advantageId: `0x${'4'.repeat(64)}`, kind: 'TIME_BASED', remaining: '86400', userFacingRemaining: '86400' },
      { advantageId: `0x${'5'.repeat(64)}`, kind: 'CONNECTED', remaining: '1', userFacingRemaining: '1' }
    ]
  };
  const summary = {
    edition_address: EDITION, name: edition.name, absolute_supply_cap: '3', total_minted: '1', publisher: OWNER,
    price_usdg: '1000000', active_terms_hash: TERMS, mint_starts_at: '2026-08-21T21:42:30Z', mint_ends_at: '2026-09-20T21:42:30Z'
  };
  return { terms, edition, pass, summary };
}

async function installFixtureApi(page, { delayDiscover = 0, failDiscover = false } = {}) {
  const data = fixture();
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/v1/discover') {
      if (failDiscover) return route.abort();
      if (delayDiscover) await new Promise((resolve) => setTimeout(resolve, delayDiscover));
      return route.fulfill({ json: { data: [data.summary] } });
    }
    if (path.startsWith('/v1/editions/')) return route.fulfill({ json: { data: data.edition } });
    if (path.startsWith('/v1/passes/')) return route.fulfill({ json: { data: data.pass } });
    if (path === '/v1/market/listings') return route.fulfill({ json: { data: [] } });
    if (path === '/v1/auth/challenge' && request.method() === 'POST') return route.fulfill({ json: { nonce: 'browser-nonce', message: 'NexMarkets browser challenge' } });
    if (path === '/v1/auth/verify' && request.method() === 'POST') return route.fulfill({ json: { csrfToken: 'browser-csrf' } });
    if (path === '/v1/me/passes') return route.fulfill({ json: { data: [] } });
    if (path === '/v1/me/advantages') return route.fulfill({ json: { data: [] } });
    if (path === '/v1/builder/dashboard') return route.fulfill({ json: { data: { projects: [], editions: [], royalties: [], referrals: [] } } });
    return route.fulfill({ json: { data: [] } });
  });
  return data;
}

async function goto(page, path) {
  await page.goto(path, { waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => Boolean(window.nexmarketsV2)), { timeout: 20_000 }).toBe(true);
  await expect(page.locator('html')).toHaveClass(/nm-v2-ready/, { timeout: 20_000 });
}

async function navigate(page, path) {
  await page.evaluate((value) => window.nexmarketsV2.navigate(value), path);
  await page.waitForTimeout(120);
}

function collectFatalErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function assertNoMutationRequests(page, action) {
  const mutations = [];
  const listener = (request) => { if (request.method() !== 'GET' && request.url().includes('/v1/')) mutations.push(`${request.method()} ${request.url()}`); };
  page.on('request', listener);
  await action();
  await page.waitForTimeout(350);
  page.off('request', listener);
  expect(mutations, 'viewing a route must not submit a mutation').toEqual([]);
}

test('V2 template renders certified API/Subgraph data across public routes without mutation', async ({ page }) => {
  const errors = collectFatalErrors(page);
  await installFixtureApi(page);
  await goto(page, '/discover');
  await expect(page.getByRole('heading', { name: 'Find what is worth being early to.' })).toBeVisible();
  await expect(page.locator('#discover').getByText('NexMarkets V1 Test Certification Edition', { exact: true }).first()).toBeVisible();
  await expect(page.locator('#discover').getByText('1/3 serials issued').first()).toBeVisible();

  await navigate(page, `/editions/${EDITION}`);
  await expect(page.locator('#nm-v2-data-panel')).toContainText(TERMS);
  await expect(page.locator('#nm-v2-data-panel')).toContainText('1.000000 USDG');
  await navigate(page, `/projects/${EDITION}`);
  await expect(page.locator('#project')).toContainText('NexMarkets V1 Test Certification Edition');

  await navigate(page, `/passes/${EDITION}/1`);
  await expect(page.locator('#nm-v2-data-panel')).toContainText('#001 / 3');
  await expect(page.locator('#nm-v2-data-panel')).toContainText(TERMS);
  await expect(page.locator('#nm-v2-data-panel')).toContainText(TBA);
  await expect(page.locator('#nm-v2-data-panel')).toContainText('Active entitlement/access');

  await navigate(page, '/market');
  await expect(page.getByRole('heading', { name: 'Editions trading' })).toBeVisible();
  await expect(page.getByText('There are no active secondary listings yet.')).toBeVisible();
  await navigate(page, '/dashboard/holder');
  await expect(page.locator('#dashboard')).toContainText('Connect wallet');
  await navigate(page, '/dashboard/builder');
  await expect(page.locator('#dashboard')).toContainText('0 Passes');
  await expect(page.locator('#create')).toHaveCount(1);
  await assertNoMutationRequests(page, async () => {
    await page.reload({ waitUntil: 'commit' });
  });
  expect(errors, `fatal browser errors: ${errors.join('; ')}`).toEqual([]);
});

test('wallet disconnected and wrong-network states are explicit', async ({ page }) => {
  await installFixtureApi(page);
  await page.addInitScript(({ owner }) => {
    window.ethereum = { request: async ({ method }) => method === 'eth_requestAccounts' ? [owner] : method === 'eth_chainId' ? '0x1' : '0x0' };
  }, { owner: OWNER });
  await goto(page, '/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect(page.locator('#nm-v2-runtime-banner')).toContainText('SWITCH_TO_ROBINHOOD_46630');
});

test('wallet challenge/session works without submitting a chain transaction', async ({ page }) => {
  const signer = Wallet.createRandom();
  await installFixtureApi(page);
  await page.exposeFunction('__nexmarketsSignPersonalMessage', (message) => signer.signMessage(getBytes(message)));
  await page.addInitScript(({ address }) => {
    window.__nexmarketsProviderMethods = [];
    window.ethereum = { request: async ({ method, params }) => {
      window.__nexmarketsProviderMethods.push(method);
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0xb626';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      return '0x0';
    } };
  }, { address: signer.address });
  const mutations = [];
  page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/v1/')) mutations.push(new URL(request.url()).pathname); });
  await goto(page, '/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect(page.locator('#dashboard')).toContainText('0 Passes');
  await expect(page.locator('.account-label').first()).toContainText('0x');
  expect(mutations.filter((path) => !['/v1/auth/challenge', '/v1/auth/verify'].includes(path))).toEqual([]);
  const providerMethods = await page.evaluate(() => window.__nexmarketsProviderMethods);
  expect(providerMethods.filter((method) => ['eth_sendTransaction', 'eth_sendRawTransaction'].includes(method))).toEqual([]);
});

test('loading and API failure states remain explicit', async ({ page }) => {
  await installFixtureApi(page, { delayDiscover: 1500 });
  await page.goto('/discover', { waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveClass(/nm-v2-loading/);
  await expect(page.locator('html')).toHaveClass(/nm-v2-ready/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Find what is worth being early to.' })).toBeVisible();

  await page.unroute('**/v1/**');
  await installFixtureApi(page, { failDiscover: true });
  await page.route('**/v1/editions/**', (route) => route.abort());
  await goto(page, '/discover');
  await expect(page.getByText(/Live NexMarkets data is unavailable/)).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/nm-v2-ready/);
});

test('Create wizard submits full draft to API with CSRF, retains DRAFT status, and submits no blockchain transaction', async ({ page }) => {
  const signer = Wallet.createRandom();
  let submittedPayload = null;
  let submittedHeaders = {};

  await installFixtureApi(page);

  await page.route('**/v1/builder/projects', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      submittedPayload = JSON.parse(req.postData() || '{}');
      submittedHeaders = req.headers();
      return route.fulfill({
        status: 201,
        json: {
          data: {
            id: 'prj_browser_test_01',
            status: 'DRAFT',
            slug: submittedPayload.slug,
            name: submittedPayload.name,
            content: submittedPayload.launchDraft
          }
        }
      });
    }
    return route.continue();
  });

  await page.exposeFunction('__nexmarketsSignPersonalMessage', (message) => signer.signMessage(getBytes(message)));
  await page.addInitScript(({ address }) => {
    window.__nexmarketsProviderMethods = [];
    window.ethereum = { request: async ({ method, params }) => {
      window.__nexmarketsProviderMethods.push(method);
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0xb626';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      return '0x0';
    } };
  }, { address: signer.address });

  await goto(page, '/create');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect(page.locator('.account-label').first()).toContainText('0x');

  const projectResult = await page.evaluate(async () => {
    return window.nexmarketsV2.submitCreateDraft();
  });

  expect(projectResult.id).toBe('prj_browser_test_01');
  expect(projectResult.status).toBe('DRAFT');
  expect(submittedPayload).toBeTruthy();
  expect(submittedPayload.slug).toBeTruthy();
  expect(submittedPayload.name).toBeTruthy();
  expect(submittedPayload.launchDraft).toBeTruthy();
  expect(submittedPayload.launchDraft.edition).toBeTruthy();
  expect(submittedPayload.launchDraft.advantages.length).toBeGreaterThan(0);
  expect(submittedPayload.launchDraft.preview).toBeTruthy();
  expect(submittedPayload.launchDraft.design).toBeTruthy();
  expect(submittedPayload.launchDraft.status).toBe('DRAFT');
  expect(submittedHeaders['x-csrf-token']).toBe('browser-csrf');

  await expect(page.locator('#projectActionMount')).toContainText('Draft saved');
  await expect(page.locator('#projectActionMount')).toContainText('Safe workflow is pending protocol admin execution');

  const providerMethods = await page.evaluate(() => window.__nexmarketsProviderMethods);
  expect(providerMethods.filter((m) => ['eth_sendTransaction', 'eth_sendRawTransaction'].includes(m))).toEqual([]);

  await navigate(page, '/discover');
  await expect(page.locator('#discover').getByText(submittedPayload.name, { exact: true })).toHaveCount(0);
});
