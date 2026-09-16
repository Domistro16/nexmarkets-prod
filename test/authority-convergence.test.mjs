import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PRODUCT_AUTHORITY } from '../packages/config/src/networks.mjs';

const authority = await readFile(new URL(`../${PRODUCT_AUTHORITY.file}`, import.meta.url), 'utf8');
const authorityHash = createHash('sha256').update(authority).digest('hex');

test('approved UI authority remains byte-exact', () => {
  assert.equal(PRODUCT_AUTHORITY.file, 'NEXMARKETS_HOMEPAGE_DISCOVER_MARKET_COLLECTIBLE_ROTATION_PASS_TEXT_FIT_UX_FIXED.html');
  assert.equal(authorityHash, PRODUCT_AUTHORITY.sha256);
  assert.equal(authorityHash, '7e67e10e8332677668baab0e5653e84c62556d57f816f5b09daa6337adf9858c');
});

test('approved UI authority is a standalone canonical document', () => {
  assert.match(authority, /<!doctype html>/i);
  assert.match(authority, /<html[\s>]/i);
  assert.match(authority, /<\/html>/i);
  assert.match(authority, /window\.__nmBoot=init/);
  assert.doesNotMatch(authority, /__NEXMARKETS_FIXTURE_MODE__/);
});
