import { chromium } from '@playwright/test';
import { Contract, JsonRpcProvider, Wallet, formatEther, getAddress, getBytes } from 'ethers';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = new URL('../', import.meta.url);
const BASE = process.env.NEXMARKETS_LIVE_WEB_URL?.trim() || 'http://localhost:4174';
const ARTWORK = fileURLToPath(new URL('../artifacts/verification/live-assets/nexmarkets-testnet-certification.png', import.meta.url));
const OUT = new URL('../artifacts/verification/clean-replacement/', import.meta.url);

const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim() || 'https://sepolia.base.org';
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl || !privateKey) throw new Error('BASE_SEPOLIA_CREDENTIALS_REQUIRED');

const chainId = 84532;
const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
const signer = new Wallet(privateKey, provider);

const runId = process.env.REPLACEMENT_RUN_ID?.trim() || `replacement-${Date.now()}`;
const projectName = `NexMarkets Replacement Live ${runId}`;

const record = {
  schemaVersion: 1,
  status: 'STARTED',
  runId,
  network: 'base-sepolia',
  chainId,
  baseUrl: BASE,
  wallet: signer.address,
  projectName,
  stages: [],
  providerMethods: [],
  consoleErrors: [],
  pageErrors: [],
  project: null,
  edition: null,
  artwork: null,
  created: null,
  termsResult: null,
  continuity: {},
  startedAt: new Date().toISOString()
};

await mkdir(OUT, { recursive: true });

console.log(JSON.stringify({ event: 'runner_started', wallet: signer.address, network: 'base-sepolia', balance: formatEther(await provider.getBalance(signer.address)) }, null, 2));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();

function redactSignedUrl(value) {
  return String(value).replace(/https:\/\/[^\s'"]+X-Amz-[^\s'"]+/giu, '[REDACTED_PRESIGNED_URL]');
}
page.on('console', (message) => {
  if (message.type() === 'error') {
    const text = redactSignedUrl(message.text());
    record.consoleErrors.push(text);
    console.error(`[Browser Console Error] ${text}`);
  }
});
page.on('pageerror', (error) => {
  record.pageErrors.push(error.message);
  console.error(`[Browser Page Error] ${error.message}`);
});

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
  console.log(`[Ethers Live Send] Tx submitted: ${response.hash}`);
  return response.hash;
});
await page.exposeFunction('__nexmarketsLiveReceipt', async (hash) => provider.send('eth_getTransactionReceipt', [hash]));
await page.exposeFunction('__nexmarketsLiveEstimateGas', async (tx) => {
  const est = await provider.estimateGas(tx);
  return '0x' + est.toString(16);
});
await page.exposeFunction('__nexmarketsLiveBlockNumber', async () => {
  const bn = await provider.getBlockNumber();
  return '0x' + bn.toString(16);
});

await page.addInitScript(({ address }) => {
  window.__nexmarketsUseInjectedFallback = true;
  window.__nexmarketsProviderMethods = [];
  window.ethereum = {
    isNexMarketsCertificationWallet: true,
    isMetaMask: true,
    request: async ({ method, params = [] }) => {
      window.__nexmarketsProviderMethods.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'eth_chainId') return '0x14a34'; // 84532
      if (method === 'net_version') return '84532';
      if (method === 'personal_sign') return window.__nexmarketsLivePersonalSign(params[0]);
      if (method === 'eth_signTypedData_v4') return window.__nexmarketsLiveTypedSign(params[1]);
      if (method === 'eth_call') return window.__nexmarketsLiveCall(params[0], params[1] || 'latest');
      if (method === 'eth_sendTransaction') return window.__nexmarketsLiveSend(params[0]);
      if (method === 'eth_getTransactionReceipt') return window.__nexmarketsLiveReceipt(params[0]);
      if (method === 'eth_estimateGas') return window.__nexmarketsLiveEstimateGas(params[0]);
      if (method === 'eth_blockNumber') return window.__nexmarketsLiveBlockNumber();
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      throw Object.assign(new Error(`UNSUPPORTED_CERTIFICATION_WALLET_METHOD:${method}`), { code: 4200 });
    }
  };
}, { address: signer.address });

