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
    referralTermsHash: `0x${'b'.repeat(64)}`,
    advantageConfigs: [
      { advantageId: `0x${'3'.repeat(64)}`, kind: 1, startsAt: 1787348550, endsAt: 1789940550, totalUnits: '4', definitionHash: `0x${'6'.repeat(64)}` },
      { advantageId: `0x${'4'.repeat(64)}`, kind: 0, startsAt: 1787348550, endsAt: 1789940550, totalUnits: '2592000', definitionHash: `0x${'7'.repeat(64)}` },
      { advantageId: `0x${'5'.repeat(64)}`, kind: 2, startsAt: 1787348550, endsAt: 1789940550, totalUnits: '1', definitionHash: `0x${'8'.repeat(64)}` }
    ]
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
    price_usdg: '1000000', active_terms_hash: TERMS, mint_starts_at: '2026-08-21T21:42:30Z', mint_ends_at: '2026-09-20T21:42:30Z',
    // Published API records carry the frozen launch configuration used by
    // presentation and export renderers. Keep the browser fixture aligned
    // with that production contract instead of relying on template defaults.
    content: {
      project: {
        name: edition.name,
        builder: 'Certification Builder',
        builderHandle: '@certificationbuilder',
        desc: 'A certified testnet Pass used by the browser acceptance journey.',
        about: 'A certified testnet Pass used by the browser acceptance journey.',
        category: 'tools',
        productState: 'Live'
      },
      edition: { name: edition.name, series: 'SERIES 01', supply: 3, price: 1, royalty: 3 },
      design: {
        rendererVersion: 'pass-renderer-v1', passDesign: 'classic', frame: 'obsidian', frameColor: '#2a2725',
        color: '#34483a', colorStyle: 'solid', artMode: 'single', artSrc: '', artX: 50, artY: 50,
        selectedSerialIndex: 0, passAssignments: []
      },
      advantages: terms.advantageConfigs,
      referral: { enabled: false, rate: 0, settlement: 'Builder Settled' }
    }
  };
  return { terms, edition, pass, summary };
}

async function installFixtureApi(page, { delayDiscover = 0, failDiscover = false } = {}) {
  const data = fixture();
  let activeSession = null;
  let lastChallengeAddress = null;
  // Keep the browser suite deterministic in network-restricted runners. The
  // product's font stylesheet is presentation-only and not part of API data.
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    contentType: 'text/css',
    body: ''
  }));
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
    if (path === '/v1/auth/challenge' && request.method() === 'POST') {
      try {
        const body = JSON.parse(request.postData() || '{}');
        lastChallengeAddress = body.address;
      } catch {}
      return route.fulfill({ json: { nonce: 'browser-nonce', message: 'NexMarkets browser challenge' } });
    }
    if (path === '/v1/auth/verify' && request.method() === 'POST') {
      activeSession = {
        authenticated: true,
        accountId: 'acc_browser_01',
        wallet: lastChallengeAddress || OWNER,
        chainId: 84532,
        csrfToken: 'browser-csrf'
      };
      return route.fulfill({ json: { csrfToken: 'browser-csrf' } });
    }
    if (path === '/v1/me/session') {
      if (activeSession) return route.fulfill({ json: activeSession });
      return route.fulfill({ status: 401, json: { error: 'UNAUTHENTICATED' } });
    }
    if (path === '/v1/auth/logout' && request.method() === 'POST') {
      activeSession = null;
      return route.fulfill({ json: { success: true } });
    }
    if (path === '/v1/me/passes') return route.fulfill({ json: { data: [] } });
    if (path === '/v1/me/advantages') return route.fulfill({ json: { data: [] } });
    if (path === '/v1/builder/dashboard') return route.fulfill({ json: { data: { projects: [], editions: [], royalties: [], referrals: [] } } });
    return route.fulfill({ json: { data: [] } });
  });
  return data;
}

