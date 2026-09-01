import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';
import { PostgresStore } from '../packages/data/src/postgres-store.mjs';
import {
  validateAndNormalizeProjectPayload,
  normalizeLaunchDraft,
  ALLOWED_CATEGORIES,
  ALLOWED_PRODUCT_STATES,
  ALLOWED_ADVANTAGE_MECHANISMS,
  ALLOWED_REFERRAL_RATES,
  serialArtworkCommitment
} from '../packages/domain/src/index.mjs';

async function running(options = {}) {
  const store = options.store || new MemoryStore();
  const server = createApiServer({
    store,
    allowedOrigin: 'https://nexmarkets.fun',
    secureCookies: false,
    ...options
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { store, server, base: `http://127.0.0.1:${server.address().port}` };
}

async function authenticate(base, wallet) {
  const challengeResponse = await fetch(`${base}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' },
    body: JSON.stringify({ address: wallet.address })
  });
  assert.equal(challengeResponse.status, 201);
  const challenge = await challengeResponse.json();
  const signature = await wallet.signMessage(challenge.message);
  const verifyResponse = await fetch(`${base}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' },
    body: JSON.stringify({ nonce: challenge.nonce, signature })
  });
  assert.equal(verifyResponse.status, 200);
  const verified = await verifyResponse.json();
  return {
    challenge,
    signature,
    verified,
    cookie: verifyResponse.headers.get('set-cookie').split(';')[0],
    csrf: verified.csrfToken
  };
}

function fullDraftFixture(overrides = {}) {
  const now = Date.now();
  const slug = `debut-test-${now}`;
  return {
    slug,
    name: 'Debut Test Project',
    summary: 'A complete innovative test suite debut on Robinhood Chain.',
    launchDraft: {
      id: `launch-${slug}`,
      draftId: `draft-${now}`,
      network: 'robinhood',
      project: {
        name: 'Debut Test Project',
        builder: 'Alice Nex',
        builderHandle: '@alicenex',
        desc: 'A complete innovative test suite debut on Robinhood Chain.',
        about: 'Debut Test Project delivers guaranteed utility, versioned terms and transparent advantages on Robinhood Chain. Designed for long-term holders.',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        category: 'tools',
        productState: 'Live',
        evidence: {
          type: 'Product',
          url: 'https://debut.example/product',
          label: 'View product'
        },
        supportUrl: 'https://debut.example/support',
        banner: {
          src: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          palette: ['#5f6f50', '#30483d', '#111512'],
          logoPosition: 'tl'
        },
        network: 'robinhood'
      },
      edition: {
        name: 'GENESIS EDITION',
        series: 'SERIES 01',
        supply: 100,
        price: 25.5,
        royalty: 3.5,
        network: 'robinhood'
      },
      advantages: [
        {
          id: 'adv-1',
          mechanism: 'Connected',
          covered: 'NexApp Pro',
          benefit: 'Unlimited access',
          duration: '12 months',
          summary: 'Unlimited access to NexApp Pro for 12 months'
        },
        {
          id: 'adv-2',
          mechanism: 'Redemption',
          covered: 'Annual Summit',
          benefit: '1 VIP Ticket',
          duration: '1 ticket',
          summary: '1 VIP ticket redemption for annual summit'
        }
      ],
      referral: {
        enabled: true,
        rate: 15,
        settlement: 'Builder Settled'
      },
      economics: {
        maxPrimary: 2550,
        nexMarketsFeeRate: 0.05,
        nexMarketsFee: 127.5,
        afterPlatformFee: 2422.5
      },
      design: {
        passDesign: 'modern',
        themeMode: 'custom',
        color: '#4a2c0a',
        colorStyle: 'gradient',
        gradientA: '#4a2c0a',
        gradientB: '#0a1830',
        gradientDirection: 'diagonal',
        frame: 'titanium',
        frameColor: '#74849d',
        texture: 'grain',
        textureTint: '#9b9b94',
        logoSrc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        artMode: 'single',
        artSrc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        artEdition: [],
        selectedSerialIndex: 0,
        artX: 50,
        artY: 50
      },
      preview: {
        hours: 48,
        opensAt: new Date(now + 48 * 3600 * 1000).toISOString(),
        localOpensAt: '2026-09-03T12:00:00',
        timezone: 'America/New_York',
        termsVersion: 'v1.0'
      },
      review: {
        evidence: true,
        advantages: true,
        preview: true
      },
      status: 'DRAFT',
      ...overrides
    }
  };
}

test('Full API round-trip test proving every Create field is persisted in project content', async (t) => {
  const { server, base } = await running();
  t.after(() => server.close());

  const wallet = Wallet.createRandom();
  const auth = await authenticate(base, wallet);

  const fixture = fullDraftFixture();
  const response = await fetch(`${base}/v1/builder/projects`, {
    method: 'POST',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.csrf,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify(fixture)
  });

  assert.equal(response.status, 201);
  const result = await response.json();
  const project = result.data;

  assert.ok(project.id.startsWith('prj_'));
  assert.equal(project.slug, fixture.slug);
  assert.equal(project.name, 'Debut Test Project');
  assert.equal(project.status, 'DRAFT');

  const content = project.content;
  assert.ok(content, 'Project content must be persisted');

  // Verify Project fields
  assert.equal(content.project.name, 'Debut Test Project');
  assert.equal(content.project.builder, 'Alice Nex');
  assert.equal(content.project.builderHandle, '@alicenex');
  assert.equal(content.project.category, 'tools');
  assert.equal(content.project.productState, 'Live');
  assert.equal(content.project.evidence.url, 'https://debut.example/product');
  assert.equal(content.project.evidence.type, 'Product');
  assert.equal(content.project.supportUrl, 'https://debut.example/support');
  assert.equal(content.project.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.deepEqual(content.project.banner.palette, ['#5f6f50', '#30483d', '#111512']);
  assert.equal(content.project.banner.logoPosition, 'tl');
  assert.equal(content.project.network, 'robinhood');

  // Verify Edition fields
  assert.equal(content.edition.name, 'GENESIS EDITION');
  assert.equal(content.edition.series, 'SERIES 01');
  assert.equal(content.edition.supply, 100);
  assert.equal(content.edition.price, 25.5);
  assert.equal(content.edition.royalty, 3.5);
  assert.equal(content.edition.network, 'robinhood');

  // Verify Advantages fields
  assert.equal(content.advantages.length, 2);
  assert.equal(content.advantages[0].mechanism, 'Connected');
  assert.equal(content.advantages[0].covered, 'NexApp Pro');
  assert.equal(content.advantages[0].benefit, 'Unlimited access');
  assert.equal(content.advantages[0].duration, '12 months');
  assert.equal(content.advantages[1].mechanism, 'Redemption');
  assert.equal(content.advantages[1].benefit, '1 VIP Ticket');

  // Verify Referral settings
  assert.equal(content.referral.enabled, true);
  assert.equal(content.referral.rate, 15);
  assert.equal(content.referral.settlement, 'Builder Settled');

  // Verify Economics
  assert.equal(content.economics.maxPrimary, 2550);
  assert.equal(content.economics.nexMarketsFeeRate, 0.05);
  assert.equal(content.economics.nexMarketsFee, 127.5);
  assert.equal(content.economics.afterPlatformFee, 2422.5);

  // Verify Design atelier settings
  assert.equal(content.design.passDesign, 'modern');
  assert.equal(content.design.themeMode, 'custom');
  assert.equal(content.design.color, '#4a2c0a');
  assert.equal(content.design.colorStyle, 'gradient');
  assert.equal(content.design.gradientA, '#4a2c0a');
  assert.equal(content.design.gradientB, '#0a1830');
  assert.equal(content.design.gradientDirection, 'diagonal');
  assert.equal(content.design.frame, 'titanium');
  assert.equal(content.design.frameColor, '#74849d');
  assert.equal(content.design.texture, 'grain');
  assert.equal(content.design.artMode, 'single');

  // Verify Preview settings
  assert.equal(content.preview.hours, 48);
  assert.equal(content.preview.timezone, 'America/New_York');
  assert.equal(content.preview.termsVersion, 'v1.0');
  assert.ok(content.preview.opensAt);

  // Verify Review confirmations
  assert.equal(content.review.evidence, true);
  assert.equal(content.review.advantages, true);
  assert.equal(content.review.preview, true);

  // Verify draft remains DRAFT on server
  assert.equal(content.status, 'DRAFT');

  // Verify Builder dashboard lists the saved draft
  const dashRes = await fetch(`${base}/v1/builder/dashboard`, {
    headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' }
  });
  assert.equal(dashRes.status, 200);
  const dash = await dashRes.json();
  const listed = dash.data.projects.find((p) => p.slug === fixture.slug);
  assert.ok(listed, 'Project draft must appear in builder dashboard');
  assert.equal(listed.status, 'DRAFT');
});

test('Idempotent repeated draft submission updates existing draft without creating duplicates', async (t) => {
  const { server, base } = await running();
  t.after(() => server.close());

  const wallet = Wallet.createRandom();
  const auth = await authenticate(base, wallet);
  const fixture = fullDraftFixture();

  const firstRes = await fetch(`${base}/v1/builder/projects`, {
    method: 'POST',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.csrf,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify(fixture)
  });
  assert.equal(firstRes.status, 201);
  const first = (await firstRes.json()).data;

  // Submit second time with same draftId and updated about text
  const updatedFixture = {
    ...fixture,
    summary: 'Updated summary text for second click',
    launchDraft: {
      ...fixture.launchDraft,
      project: {
        ...fixture.launchDraft.project,
        about: 'Updated about text submitted during second click to verify idempotency.'
      }
    }
  };

  const secondRes = await fetch(`${base}/v1/builder/projects`, {
    method: 'POST',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.csrf,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify(updatedFixture)
  });
  assert.equal(secondRes.status, 201);
  const second = (await secondRes.json()).data;

  assert.equal(second.id, first.id, 'Idempotent repeated submission must retain project ID');
  assert.equal(second.summary, 'Updated summary text for second click');
  assert.equal(second.content.project.about, 'Updated about text submitted during second click to verify idempotency.');

  // Verify dashboard has only 1 project, not 2
  const dashRes = await fetch(`${base}/v1/builder/dashboard`, {
    headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' }
  });
  const dash = await dashRes.json();
  const matching = dash.data.projects.filter((p) => p.slug === fixture.slug);
  assert.equal(matching.length, 1, 'Idempotent repeated submission must not create duplicate project records');
});

test('Cross-account project isolation: another builder cannot overwrite an existing slug', async (t) => {
  const { server, base } = await running();
  t.after(() => server.close());

  const builder1 = Wallet.createRandom();
  const auth1 = await authenticate(base, builder1);

  const builder2 = Wallet.createRandom();
  const auth2 = await authenticate(base, builder2);

  const sharedSlug = `unique-shared-slug-${Date.now()}`;
  const res1 = await fetch(`${base}/v1/builder/projects`, {
    method: 'POST',
    headers: {
      cookie: auth1.cookie,
      'x-csrf-token': auth1.csrf,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify({ slug: sharedSlug, name: 'Original Builder Project' })
  });
  assert.equal(res1.status, 201);

  // Builder 2 tries to submit with same slug
  const res2 = await fetch(`${base}/v1/builder/projects`, {
    method: 'POST',
    headers: {
      cookie: auth2.cookie,
      'x-csrf-token': auth2.csrf,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify({ slug: sharedSlug, name: 'Attacker Attempt' })
  });
  assert.equal(res2.status, 409);
  const err = await res2.json();
  assert.equal(err.error.code, 'SLUG_ALREADY_TAKEN');
});

test('Server-side Create validation fails closed on invalid inputs', async (t) => {
  const { server, base } = await running();
  t.after(() => server.close());

  const wallet = Wallet.createRandom();
  const auth = await authenticate(base, wallet);
  const send = (body) => fetch(`${base}/v1/builder/projects`, {
    method: 'POST',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.csrf,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify(body)
  });

  // Invalid slug
  assert.equal((await send({ slug: 'INVALID_CAPS!', name: 'Valid Name' })).status, 400);
  assert.equal((await send({ slug: 'ab', name: 'Valid Name' })).status, 400);

  // Invalid supply
  assert.equal((await send({ slug: 'valid-slug-1', name: 'Valid Name', supply: 0 })).status, 400);
  assert.equal((await send({ slug: 'valid-slug-2', name: 'Valid Name', supply: -5 })).status, 400);
  assert.equal((await send({ slug: 'valid-slug-3', name: 'Valid Name', supply: 1.5 })).status, 400);

  // Invalid USDG price precision
  assert.equal((await send({ slug: 'valid-slug-4', name: 'Valid Name', price: -10 })).status, 400);
  assert.equal((await send({ slug: 'valid-slug-5', name: 'Valid Name', price: '10.1234567' })).status, 400);

  // Invalid royalty (> 5% or < 0%)
  const highRoyalty = fullDraftFixture();
  highRoyalty.launchDraft.edition.royalty = 7.5;
  assert.equal((await send(highRoyalty)).status, 400);

  const negRoyalty = fullDraftFixture();
  negRoyalty.launchDraft.edition.royalty = -1;
  assert.equal((await send(negRoyalty)).status, 400);

  // Invalid referral tier (not in 5, 10, 15, 20)
  const badReferral = fullDraftFixture();
  badReferral.launchDraft.referral = { enabled: true, rate: 12 };
  assert.equal((await send(badReferral)).status, 400);

  // Invalid advantage mechanism
  const badAdvMech = fullDraftFixture();
  badAdvMech.launchDraft.advantages[0].mechanism = 'MagicalPerk';
  assert.equal((await send(badAdvMech)).status, 400);

  // Preview hours < 24
  const shortPreview = fullDraftFixture();
  shortPreview.launchDraft.preview.hours = 12;
  assert.equal((await send(shortPreview)).status, 400);

  // Invalid opening time
  const badTime = fullDraftFixture();
  badTime.launchDraft.preview.opensAt = 'NOT_A_VALID_DATE';
  assert.equal((await send(badTime)).status, 400);

  // Invalid category
  const badCategory = fullDraftFixture();
  badCategory.launchDraft.project.category = 'crypto_casino';
  assert.equal((await send(badCategory)).status, 400);

  // Invalid product state
  const badState = fullDraftFixture();
  badState.launchDraft.project.productState = 'vaporware';
  assert.equal((await send(badState)).status, 400);

  // Invalid design enum
  const badDesign = fullDraftFixture();
  badDesign.launchDraft.design.passDesign = 'hologram_laser';
  assert.equal((await send(badDesign)).status, 400);
});

test('Artwork metadata and serial mapping preservation', async (t) => {
  const { server, base } = await running();
  t.after(() => server.close());

  const wallet = Wallet.createRandom();
  const auth = await authenticate(base, wallet);

  const fixture = fullDraftFixture();
  fixture.launchDraft.edition.supply = 3;
  fixture.launchDraft.design.artMode = 'collection';
  const shaA = 'a'.repeat(64);
  const shaB = 'b'.repeat(64);
  const shaC = 'c'.repeat(64);

  fixture.launchDraft.design.artEdition = [
    { serial: 1, filename: 'pass_001.png', title: 'Cyber 01', sha256: shaA, traits: { background: 'Gold' }, assetKey: 'key-1' },
    { serial: 2, filename: 'pass_002.png', title: 'Cyber 02', sha256: shaB, traits: { background: 'Silver' }, assetKey: 'key-2' },
    { serial: 3, filename: 'pass_003.png', title: 'Cyber 03', sha256: shaC, traits: { background: 'Bronze' }, assetKey: 'key-3' }
  ];

  const res = await fetch(`${base}/v1/builder/projects`, {
    method: 'POST',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.csrf,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify(fixture)
  });
  assert.equal(res.status, 201);
  const project = (await res.json()).data;
  const artEdition = project.content.design.artEdition;
  assert.equal(artEdition.length, 3);
  assert.equal(artEdition[0].serial, 1);
  assert.equal(artEdition[0].sha256, shaA);
  assert.equal(artEdition[0].traits.background, 'Gold');
  assert.equal(artEdition[1].serial, 2);
  assert.equal(artEdition[2].serial, 3);

  // Deterministic commitment hash
  const commitment = serialArtworkCommitment([
    { tokenId: 1, sha256: shaA },
    { tokenId: 2, sha256: shaB },
    { tokenId: 3, sha256: shaC }
  ]);
  assert.equal(commitment.length, 64);
});

test('PostgreSQL JSONB persistence and idempotency when DATABASE_URL is available', async () => {
  if (!process.env.DATABASE_URL) {
    // Skip if no real Postgres instance is running locally
    return;
  }
  const store = new PostgresStore();
  await store.ready();
  const accountId = `acct_pgtest_${Date.now()}`;
  const slug = `pg-draft-${Date.now()}`;
  const fixture = fullDraftFixture();
  fixture.slug = slug;
  fixture.name = 'Postgres Draft Test';

  const normalized = validateAndNormalizeProjectPayload(fixture);
  const created = await store.createProject({
    accountId,
    body: {
      slug: normalized.slug,
      name: normalized.name,
      summary: normalized.summary,
      launchDraft: normalized.launchDraft
    }
  });
  assert.ok(created.id);
  assert.equal(created.slug, slug);
  assert.equal(created.status, 'DRAFT');
  assert.equal(created.content.project.name, 'Debut Test Project');

  // Repeated submission
  const second = await store.createProject({
    accountId,
    body: {
      slug: normalized.slug,
      name: 'Postgres Draft Test Updated',
      summary: 'Updated Postgres summary',
      launchDraft: { ...normalized.launchDraft, summary: 'Updated Postgres summary' }
    }
  });
  assert.equal(second.id, created.id, 'Postgres store must update existing draft idempotently');
  await store.close();
});
