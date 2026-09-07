import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

async function running(options = {}) {
  const store = new MemoryStore();
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
    cookie: verifyResponse.headers.get('set-cookie').split(';')[0]
  };
}

test('Platform stats and authoritative framing copy', async (t) => {
  const { server, base, store } = await running();
  t.after(() => server.close());

  store.passes.push(
    { editionAddress: '0x1111111111111111111111111111111111111111', tokenId: '1', ownerAddress: '0xaaaa' },
    { editionAddress: '0x1111111111111111111111111111111111111111', tokenId: '2', ownerAddress: '0xbbbb' }
  );
  store.listingRows.push({ status: 'FILLED', price_usdg: '100' });

  const res = await fetch(`${base}/v1/stats`, { headers: { origin: 'https://nexmarkets.fun' } });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.passesIssued, 2);
  assert.equal(data.activeHolders, 2);
  assert.equal(data.totalVolumeUsdg, '100');
  assert.equal(data.heroCopy, "Get there early. Own your place in what's next.");
  assert.equal(data.tagline, "A Pass is your position in a builder's story.");
  assert.equal(data.howItWorks.length, 3);
  assert.equal(data.howItWorks[0].text, "Find it early on Discover.");
  assert.equal(data.howItWorks[1].text, "Mint your numbered Pass.");
  assert.equal(data.howItWorks[2].text, "Use your Advantage, keep it, or sell it when the Market opens.");
  assert.match(data.royaltyFraming, /Builder royalties are earned, not assumed/);
  assert.match(data.passVaultFraming, /Every Pass has a Vault/);
});

test('Pass Vault reframing on individual and owned passes', async (t) => {
  const { server, base, store } = await running();
  t.after(() => server.close());

  const wallet = Wallet.createRandom();
  const auth = await authenticate(base, wallet);

  store.passes.push({
    editionAddress: '0x2222222222222222222222222222222222222222',
    tokenId: '1',
    ownerAddress: wallet.address.toLowerCase(),
    tokenBoundAccount: '0x3333333333333333333333333333333333333333'
  });

  // Individual pass endpoint
  const passRes = await fetch(`${base}/v1/passes/0x2222222222222222222222222222222222222222/1`, {
    headers: { origin: 'https://nexmarkets.fun' }
  });
  assert.equal(passRes.status, 200);
  const passBody = await passRes.json();
  assert.ok(passBody.data.passVault);
  assert.equal(passBody.data.passVault.name, 'Pass Vault');
  assert.equal(passBody.data.passVault.compatible, true);
  assert.equal(passBody.data.passVault.standard, 'ERC-6551');
  assert.equal(passBody.data.passVault.address, '0x3333333333333333333333333333333333333333');
  assert.match(passBody.data.passVault.framing, /Every Pass is ERC-6551 compatible/);
  assert.match(passBody.data.passVault.description, /Every Pass has a Vault/);
  assert.match(passBody.data.passVault.regulatoryBoundary, /Completely permissionless\. Zero regulatory exposure/);

  // Owned passes endpoint
  const meRes = await fetch(`${base}/v1/me/passes`, {
    headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' }
  });
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json();
  assert.equal(meBody.data.length, 1);
  assert.ok(meBody.data[0].passVault);
  assert.equal(meBody.data[0].passVault.name, 'Pass Vault');
  assert.equal(meBody.data[0].passVault.address, '0x3333333333333333333333333333333333333333');
});