async function goto(page, path) {
  // Keep deterministic provider stubs on the direct EIP-1193 path. The
  // production/local path exercises RainbowKit by default.
  await page.addInitScript(() => { window.__nexmarketsUseInjectedFallback = true; });
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

function valueAtPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
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
  const networkSelector = page.locator('.nm-network-switcher-button:visible').first();
  await expect(networkSelector).toHaveAttribute('data-rainbowkit-chain-selector', 'true');
  await expect(networkSelector).toHaveAttribute('data-network', 'base-sepolia');
  await expect(networkSelector).toContainText('Base Sepolia');
  await expect(page.locator('.nm-network-switcher select')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Find what is worth being early to.' })).toBeVisible();
  await expect(page.locator('#discover').getByText('NexMarkets V1 Test Certification Edition', { exact: true }).first()).toBeVisible();
  await expect(page.locator('#discover').getByText('1/3 serials issued').first()).toBeVisible();

  await navigate(page, `/editions/${EDITION}`);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe(`/editions/${EDITION}`);
  await expect(page.locator('#nm-v2-data-panel')).toContainText(TERMS);
  await expect(page.locator('#nm-v2-data-panel')).toContainText('1.000000 USDC');
  await navigate(page, `/projects/${EDITION}`);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe(`/projects/${EDITION}`);
  await expect(page.locator('#project')).toContainText('NexMarkets V1 Test Certification Edition');

  await navigate(page, `/passes/${EDITION}/1`);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe(`/passes/${EDITION}/1`);
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
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/dashboard/builder');
  await expect(page.locator('#dashboard')).toContainText('0 Passes');
  await expect(page.locator('#create')).toHaveCount(1);
  await assertNoMutationRequests(page, async () => {
    await page.reload({ waitUntil: 'commit' });
  });
  expect(errors, `fatal browser errors: ${errors.join('; ')}`).toEqual([]);
});

test('template navigation keeps clean browser URLs and supports back navigation', async ({ page }) => {
  await installFixtureApi(page);
  await goto(page, '/');

  await page.evaluate(() => window.go('discover'));
  await expect.poll(() => page.evaluate(() => ({ path: location.pathname, screen: document.querySelector('.screen.active')?.id }))).toEqual({ path: '/discover', screen: 'discover' });

  await page.evaluate(() => window.go('market'));
  await expect.poll(() => page.evaluate(() => ({ path: location.pathname, screen: document.querySelector('.screen.active')?.id }))).toEqual({ path: '/market', screen: 'market' });

  await page.goBack({ waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => ({ path: location.pathname, screen: document.querySelector('.screen.active')?.id }))).toEqual({ path: '/discover', screen: 'discover' });
});