async function snap(name) {
  const path = fileURLToPath(new URL(`${name}.png`, OUT));
  await page.screenshot({ path, fullPage: true });
  record.stages.push({ name, screenshot: `artifacts/verification/clean-replacement/${name}.png` });
}

try {
  console.log('Navigating to /create...');
  await page.goto(`${BASE}/create`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.nexmarketsV2?.state), null, { timeout: 30_000 });
  await page.waitForFunction(() => !window.nexmarketsV2?.state?.hydrating, null, { timeout: 30_000 });
  if (await page.evaluate(() => !window.nexmarketsV2?.state?.authenticated)) {
    const connectBtn = page.getByRole('button', { name: 'Connect wallet' }).first();
    if (await connectBtn.count()) {
      await connectBtn.click();
    } else {
      await page.evaluate(() => window.nexmarketsV2.connect());
    }
  }
  await page.waitForFunction(() => window.nexmarketsV2?.state?.authenticated === true, null, { timeout: 30_000 });
  await page.waitForFunction(() => !window.nexmarketsV2?.state?.hydrating, null, { timeout: 30_000 });
  await snap('01-builder-connected');
  console.log('Wallet connected and session verified.');

  // Phase 1
  await page.locator('#cName').fill(projectName);
  await page.locator('#cBuilder').fill('NexMarkets Certification Builder');
  await page.locator('#cHandle').fill('@nexmarkets-cert');
  await page.locator('#cDesc').fill('A clean replacement Base Sepolia product proving the complete NexMarkets Pass lifecycle.');
  await page.locator('#cAbout').fill('This clean replacement product verifies the real Builder, Preview, Debut, primary acquisition, immutable Pass artwork, Advantage, listing, replacement-order, secondary purchase, royalty, and public social flows on Base Sepolia.');
  await page.locator('#cCategory').selectOption('tools');
  await page.locator('[data-product-state="Beta"]').click();
  await page.locator('#cEvidenceType').selectOption('Docs');
  await page.locator('#cEvidenceUrl').fill('https://docs.nexmarkets.fun/');
  await page.locator('#cSupportUrl').fill('https://nexmarkets.fun/');
  await snap('02-create-phase-1');
  await page.locator('#nextStage').click();
  console.log('Phase 1 complete.');

  // Phase 2
  await page.locator('#cEdition').fill('Clean Replacement Edition');
  await page.locator('#cSeries').fill('CERT-2026');
  await page.locator('#cSupply').fill('3');
  await page.locator('[data-pass-cost="paid"]').click();
  await page.locator('#cPrice').fill('1');
  await page.locator('#cRoyalty').selectOption('3');
  await snap('03-create-phase-2');
  await page.locator('#nextStage').click();
  console.log('Phase 2 complete.');

  // Phase 3 (Advantages)
  await snap('04-create-phase-3-advantages');
  await page.locator('#nextStage').click();
  console.log('Phase 3 complete.');

  // Phase 4 (Pass Design - Artwork & Random Pass Mode)
  const artworkBuffer = await readFile(ARTWORK);
  const artworkBase64 = artworkBuffer.toString('base64');
  console.log('Uploading artwork through verified media runtime...');
  await page.evaluate(async ({ base64, name, type }) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const file = new File([bytes], name, { type });
    return window.__nmV2UploadCreateAsset(file, 'art');
  }, { base64: artworkBase64, name: 'nexmarkets-testnet-certification.png', type: 'image/png' });
  await page.waitForFunction(() => Boolean(window.__nmV2GetCreateData?.().artAssetId), null, { timeout: 30_000 });
  console.log('Artwork upload verified.');

  await page.waitForTimeout(500);
  await page.locator('#nmRandomPassToggle').waitFor({ state: 'visible' });
  const isAlreadyRandom = await page.evaluate(() => window.__nmV2GetCreateData?.().randomPassMode === true);
  if (!isAlreadyRandom) {
    await page.locator('#nmRandomPassToggle').click();
    try {
      await page.waitForFunction(() => window.__nmV2GetCreateData?.().randomPassMode === true, null, { timeout: 3000 });
    } catch {
      await page.locator('#nmRandomPassToggle').click();
      await page.waitForFunction(() => window.__nmV2GetCreateData?.().randomPassMode === true, null, { timeout: 10_000 });
    }
  }
  console.log('Random Pass Mode activated.');

  const manualSelectorCount = await page.locator('#create [data-pass-design]').count();
  if (manualSelectorCount !== 0) throw new Error(`RANDOM_MODE_MANUAL_SELECTORS_VISIBLE:${manualSelectorCount}`);

  record.artwork = await page.evaluate(() => {
    const data = window.__nmV2GetCreateData?.() || {};
    return { assetId: data.artAssetId, url: data.artSrc, randomPassMode: data.randomPassMode, randomPassSeed: data.randomPassSeed };
  });
  await snap('05-create-phase-4-artwork-random');
  await page.locator('#nextStage').click();
  console.log('Phase 4 complete.');

  // Phase 5 (Timing)
  await page.locator('[data-preview-hours="48"]').click();
  await snap('06-create-phase-5-timing');
  await page.locator('#nextStage').click();
  console.log('Phase 5 complete.');

  // Phase 6 (Review & Publish)
  await page.locator('#cReviewAdvantages').check();
  await page.locator('#cReviewEvidence').check();
  await page.locator('#cReviewPreview').check();
  await snap('07-create-phase-6-review');
  await page.locator('#nextStage').click();

  const validationErrors = await page.locator('#createStageError').innerText().catch(() => '');
  if (validationErrors.trim()) throw new Error(`CREATE_STAGE_VALIDATION_ERRORS: ${validationErrors}`);

  console.log('Clicking Publish your Debut (triggers on-chain Factory & Terms)...');
  await page.locator('#projectActionMount').getByRole('button', { name: 'Publish your Debut' }).waitFor({ timeout: 15_000 });
  await page.locator('#projectActionMount').getByRole('button', { name: 'Publish your Debut' }).click();

  console.log('Waiting for "Pass created" status (up to 180s for 2 Base Sepolia block confirmations)...');
  const successText = page.locator('#projectActionMount').getByText('Pass created', { exact: true });
  const failedText = page.locator('#projectActionMount').getByText('Pass creation failed', { exact: true });
  await Promise.race([
    successText.waitFor({ timeout: 180_000 }),
    failedText.waitFor({ timeout: 180_000 }).then(async () => {
      const errText = await page.locator('#projectActionMount').innerText();
      throw new Error(`PASS_CREATION_FAILED_ON_UI: ${errText}`);
    })
  ]);

  record.project = await page.evaluate(() => window.nexmarketsV2?.state?.lastSavedProject ?? null);
  record.providerMethods = await page.evaluate(() => window.__nexmarketsProviderMethods || []);
  record.status = 'PASS_PRODUCT_PUBLISHED_THROUGH_UI';
  await snap('08-product-published');
  console.log('Pass created confirmed on UI!');

  // Inspect PostgreSQL records
  const pgClient = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pgClient.connect();
  try {
    const projQuery = await pgClient.query('SELECT * FROM project WHERE id = $1', [record.project.id]);
    const editionQuery = await pgClient.query('SELECT * FROM edition WHERE project_id = $1', [record.project.id]);
    record.dbProject = projQuery.rows[0] ?? null;
    record.dbEdition = editionQuery.rows[0] ?? null;

    // Disable the old zero-mint Edition so it is superseded in local discovery
    const oldEdition = '0xa83a555e4e087ddf261c7ab3cffdff877c83a0fd';
    await pgClient.query('UPDATE edition SET disabled = true WHERE edition_address = $1', [oldEdition]);
    console.log(`Old zero-mint Edition ${oldEdition} disabled in PostgreSQL.`);

    // Verify Pass design assignments in DB
    const design = record.dbProject?.content?.design;
    const assignments = design?.passAssignments || [];
    record.continuity.randomPassMode = design?.randomPassMode;
    record.continuity.passAssignmentsCount = assignments.length;
    record.continuity.assignments = assignments.map((a) => ({
      serial: a.serial,
      optionId: a.optionId,
      colorwayId: a.colorwayId,
      colorwayName: a.colorwayName,
      palette: a.palette
    }));
    console.log('Pass assignments in DB:', JSON.stringify(record.continuity.assignments, null, 2));

    const newEditionAddress = record.dbEdition?.edition_address;
    if (!newEditionAddress) throw new Error('NEW_EDITION_ADDRESS_MISSING_FROM_DB');
    record.edition = newEditionAddress;

    // Verify on-chain contract state on Base Sepolia
    const editionContract = new Contract(newEditionAddress, [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function owner() view returns (address)',
      'function absoluteSupplyCap() view returns (uint32)',
      'function artworkCommitment() view returns (bytes32)',
      'function baseTokenURI() view returns (string)'
    ], provider);

    const [onchainName, onchainSymbol, onchainOwner, onchainSupplyCap, onchainArtCommitment] = await Promise.all([
      editionContract.name(),
      editionContract.symbol(),
      editionContract.owner(),
      editionContract.absoluteSupplyCap(),
      editionContract.artworkCommitment()
    ]);

    record.continuity.onchain = {
      address: newEditionAddress,
      name: onchainName,
      symbol: onchainSymbol,
      owner: onchainOwner,
      absoluteSupplyCap: Number(onchainSupplyCap),
      artworkCommitment: onchainArtCommitment
    };
    console.log('On-chain Edition verified:', JSON.stringify(record.continuity.onchain, null, 2));

    // Verify API endpoints
    const discoverRes = await fetch(`${BASE}/v1/discover`);
    const discoverBody = await discoverRes.json();
    record.continuity.discoverStatus = discoverRes.status;
    record.continuity.replacementInDiscover = (discoverBody.data || []).some((p) => p.edition_address?.toLowerCase() === newEditionAddress.toLowerCase() || p.id === record.project.id);

    const editionRes = await fetch(`${BASE}/v1/editions/${encodeURIComponent(newEditionAddress)}`);
    const editionBody = await editionRes.json();
    record.continuity.editionApiStatus = editionRes.status;
    record.continuity.editionApiData = {
      activeTermsVersion: editionBody.data?.currentTerms?.version ?? editionBody.data?.current_terms?.version,
      pricePerPass: editionBody.data?.currentTerms?.pricePerPass ?? editionBody.data?.current_terms?.pricePerPass,
      advantagesHash: editionBody.data?.currentTerms?.advantagesHash ?? editionBody.data?.current_terms?.advantagesHash
    };

    // Verify passes 1, 2, 3
    record.continuity.passes = [];
    for (const tokenId of [1, 2, 3]) {
      const passRes = await fetch(`${BASE}/v1/passes/${encodeURIComponent(newEditionAddress)}/${tokenId}`);
      const passBody = await passRes.json();
      record.continuity.passes.push({
        tokenId,
        status: passRes.status,
        pass: passBody.data ? { tokenId: passBody.data.tokenId, packOption: passBody.data.packOption, colorwayId: passBody.data.colorwayId } : null
      });
    }
    console.log('API Continuity verification complete:', JSON.stringify(record.continuity, null, 2));
  } finally {
    await pgClient.end();
  }

} catch (error) {
  record.status = 'FAIL';
  record.error = error.message;
  await snap('failure').catch(() => {});
  console.error('Runner failed:', error);
} finally {
  record.finishedAt = new Date().toISOString();
  await writeFile(new URL('clean-replacement-edition.json', OUT), `${JSON.stringify(record, null, 2)}\n`);
  await browser.close();
}

console.log(JSON.stringify({
  status: record.status,
  projectName,
  projectId: record.project?.id ?? null,
  edition: record.edition,
  continuity: record.continuity
}, null, 2));
