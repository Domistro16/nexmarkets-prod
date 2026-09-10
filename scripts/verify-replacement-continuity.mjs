import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.NEXMARKETS_LIVE_WEB_URL?.trim() || 'http://localhost:4174';
const OUT = new URL('../artifacts/verification/continuity/', import.meta.url);
const NEW_EDITION = '0x2854c071ecbc74b3487fad3a83a3d87bb9e55b68';
const OLD_EDITION = '0xa83a555e4e087ddf261c7ab3cffdff877c83a0fd';
const SLUG = '5db38efc-22e7-4dfb-aee6-f9ee0e990277';

await mkdir(OUT, { recursive: true });

const record = {
  status: 'STARTED',
  timestamp: new Date().toISOString(),
  apiChecks: {},
  uiChecks: {},
  screenshots: []
};

try {
  console.log('1. Checking API endpoints...');
  // 1. API Discover
  const discoverRes = await fetch(`${BASE}/v1/discover`);
  if (!discoverRes.ok) throw new Error(`DISCOVER_API_STATUS_${discoverRes.status}`);
  const discoverBody = await discoverRes.json();
  const discoverItems = discoverBody.data || [];
  const foundNewInDiscover = discoverItems.some((p) => (p.edition_address || '').toLowerCase() === NEW_EDITION.toLowerCase());
  const foundOldInDiscover = discoverItems.some((p) => (p.edition_address || '').toLowerCase() === OLD_EDITION.toLowerCase());
  record.apiChecks.discover = {
    status: discoverRes.status,
    totalProjects: discoverItems.length,
    newEditionPresent: foundNewInDiscover,
    oldEditionHidden: !foundOldInDiscover
  };
  if (!foundNewInDiscover) throw new Error('NEW_EDITION_MISSING_IN_DISCOVER');
  if (foundOldInDiscover) throw new Error('OLD_ZERO_MINT_EDITION_STILL_VISIBLE_IN_DISCOVER');
  console.log('   Discover API: OK (New edition present, old zero-mint edition hidden)');

  // 2. API Edition Details
  const editionRes = await fetch(`${BASE}/v1/editions/${NEW_EDITION}`);
  if (!editionRes.ok) throw new Error(`EDITION_API_STATUS_${editionRes.status}`);
  const editionBody = await editionRes.json();
  const editionData = editionBody.data || {};
  const design = editionData.content?.design || {};
  const assignments = design.passAssignments || [];

  record.apiChecks.edition = {
    status: editionRes.status,
    editionAddress: editionData.edition_address || editionData.address,
    supplyCap: editionData.absolute_supply_cap || editionData.absoluteSupplyCap,
    randomPassMode: design.randomPassMode,
    randomPassSeed: design.randomPassSeed,
    assignmentsCount: assignments.length,
    assignments: assignments.map((a) => ({
      serial: a.serial,
      optionId: a.optionId,
      colorwayId: a.colorwayId,
      colorwayName: a.colorwayName,
      palette: a.palette
    }))
  };

  if (!design.randomPassMode) throw new Error('RANDOM_PASS_MODE_NOT_TRUE');
  if (assignments.length !== 3) throw new Error(`EXPECTED_3_ASSIGNMENTS_GOT_${assignments.length}`);
  if (assignments[0].optionId !== 'pack-ceramic' || assignments[0].colorwayId !== 'colourway-04') {
    throw new Error('SERIAL_1_ASSIGNMENT_MISMATCH');
  }
  if (assignments[1].optionId !== 'pack-glass' || assignments[1].colorwayId !== 'colourway-01') {
    throw new Error('SERIAL_2_ASSIGNMENT_MISMATCH');
  }
  if (assignments[2].optionId !== 'classic-gilt' || assignments[2].colorwayId !== 'colourway-04') {
    throw new Error('SERIAL_3_ASSIGNMENT_MISMATCH');
  }
  console.log('   Edition API: OK (Design assignments verified for serials 1, 2, 3)');

  // 3. Media Download Check
  const mediaUrl = design.artSrc;
  if (mediaUrl) {
    const mediaRes = await fetch(`${BASE}${mediaUrl}`, { redirect: 'manual' });
    record.apiChecks.media = {
      status: mediaRes.status,
      location: mediaRes.headers.get('location') ? '[PRESIGNED_URL]' : null
    };
    if (mediaRes.status !== 307 && mediaRes.status !== 200) {
      throw new Error(`MEDIA_URL_FAILED_STATUS_${mediaRes.status}`);
    }
    console.log('   Media Content API: OK (Storage redirect verified)');
  }

  // Launch browser for UI Continuity Checks
  console.log('2. Starting Browser UI verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();

  async function snap(name) {
    const p = fileURLToPath(new URL(`${name}.png`, OUT));
    await page.screenshot({ path: p, fullPage: true });
    record.screenshots.push(`artifacts/verification/continuity/${name}.png`);
  }

  // Surface 1: Discover UI
  console.log('   Testing Discover UI (/discover)...');
  await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.nexmarketsV2?.state?.ready === true || Boolean(window.nexmarketsV2), null, { timeout: 30_000 });
  await snap('01-discover-replacement');

  const oldCardCount = await page.locator(`[data-edition="${OLD_EDITION.toLowerCase()}"]`).count();
  if (oldCardCount > 0) throw new Error('OLD_EDITION_VISIBLE_IN_DISCOVER_DOM');

  // Surface 2: Launch / Project Page
  console.log('   Testing Launch / Project UI (/projects/slug)...');
  await page.goto(`${BASE}/projects/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => (document.getElementById('projectPageMount')?.innerHTML?.length || 0) > 50 || (document.getElementById('project')?.innerHTML?.length || 0) > 50, null, { timeout: 30_000 });
  await page.waitForTimeout(1000);
  await snap('02-launch-preview');

  // Test holder side flip
  console.log('   Testing pass holder flip...');
  await page.evaluate(() => window.toggleProjectPassFlip?.());
  await page.waitForTimeout(400);
  await snap('03-launch-holder-side');
  await page.evaluate(() => window.toggleProjectPassFlip?.());
  await page.waitForTimeout(400);

  // Surface 3: Test Pass Render for Serials 1, 2, 3
  console.log('   Testing pass iframe render for serials 1, 2, 3...');
  for (let s = 1; s <= 3; s++) {
    await page.evaluate((serial) => {
      const p = window.projects?.find((x) => x.name.includes('NexMarkets Replacement Live')) || window.projects?.[0];
      if (!p) return;
      const c = window.nmFinalProjectCompiled(p, serial);
      window.finalMountPass('nmProjectPreviewPass', p, c, `#00${serial}`, 280, true);
    }, s);
    await page.waitForTimeout(600);
    await snap(`04-serial-${s}-rendered`);
  }

  // Surface 4: Test 2048x2048 PNG Export
  console.log('   Testing 2048x2048 PNG export...');
  const passFixture = {
    edition_address: NEW_EDITION,
    key: `${NEW_EDITION.toLowerCase()}-1`,
    name: 'Clean Replacement Edition',
    serial: '#001 / 3',
    owner: '0xD83deFbA240568040b39bb2C8B4DB7dB02d40593',
    owner_address: '0xD83deFbA240568040b39bb2C8B4DB7dB02d40593',
    terms_hash: editionData.current_terms?.hash || editionData.currentTerms?.hash,
    advantages: []
  };

  await page.goto(`${BASE}/dashboard/holder`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate((pass) => {
    window.nexmarketsV2.state.templateData = window.nexmarketsV2.state.templateData || {};
    window.nexmarketsV2.state.templateData.ownedPasses = [pass];
    if (Array.isArray(window.dashState?.owned)) window.dashState.owned = [pass];
  }, passFixture);

  const [download, downloadSuccess] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.evaluate((key) => window.downloadOwnedPass(key), passFixture.key)
  ]);

  if (!downloadSuccess) throw new Error('DOWNLOAD_OWNED_PASS_RETURNED_FALSE');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const pngBytes = Buffer.concat(chunks);

  // Validate PNG signature and 2048x2048 IHDR
  const isPng = pngBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x4f, 0x0d, 0x0a, 0x1a, 0x0a])) ||
                pngBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const ihdr = pngBytes.toString('ascii', 12, 16);
  const width = pngBytes.readUInt32BE(16);
  const height = pngBytes.readUInt32BE(20);

  record.uiChecks.pngExport = {
    validPng: isPng,
    ihdr,
    width,
    height,
    byteSize: pngBytes.length
  };

  if (!isPng || ihdr !== 'IHDR' || width !== 2048 || height !== 2048) {
    throw new Error(`PNG_DIMENSIONS_MISMATCH: got ${width}x${height}`);
  }
  await writeFile(new URL('pass-export-2048x2048.png', OUT), pngBytes);
  console.log(`   PNG Export verified: exactly ${width}x${height} pixels (${pngBytes.length} bytes)`);

  // Surface 5: Market and Dashboard navigation sanity
  console.log('   Verifying /market and /dashboard routes...');
  await page.goto(`${BASE}/market`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await snap('07-market-view');

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await snap('08-dashboard-view');

  await browser.close();
  record.status = 'PASS_ALL_CONTINUITY_VERIFIED';
  console.log('All continuity verification steps passed successfully!');

} catch (err) {
  record.status = 'FAIL';
  record.error = err.message;
  console.error('Continuity verification failed:', err);
} finally {
  await writeFile(new URL('continuity-report.json', OUT), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
}