test('wallet disconnected and wrong-network states are explicit', async ({ page }) => {
  await installFixtureApi(page);
  await page.addInitScript(({ owner }) => {
    window.ethereum = { request: async ({ method }) => method === 'eth_requestAccounts' ? [owner] : method === 'eth_chainId' ? '0x1' : '0x0' };
  }, { owner: OWNER });
  await goto(page, '/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect(page.locator('#nm-v2-runtime-banner')).toContainText('SWITCH_TO_BASE_84532');
});

test('disconnected connect opens RainbowKit instead of requiring an injected wallet', async ({ page }) => {
  await installFixtureApi(page);
  await page.goto('/', { waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => Boolean(window.nexmarketsV2)), { timeout: 20_000 }).toBe(true);
  await expect(page.locator('html')).toHaveClass(/nm-v2-ready/, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Log in / Connect' }).first().click();
  const dialog = page.locator('[role="dialog"]:visible').filter({ hasText: 'Connect a Wallet' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const bannerText = await page.evaluate(() => document.querySelector('#nm-v2-runtime-banner')?.textContent ?? '');
  expect(bannerText).not.toContain('EVM_WALLET_REQUIRED');
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
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      return '0x0';
    } };
  }, { address: signer.address });
  const mutations = [];
  page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/v1/')) mutations.push(new URL(request.url()).pathname); });
  await goto(page, '/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect(page.locator('#dashboard')).toContainText('0 Passes');
  await expect(page.getByRole('button', { name: 'Account' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in / Connect' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.nmJourneyState?.signedIn)).toBe(true);
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
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      return '0x0';
    } };
  }, { address: signer.address });

  await goto(page, '/create');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect(page.locator('.account-label').first()).toContainText('0x');
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);
  await expect.poll(() => page.evaluate(() => !window.nexmarketsV2.state.hydrating)).toBe(true);

  // Fill the visible Product fields with non-default values before submitting.
  // The remaining stages are covered by the payload contract assertion below.
  await page.locator('[data-product-state="Beta"]').evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.locator('[data-product-state="Beta"]').click({ force: true });
  await page.locator('#cName').fill('Payload Complete Project');
  await page.locator('#cBuilder').fill('Payload Builder');
  await page.locator('#cHandle').fill('@payloadbuilder');
  await page.locator('#cDesc').fill('A complete project used to verify every create field reaches the API.');
  await page.locator('#cAbout').fill('Payload Complete Project gives builders a complete pass workflow with clear terms, useful holder benefits, and a public product experience that can be inspected before the debut opens.');
  await page.locator('#cCategory').selectOption('finance');
  await page.locator('#cVideoUrl').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.locator('#cEvidenceType').selectOption('Demo');
  await page.locator('#cEvidenceUrl').fill('https://payload.example/demo');
  await page.locator('#cSupportUrl').fill('https://payload.example/support');
  await page.locator('#cBannerLogoPosition').selectOption('tr');
  const projectResult = await page.evaluate(async () => window.nexmarketsV2.submitCreateDraft());

  expect(projectResult.id).toBe('prj_browser_test_01');
  expect(projectResult.status).toBe('DRAFT');
  expect(submittedPayload).toBeTruthy();
  expect(submittedPayload.slug).toBeTruthy();
  expect(submittedPayload.name).toBeTruthy();
  expect(submittedPayload.launchDraft).toBeTruthy();
  expect(submittedPayload.launchDraft.edition).toBeTruthy();
  expect(submittedPayload.launchDraft.advantages.length).toBeGreaterThan(0);
  expect(submittedPayload.launchDraft.advantages.every((item) => ['Connected', 'Redemption'].includes(item.mechanism))).toBe(true);
  expect(submittedPayload.launchDraft.review).toEqual({ advantages: false, evidence: false, preview: false });
  expect(submittedPayload.launchDraft.preview).toBeTruthy();
  expect(submittedPayload.launchDraft.design).toBeTruthy();
  expect(submittedPayload.launchDraft.status).toBe('DRAFT');
  expect(submittedHeaders['x-csrf-token']).toBe('browser-csrf');

  const expectedPaths = await page.evaluate(() => window.__nmV2CreateDraftFieldPaths);
  expect(expectedPaths.length).toBeGreaterThan(40);
  for (const path of expectedPaths) {
    expect(valueAtPath(submittedPayload.launchDraft, path), `missing create field ${path}`).not.toBeUndefined();
  }
  expect(submittedPayload.launchDraft.network).toBe('base');
  expect(submittedPayload.launchDraft.project).toMatchObject({
    name: 'Payload Complete Project',
    builder: 'Payload Builder',
    builderHandle: '@payloadbuilder',
    category: 'finance',
    productState: 'Beta',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    network: 'base'
  });
  expect(submittedPayload.launchDraft.project.evidence).toMatchObject({ type: 'Demo', url: 'https://payload.example/demo' });
  expect(submittedPayload.launchDraft.project.supportUrl).toBe('https://payload.example/support');
  expect(submittedPayload.launchDraft.project.banner.logoPosition).toBe('tr');
  expect(submittedPayload.launchDraft.edition.network).toBe('base');
  expect(submittedPayload.launchDraft.referral).toEqual({ enabled: false, rate: 0, settlement: 'Builder Settled' });
  expect(submittedPayload.launchDraft.design).toMatchObject({
    customColor: '#5f6f50',
    frameHueCustomized: false,
    artEditionView: 'grid',
    selectedSerialIndex: 0
  });
  expect(submittedPayload.launchDraft.review).toEqual({ evidence: false, advantages: false, preview: false });

  await expect(page.locator('#projectActionMount')).toContainText('Draft saved');
  await expect(page.locator('#projectActionMount')).toContainText('On-chain Edition deployment is a separate next step');

  const providerMethods = await page.evaluate(() => window.__nexmarketsProviderMethods);
  expect(providerMethods.filter((m) => ['eth_sendTransaction', 'eth_sendRawTransaction'].includes(m))).toEqual([]);

  await navigate(page, '/discover');
  await expect(page.locator('#discover').getByText(submittedPayload.name, { exact: true })).toHaveCount(0);
});