test('Builder profile management and public lookup', async (t) => {
  const { server, base } = await running();
  t.after(() => server.close());

  const builderWallet = Wallet.createRandom();
  const auth = await authenticate(base, builderWallet);

  // Update profile
  const updateRes = await fetch(`${base}/v1/builder/profile`, {
    method: 'PUT',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.verified.csrfToken,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify({
      displayName: 'Alice the Builder',
      bio: 'Building decentralized primitives',
      about: 'A long story about our journey building protocols.',
      category: 'defi',
      links: { website: 'https://alice.test', twitter: 'https://x.com/alice' }
    })
  });
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json();
  assert.equal(updated.data.display_name, 'Alice the Builder');
  assert.equal(updated.data.bio, 'Building decentralized primitives');
  assert.equal(updated.data.category, 'defi');

  // Public lookup
  const getRes = await fetch(`${base}/v1/builders/${auth.verified.accountId}`, {
    headers: { origin: 'https://nexmarkets.fun' }
  });
  assert.equal(getRes.status, 200);
  const fetched = await getRes.json();
  assert.equal(fetched.data.display_name, 'Alice the Builder');
  assert.equal(fetched.data.links.twitter, 'https://x.com/alice');

  // Not found
  const notFound = await fetch(`${base}/v1/builders/non-existent-id`, {
    headers: { origin: 'https://nexmarkets.fun' }
  });
  assert.equal(notFound.status, 404);
});

test('Builder following mechanics: follow, status, unfollow, self-follow rejection', async (t) => {
  const { server, base } = await running();
  t.after(() => server.close());

  const builderWallet = Wallet.createRandom();
  const builderAuth = await authenticate(base, builderWallet);

  const fanWallet = Wallet.createRandom();
  const fanAuth = await authenticate(base, fanWallet);

  // Self follow should fail
  const selfFollow = await fetch(`${base}/v1/builders/${builderAuth.verified.accountId}/follow`, {
    method: 'POST',
    headers: {
      cookie: builderAuth.cookie,
      'x-csrf-token': builderAuth.verified.csrfToken,
      origin: 'https://nexmarkets.fun'
    }
  });
  assert.equal(selfFollow.status, 400);

  // Check initial follow status
  const initialStatus = await fetch(`${base}/v1/builders/${builderAuth.verified.accountId}/follow-status`, {
    headers: { cookie: fanAuth.cookie, origin: 'https://nexmarkets.fun' }
  });
  assert.equal(initialStatus.status, 200);
  const status1 = await initialStatus.json();
  assert.equal(status1.data.isFollowing, false);
  assert.equal(status1.data.followerCount, 0);

  // Follow builder
  const followRes = await fetch(`${base}/v1/builders/${builderAuth.verified.accountId}/follow`, {
    method: 'POST',
    headers: {
      cookie: fanAuth.cookie,
      'x-csrf-token': fanAuth.verified.csrfToken,
      origin: 'https://nexmarkets.fun'
    }
  });
  assert.equal(followRes.status, 200);
  const followData = await followRes.json();
  assert.equal(followData.data.followed, true);
  assert.equal(followData.data.followerCount, 1);

  // Follow status after follow
  const statusAfter = await fetch(`${base}/v1/builders/${builderAuth.verified.accountId}/follow-status`, {
    headers: { cookie: fanAuth.cookie, origin: 'https://nexmarkets.fun' }
  });
  const status2 = await statusAfter.json();
  assert.equal(status2.data.isFollowing, true);
  assert.equal(status2.data.followerCount, 1);

  // Check followed builders list
  const followingRes = await fetch(`${base}/v1/me/following`, {
    headers: { cookie: fanAuth.cookie, origin: 'https://nexmarkets.fun' }
  });
  assert.equal(followingRes.status, 200);
  const followingList = await followingRes.json();
  assert.equal(followingList.data.length, 1);
  assert.equal(followingList.data[0].builderAccountId, builderAuth.verified.accountId);

  // Unfollow builder
  const unfollowRes = await fetch(`${base}/v1/builders/${builderAuth.verified.accountId}/follow`, {
    method: 'DELETE',
    headers: {
      cookie: fanAuth.cookie,
      'x-csrf-token': fanAuth.verified.csrfToken,
      origin: 'https://nexmarkets.fun'
    }
  });
  assert.equal(unfollowRes.status, 200);
  const unfollowData = await unfollowRes.json();
  assert.equal(unfollowData.data.unfollowed, true);
  assert.equal(unfollowData.data.followerCount, 0);
});

