import { test, expect } from '@playwright/test';
import { Wallet, getBytes } from 'ethers';

const EDITION = '0x4171D62F43B4168b07a01C04594455DBc3298437';
const TERMS = '0xe357b55e43ce7d7724a3c4fab02814fd0dd590d731247c6e54237f47f2635745';
const TBA = '0x36b7a3a09adc854b860deb2f373b17db9a0cbc08';

async function noFatalBrowserErrors(page) {
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
  await page.waitForTimeout(500);
  page.off('request', listener);
  expect(mutations, 'viewing a route must not submit a mutation').toEqual([]);
}

test('real certification data renders across public routes without mutation', async ({ page }) => {
  const errors = await noFatalBrowserErrors(page);
  await page.goto('/discover');
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await expect(page.getByText('NexMarkets V1 Test Certification Edition')).toBeVisible();
  await expect(page.getByText('1/3 serials minted')).toBeVisible();

  await page.goto(`/editions/${EDITION}`);
  await expect(page.getByRole('heading', { name: 'NexMarkets V1 Test Certification Edition' })).toBeVisible();
  await expect(page.locator('body')).toContainText(TERMS);
  await expect(page.getByText('Mint is open')).toBeVisible();

  await page.goto(`/projects/${EDITION}`);
  await expect(page.getByRole('heading', { name: 'NexMarkets V1 Test Certification Edition' })).toBeVisible();

  await page.goto(`/passes/${EDITION}/1`);
  await expect(page.getByRole('heading', { name: /NexMarkets V1 Test Certification Edition #1/ })).toBeVisible();
  await expect(page.locator('body')).toContainText(TERMS);
  await expect(page.getByText(/seconds remaining/)).toBeVisible();
  await expect(page.getByText(/units remaining/)).toBeVisible();
  await expect(page.getByText('Active entitlement/access')).toBeVisible();
  await expect(page.getByText(TBA)).toBeVisible();
  await assertNoMutationRequests(page, async () => page.reload());

  await page.goto('/market');
  await expect(page.getByRole('heading', { name: 'Market' })).toBeVisible();
  await expect(page.getByText('No active listings')).toBeVisible();
  await page.goto('/dashboard/holder');
  await expect(page.getByText('Connect to view owned Passes')).toBeVisible();
  await page.goto('/dashboard/builder');
  await expect(page.getByText('Connect to open Builder tools')).toBeVisible();
  expect(errors, `fatal browser errors: ${errors.join('; ')}`).toEqual([]);
});

test('wallet disconnected and wrong-network states are explicit', async ({ page }) => {
  await page.addInitScript(() => {
    window.ethereum = { request: async ({ method }) => method === 'eth_requestAccounts' ? ['0x1111111111111111111111111111111111111111'] : method === 'eth_chainId' ? '0x1' : '0x0' };
  });
  await page.goto('/dashboard/holder');
  await expect(page.locator('#connectInline')).toBeVisible();
  await page.locator('#connectInline').click();
  await expect(page.locator('#toast')).toContainText('SWITCH_TO_ROBINHOOD_46630');
});

test('wallet challenge, session and CSRF boundary work without a chain transaction', async ({ page }) => {
  const signer = Wallet.createRandom();
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
  page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/v1/')) mutations.push(request.url()); });
  await page.goto('/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect(page.getByRole('link', { name: 'Owned Passes' })).toBeVisible();
  await expect(page.getByText('No Passes owned')).toBeVisible();
  await page.getByRole('link', { name: 'Builder' }).click();
  await expect(page.getByText(/projects · .* Editions/)).toBeVisible();
  const csrf = await page.evaluate(() => sessionStorage.getItem('nex_csrf'));
  expect(csrf).toMatch(/^.+$/);
  const response = await page.evaluate(async () => { const r = await fetch('/v1/builder/projects', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: 'csrf-check', name: 'CSRF check' }) }); return { status: r.status, body: await r.json() }; });
  expect(response.status).toBe(403);
  expect(response.body.error.code).toMatch(/CSRF/);
  expect(mutations
    .filter((url) => !url.endsWith('/v1/auth/challenge') && !url.endsWith('/v1/auth/verify'))
    .map((url) => new URL(url).pathname)).toEqual(['/v1/builder/projects']);
  const providerMethods = await page.evaluate(() => window.__nexmarketsProviderMethods);
  expect(providerMethods.filter((method) => ['eth_sendTransaction', 'eth_sendRawTransaction'].includes(method))).toEqual([]);
});

test('loading and API failure states remain explicit', async ({ page }) => {
  await page.route('**/v1/discover', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  const navigation = page.goto('/discover');
  await expect(page.locator('#app .loading')).toBeVisible();
  await navigation;
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();

  await page.unroute('**/v1/discover');
  await page.route('**/v1/discover', (route) => route.abort());
  await page.goto('/discover');
  await expect(page.getByText('Unable to load')).toBeVisible();
});