test('browser media upload prepares, uploads, verifies, and binds a stable artwork URL', async ({ page }) => {
  const signer = Wallet.createRandom();
  let preparePayload = null;
  let completePayload = null;
  let uploadHeaders = null;
  const mediaId = 'med_browser_art_01';
  const stableUrl = `/v1/media/${mediaId}/content`;

  await installFixtureApi(page);
  await page.route('**/v1/media/uploads', async (route) => {
    preparePayload = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({
      status: 201,
      json: {
        data: {
          asset: { id: mediaId, filename: preparePayload.filename, mimeType: preparePayload.mimeType, byteSize: preparePayload.byteSize, sha256: preparePayload.sha256, safetyStatus: 'PENDING', url: null },
          upload: { method: 'PUT', url: 'https://upload.example/signed-artwork', headers: { 'content-type': preparePayload.mimeType, 'x-amz-meta-sha256': preparePayload.sha256 }, expiresInSeconds: 900 }
        }
      }
    });
  });
  await page.route('https://upload.example/**', async (route) => {
    uploadHeaders = route.request().headers();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT,OPTIONS', 'access-control-allow-headers': '*' } });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  await page.route(`**/v1/media/${mediaId}/complete`, async (route) => {
    completePayload = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({
      status: 200,
      json: {
        data: {
          asset: { id: mediaId, filename: preparePayload.filename, mimeType: 'image/png', byteSize: preparePayload.byteSize, sha256: preparePayload.sha256, width: 1, height: 1, uploadStatus: 'UPLOADED', safetyStatus: 'APPROVED', url: stableUrl }
        }
      }
    });
  });
  await page.exposeFunction('__nexmarketsSignPersonalMessage', (message) => signer.signMessage(getBytes(message)));
  await page.addInitScript(({ address }) => {
    window.__nexmarketsProviderMethods = [];
    window.ethereum = { request: async ({ method, params }) => {
      window.__nexmarketsProviderMethods.push(method);
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      return '0x0';
    } };
  }, { address: signer.address });

  await goto(page, '/create');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);

  const asset = await page.evaluate(async () => {
    const encoded = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return window.__nmV2UploadCreateAsset(new File([bytes], 'verified-artwork.png', { type: 'image/png' }), 'art');
  });
  expect(asset).toMatchObject({ id: mediaId, safetyStatus: 'APPROVED', url: stableUrl, width: 1, height: 1 });
  expect(preparePayload).toMatchObject({ filename: 'verified-artwork.png', mimeType: 'image/png' });
  expect(preparePayload.byteSize).toBeGreaterThan(0);
  expect(preparePayload.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(uploadHeaders).toMatchObject({ 'content-type': 'image/png', 'x-amz-meta-sha256': preparePayload.sha256 });
  expect(completePayload).toEqual({});
  const createData = await page.evaluate(() => window.__nmV2GetCreateData());
  expect(createData.artAssetId).toBe(mediaId);
  expect(createData.artSrc).toBe(stableUrl);
});

test('Owned Pass download produces a 2048 by 2048 PNG from the rendered Pass', async ({ page }) => {
  const signer = Wallet.createRandom();
  const data = await installFixtureApi(page);
  const ownedPass = { ...data.pass, name: data.edition.name, owner_address: signer.address, owner: signer.address, royalty_receiver: OWNER, royalty_bps: 300 };
  await page.route('**/v1/me/passes', (route) => route.fulfill({ json: { data: [ownedPass] } }));
  await page.exposeFunction('__nexmarketsSignPersonalMessage', (message) => signer.signMessage(getBytes(message)));
  await page.addInitScript(({ address }) => {
    window.ethereum = { request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      return '0x0';
    } };
  }, { address: signer.address });
  await goto(page, '/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.hydrating)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.templateData?.ownedPasses?.length || 0)).toBe(1);

  const ownedKey = `${EDITION.toLowerCase()}-1`;
  const [download, result] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.evaluate((key) => window.downloadOwnedPass(key), ownedKey)
  ]);
  expect(result).toBe(true);
  expect(download.suggestedFilename()).toMatch(/\.png$/i);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(24);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(bytes.toString('ascii', 12, 16)).toBe('IHDR');
  expect(bytes.readUInt32BE(16)).toBe(2048);
  expect(bytes.readUInt32BE(20)).toBe(2048);
});