test('Project watchlist add, retrieve, and remove', async (t) => {
  const { server, base, store } = await running();
  t.after(() => server.close());

  const wallet = Wallet.createRandom();
  const auth = await authenticate(base, wallet);

  store.projects.push({
    id: 'prj_test_1',
    slug: 'hyper-drive',
    name: 'HyperDrive',
    summary: 'High-speed layer',
    status: 'PUBLISHED'
  });

  // Watch project
  const watchRes = await fetch(`${base}/v1/projects/hyper-drive/watch`, {
    method: 'POST',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.verified.csrfToken,
      origin: 'https://nexmarkets.fun'
    }
  });
  assert.equal(watchRes.status, 200);
  const watchData = await watchRes.json();
  assert.equal(watchData.data.watching, true);
  assert.equal(watchData.data.watcherCount, 1);

  // Get watchlist
  const watchlistRes = await fetch(`${base}/v1/me/watchlist`, {
    headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' }
  });
  assert.equal(watchlistRes.status, 200);
  const watchlist = await watchlistRes.json();
  assert.equal(watchlist.data.length, 1);
  assert.equal(watchlist.data[0].slug, 'hyper-drive');
  assert.equal(watchlist.data[0].watcherCount, 1);

  // Unwatch project
  const unwatchRes = await fetch(`${base}/v1/projects/hyper-drive/watch`, {
    method: 'DELETE',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.verified.csrfToken,
      origin: 'https://nexmarkets.fun'
    }
  });
  assert.equal(unwatchRes.status, 200);
  const unwatchData = await unwatchRes.json();
  assert.equal(unwatchData.data.unwatched, true);
  assert.equal(unwatchData.data.watcherCount, 0);
});