test('live mint flow sends committed Terms and broadcasts the prepared transaction', async ({ page }) => {
  const signer = Wallet.createRandom();
  const mintTarget = '0x0ea6F883808447f115C7b6C037902361C365555A';
  const txHash = `0x${'9'.repeat(64)}`;
  let mintPayload = null;
  let submittedTransaction = null;

  const data = await installFixtureApi(page);
  await page.route('**/v1/mints/prepare', async (route) => {
    mintPayload = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ json: {
      data: {
        transaction: { id: 'tx_browser_mint', state: 'PREPARED' },
        prepared: { to: mintTarget, data: '0x12345678', value: '0x0' },
        walletMustSign: true,
        serverCustodiesKey: false
      }
    } });
  });
  await page.exposeFunction('__nexmarketsSignPersonalMessage', (message) => signer.signMessage(getBytes(message)));
  await page.addInitScript(({ address, txHash: providerTxHash }) => {
    window.__nexmarketsProviderMethods = [];
    window.__nexmarketsSubmittedTransaction = null;
    window.ethereum = { request: async ({ method, params }) => {
      window.__nexmarketsProviderMethods.push(method);
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      if (method === 'eth_call') return `0x${'f'.repeat(64)}`;
      if (method === 'eth_sendTransaction') {
        window.__nexmarketsSubmittedTransaction = params[0];
        return providerTxHash;
      }
      return '0x0';
    } };
  }, { address: signer.address, txHash });

  await goto(page, '/discover');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);
  await expect.poll(() => page.evaluate(() => !window.nexmarketsV2.state.hydrating)).toBe(true);
  await page.evaluate((name) => window.openProjectMint(name), data.edition.name);
  await page.getByRole('button', { name: 'Confirm purchase' }).click();

  await expect.poll(() => mintPayload).toBeTruthy();
  expect(mintPayload.edition.toLowerCase()).toBe(EDITION.toLowerCase());
  expect(mintPayload.termsVersionHash).toBe(TERMS);
  expect(mintPayload.recipient.toLowerCase()).toBe(signer.address.toLowerCase());
  expect(mintPayload.quantity).toBe(1);
  expect(mintPayload.advantageConfigs).toEqual(data.terms.advantageConfigs);
  await expect(page.locator('#projectActionMount')).toContainText('Mint submitted');
  const providerState = await page.evaluate(() => ({ methods: window.__nexmarketsProviderMethods, transaction: window.__nexmarketsSubmittedTransaction }));
  expect(providerState.methods).toContain('eth_sendTransaction');
  expect(providerState.transaction).toMatchObject({ to: mintTarget, data: '0x12345678', value: '0x0' });
});

test('live listing flow reads the exact owned Pass, signs Seaport data, and registers the order', async ({ page }) => {
  const signer = Wallet.createRandom();
  const listingRegistry = '0xF8fD8D378F6a61Ecb207732F4f1d0c3E4Eb2c75c';
  const txHash = `0x${'8'.repeat(64)}`;
  const orderHash = `0x${'7'.repeat(64)}`;
  let listingPayload = null;
  let signedOrderPayload = null;

  const data = await installFixtureApi(page);
  const ownedPass = { ...data.pass, owner_address: signer.address, owner: signer.address, royalty_receiver: OWNER, royalty_bps: 300 };
  await page.route('**/v1/me/passes', (route) => route.fulfill({ json: { data: [ownedPass] } }));
  await page.route('**/v1/passes/**', (route) => route.fulfill({ json: { data: ownedPass } }));
  await page.route('**/v1/me/advantages', (route) => route.fulfill({ json: { data: [{
    edition_address: EDITION, token_id: '1', advantage_id_hash: `0x${'3'.repeat(64)}`, kind: 'QUANTITY_BASED', remaining_units: '4', terms_hash: TERMS
  }] } }));
  await page.route('**/v1/listings/prepare', async (route) => {
    listingPayload = JSON.parse(route.request().postData() || '{}');
    const order = {
      offerer: signer.address, zone: '0x6666666666666666666666666666666666666666',
      offer: [{ itemType: 2, token: EDITION, identifierOrCriteria: '1', startAmount: '1', endAmount: '1' }],
      consideration: [{ itemType: 1, token: '0x3333333333333333333333333333333333333333', identifierOrCriteria: '0', startAmount: '10000', endAmount: '10000', recipient: OWNER }],
      orderType: 2, startTime: '1', endTime: '9999999999', zoneHash: `0x${'6'.repeat(64)}`, salt: '1',
      conduitKey: `0x${'0'.repeat(64)}`, totalOriginalConsiderationItems: 1
    };
    return route.fulfill({ json: { data: {
      transaction: { id: 'tx_browser_listing', state: 'PREPARED' },
      prepared: {
        orderHash, order,
        typedData: { domain: { name: 'Seaport', version: '1.6', chainId: 84532, verifyingContract: data.edition.address }, types: { OrderComponents: [] }, value: order },
        registryTransaction: { to: listingRegistry, data: '0x87654321', value: '0x0' }
      },
      walletMustSign: true, serverCustodiesKey: false
    } } });
  });
  await page.route('**/v1/listings/signed-order', async (route) => {
    signedOrderPayload = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 201, json: { data: { orderHash } } });
  });
  await page.exposeFunction('__nexmarketsSignPersonalMessage', (message) => signer.signMessage(getBytes(message)));
  await page.addInitScript(({ address, txHash: providerTxHash }) => {
    window.__nexmarketsProviderMethods = [];
    window.__nexmarketsSubmittedTransaction = null;
    window.ethereum = { request: async ({ method, params }) => {
      window.__nexmarketsProviderMethods.push(method);
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      if (method === 'eth_call') return `0x${'f'.repeat(64)}`;
      if (method === 'eth_signTypedData_v4') return `0x${'a'.repeat(130)}`;
      if (method === 'eth_sendTransaction') {
        window.__nexmarketsSubmittedTransaction = params[0];
        return providerTxHash;
      }
      return '0x0';
    } };
  }, { address: signer.address, txHash });

  await goto(page, '/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);
  await expect.poll(() => page.evaluate(() => !window.nexmarketsV2.state.hydrating)).toBe(true);
  const passKey = await page.evaluate(() => window.nexmarketsV2.state.templateData.ownedPasses[0].key);
  await page.evaluate((key) => window.dashListPass(key), passKey);
  await page.getByRole('button', { name: 'Sign and list' }).click();

  await expect.poll(() => listingPayload).toBeTruthy();
  expect(listingPayload).toMatchObject({
    seller: signer.address,
    currentOwner: signer.address,
    edition: EDITION,
    tokenId: '1',
    termsVersionHash: TERMS,
    price: '1000000',
    royaltyBps: '300'
  });
  await expect.poll(() => signedOrderPayload).toBeTruthy();
  expect(signedOrderPayload).toMatchObject({ orderHash, signature: `0x${'a'.repeat(130)}` });
  await expect(page.locator('#dashModalBody')).toContainText('Listing submitted');
  const providerState = await page.evaluate(() => ({ methods: window.__nexmarketsProviderMethods, transaction: window.__nexmarketsSubmittedTransaction }));
  expect(providerState.methods).toContain('eth_signTypedData_v4');
  expect(providerState.methods).toContain('eth_sendTransaction');
  expect(providerState.transaction).toMatchObject({ to: listingRegistry, data: '0x87654321', value: '0x0' });
});

test('live buy flow requires the signed listing and broadcasts Seaport fulfillment', async ({ page }) => {
  const signer = Wallet.createRandom();
  const seaport = '0x0000000000000068F116a894984e2DB1123eB395';
  const txHash = `0x${'6'.repeat(64)}`;
  const orderHash = `0x${'5'.repeat(64)}`;
  let buyPayload = null;
  const order = {
    offerer: OWNER, zone: '0x6666666666666666666666666666666666666666',
    offer: [{ itemType: 2, token: EDITION, identifierOrCriteria: '1', startAmount: '1', endAmount: '1' }],
    consideration: [{ itemType: 1, token: '0x3333333333333333333333333333333333333333', identifierOrCriteria: '0', startAmount: '20000', endAmount: '20000', recipient: signer.address }],
    orderType: 2, startTime: '1', endTime: '9999999999', zoneHash: `0x${'4'.repeat(64)}`, salt: '1',
    conduitKey: `0x${'0'.repeat(64)}`, totalOriginalConsiderationItems: 1
  };
  await installFixtureApi(page);
  await page.route('**/v1/market/listings', (route) => route.fulfill({ json: { data: [{
    order_hash: orderHash, edition_address: EDITION, token_id: '1', price_usdg: '2000000', royalty_bps: 300,
    seller_address: OWNER, signature: `0x${'b'.repeat(130)}`, counter: '0', order_payload: order, status: 'ACTIVE'
  }] } }));
  await page.route('**/v1/listings/buy', async (route) => {
    buyPayload = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ json: { data: {
      transaction: { id: 'tx_browser_buy', state: 'PREPARED' },
      prepared: { to: seaport, data: '0xfedcba98', value: '0x0' },
      walletMustSign: true, serverCustodiesKey: false
    } } });
  });
  await page.addInitScript(({ address, txHash: providerTxHash }) => {
    window.__nexmarketsProviderMethods = [];
    window.__nexmarketsSubmittedTransaction = null;
    window.ethereum = { request: async ({ method, params }) => {
      window.__nexmarketsProviderMethods.push(method);
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return `0x${'c'.repeat(130)}`;
      if (method === 'eth_call') return `0x${'f'.repeat(64)}`;
      if (method === 'eth_sendTransaction') {
        window.__nexmarketsSubmittedTransaction = params[0];
        return providerTxHash;
      }
      return '0x0';
    } };
  }, { address: signer.address, txHash });

  await goto(page, '/market');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);
  await expect.poll(() => page.evaluate(() => !window.nexmarketsV2.state.hydrating)).toBe(true);
  await page.evaluate(() => window.buySelectedListing());
  await page.getByRole('button', { name: 'Confirm purchase' }).click();

  await expect.poll(() => buyPayload).toBeTruthy();
  expect(buyPayload).toEqual({ orderHash });
  await expect(page.locator('#projectActionMount')).toContainText('Purchase submitted');
  const providerState = await page.evaluate(() => ({ methods: window.__nexmarketsProviderMethods, transaction: window.__nexmarketsSubmittedTransaction }));
  expect(providerState.methods).toContain('eth_sendTransaction');
  expect(providerState.transaction).toMatchObject({ to: seaport, data: '0xfedcba98', value: '0x0' });
});