test('Builder milestones, weekly cadence limit, and social feed', async (t) => {
  const { server, base } = await running();
  t.after(() => server.close());

  const builderWallet = Wallet.createRandom();
  const builderAuth = await authenticate(base, builderWallet);

  const followerWallet = Wallet.createRandom();
  const followerAuth = await authenticate(base, followerWallet);

  // Follow the builder
  await fetch(`${base}/v1/builders/${builderAuth.verified.accountId}/follow`, {
    method: 'POST',
    headers: {
      cookie: followerAuth.cookie,
      'x-csrf-token': followerAuth.verified.csrfToken,
      origin: 'https://nexmarkets.fun'
    }
  });

  // Empty title rejected
  const emptyTitle = await fetch(`${base}/v1/builder/milestones`, {
    method: 'POST',
    headers: {
      cookie: builderAuth.cookie,
      'x-csrf-token': builderAuth.verified.csrfToken,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify({ title: '   ', content: 'Milestone content' })
  });
  assert.equal(emptyTitle.status, 400);

  // Create valid milestone
  const createRes = await fetch(`${base}/v1/builder/milestones`, {
    method: 'POST',
    headers: {
      cookie: builderAuth.cookie,
      'x-csrf-token': builderAuth.verified.csrfToken,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify({
      title: 'Mainnet Alpha Released',
      content: 'We shipped the contracts and verified on block explorer.',
      links: [{ label: 'GitHub Commit', url: 'https://github.com/example/commit/123' }]
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.data.title, 'Mainnet Alpha Released');

  // Second milestone in same week should be rate limited (429)
  const duplicateRes = await fetch(`${base}/v1/builder/milestones`, {
    method: 'POST',
    headers: {
      cookie: builderAuth.cookie,
      'x-csrf-token': builderAuth.verified.csrfToken,
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify({
      title: 'Another update too soon',
      content: 'Should be rejected'
    })
  });
  assert.equal(duplicateRes.status, 429);

  // Fetch builder's milestones publicly
  const milestonesRes = await fetch(`${base}/v1/builders/${builderAuth.verified.accountId}/milestones`, {
    headers: { origin: 'https://nexmarkets.fun' }
  });
  assert.equal(milestonesRes.status, 200);
  const milestones = await milestonesRes.json();
  assert.equal(milestones.data.length, 1);
  assert.equal(milestones.data[0].title, 'Mainnet Alpha Released');

  // Follower's feed should include the milestone
  const feedRes = await fetch(`${base}/v1/feed`, {
    headers: { cookie: followerAuth.cookie, origin: 'https://nexmarkets.fun' }
  });
  assert.equal(feedRes.status, 200);
  const feed = await feedRes.json();
  assert.equal(feed.data.length, 1);
  assert.equal(feed.data[0].title, 'Mainnet Alpha Released');
});

test('Holder list with serial number formatting and held duration', async (t) => {
  const { server, base, store } = await running();
  t.after(() => server.close());

  const editionAddress = '0x4444444444444444444444444444444444444444';
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  store.passes.push(
    { editionAddress, tokenId: '1', ownerAddress: '0xaaaa', updatedAt: sixMonthsAgo },
    { editionAddress, tokenId: '42', ownerAddress: '0xbbbb' }
  );

  const res = await fetch(`${base}/v1/editions/${editionAddress}/holders`, {
    headers: { origin: 'https://nexmarkets.fun' }
  });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.length, 2);
  assert.equal(data[0].serialNumber, '#001');
  assert.equal(data[0].heldDuration, '6 mos');
  assert.equal(data[1].serialNumber, '#042');
  assert.equal(data[1].heldDuration, 'Just now');
});

test('Discover page returns statusTag, direct links row, and watchlistCount', async (t) => {
  const { server, base, store } = await running();
  t.after(() => server.close());

  store.projects.push({
    id: 'prj_live',
    slug: 'live-debut-project',
    name: 'Live Debut',
    status: 'PUBLISHED',
    mintStartsAt: new Date(Date.now() - 3600_000).toISOString(),
    mintEndsAt: new Date(Date.now() + 86400_000 * 5).toISOString(),
    content: {
      links: {
        demo: 'https://demo.example.com',
        product: 'https://app.example.com',
        docs: 'https://docs.example.com',
        portfolio: 'https://portfolio.example.com'
      }
    }
  });
  store.projectWatchlist.push(
    { id: 'pwl_1', account_id: 'acc_1', project_id: 'prj_live', created_at: new Date().toISOString() },
    { id: 'pwl_2', account_id: 'acc_2', project_id: 'prj_live', created_at: new Date().toISOString() }
  );

  const res = await fetch(`${base}/v1/discover`, { headers: { origin: 'https://nexmarkets.fun' } });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.length, 1);
  assert.equal(data[0].statusTag, 'LIVE_DEBUT');
  assert.equal(data[0].watcherCount, 2);
  assert.equal(data[0].links.demo, 'https://demo.example.com');
  assert.equal(data[0].links.docs, 'https://docs.example.com');
});

test('Featured builder strip returns 4 cards with price, serial progress, and advantage summary', async (t) => {
  const { server, base, store } = await running();
  t.after(() => server.close());

  store.projects.push({ id: 'prj_f1', builderAccountId: 'acc_b1', slug: 'builder-one-project' });
  store.editions.push({ projectId: 'prj_f1', absoluteSupplyCap: 555, priceUsdg: '50', advantageSummary: 'Lifetime Beta Access' });
  store.passes.push(
    { editionAddress: '0x1111', ownerAddress: '0xaa' },
    { editionAddress: '0x1111', ownerAddress: '0xbb' }
  );
  store.builderProfiles.set('acc_b1', {
    id: 'bprf_1',
    account_id: 'acc_b1',
    display_name: 'Satoshi Builder',
    avatar_url: 'https://avatar.example.com/satoshi.png',
    bio: 'Building peer-to-peer cash protocols',
    featured: true,
    created_at: new Date().toISOString()
  });

  const res = await fetch(`${base}/v1/builders/featured`, { headers: { origin: 'https://nexmarkets.fun' } });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.length, 1);
  assert.equal(data[0].display_name, 'Satoshi Builder');
  assert.equal(data[0].supplyCap, 555);
  assert.equal(data[0].passesIssued, 2);
  assert.equal(data[0].priceUsdg, '50');
  assert.equal(data[0].advantageSummary, 'Lifetime Beta Access');
  assert.equal(data[0].projectSlug, 'builder-one-project');
});