test('approved public surfaces do not introduce document overflow at supported widths', async ({ page }) => {
  await installFixtureApi(page);
  await goto(page, '/');
  const widths = [1440, 1180, 1024, 900, 860, 768, 600, 390, 320];
  const routes = ['/', '/discover', '/market', '/create', '/dashboard/holder'];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.evaluate((path) => window.nexmarketsV2.navigate(path), route);
      await page.waitForTimeout(100);
      const metrics = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth
      }));
      expect(metrics.documentWidth, `${route} overflow at ${width}px`).toBeLessThanOrEqual(metrics.viewport + 1);
      expect(metrics.bodyWidth, `${route} body overflow at ${width}px`).toBeLessThanOrEqual(metrics.viewport + 1);
    }
  }
});

test('session survives page reload without re-signing and restores authenticated state silently', async ({ page }) => {
  const signer = Wallet.createRandom();
  let signCount = 0;
  await installFixtureApi(page);
  await page.exposeFunction('__nexmarketsSignPersonalMessage', (message) => {
    signCount += 1;
    return signer.signMessage(getBytes(message));
  });
  await page.addInitScript(({ address }) => {
    window.ethereum = { request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      return '0x0';
    } };
  }, { address: signer.address });

  await goto(page, '/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);
  expect(signCount).toBe(1);

  // Reload page and assert silent session restoration without prompting personal_sign again
  await page.reload({ waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => Boolean(window.nexmarketsV2))).toBe(true);
  await expect(page.locator('html')).toHaveClass(/nm-v2-ready/, { timeout: 20_000 });

  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.wallet?.toLowerCase())).toBe(signer.address.toLowerCase());
  await expect(page.getByRole('button', { name: 'Account' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in / Connect' })).toHaveCount(0);
  expect(signCount, 'reloading the page must not prompt a new personal_sign message').toBe(1);
});

test('switching wallet cleanly disconnects and opens wallet modal', async ({ page }) => {
  const signer = Wallet.createRandom();
  await installFixtureApi(page);
  await page.exposeFunction('__nexmarketsSignPersonalMessage', (message) => signer.signMessage(getBytes(message)));
  await page.addInitScript(({ address }) => {
    window.ethereum = { request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts') return [address];
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'personal_sign') return window.__nexmarketsSignPersonalMessage(params[0]);
      return '0x0';
    } };
  }, { address: signer.address });

  await goto(page, '/dashboard/holder');
  await page.getByRole('button', { name: 'Connect wallet' }).first().click();
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(true);

  // Trigger switch wallet action
  await page.evaluate(() => window.nmSwitchWallet());
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.authenticated)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.nexmarketsV2.state.wallet)).toBe(null);
  await expect(page.getByRole('button', { name: 'Log in / Connect' }).first()).toBeVisible();
});
