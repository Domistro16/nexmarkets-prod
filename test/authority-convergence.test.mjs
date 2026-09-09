import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PRODUCT_AUTHORITY } from '../packages/config/src/networks.mjs';

const authority = await readFile(new URL('../NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html', import.meta.url), 'utf8');
const authorityHash = createHash('sha256').update(authority).digest('hex');

test('approved UI authority remains byte-exact', () => {
  assert.equal(PRODUCT_AUTHORITY.file, 'NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html');
  assert.equal(authorityHash, PRODUCT_AUTHORITY.sha256);
  assert.equal(authorityHash, '4863df4a8829b6ced1672248e1fd0336e577d6c13c80f1dbd7fe99d73bc821d5');
});

test('approved UI authority is a standalone canonical document', () => {
  assert.match(authority, /<!doctype html>/i);
  assert.match(authority, /<html[\s>]/i);
  assert.match(authority, /<\/html>/i);
  assert.match(authority, /window\.__nmBoot=init/);
  assert.doesNotMatch(authority, /__NEXMARKETS_FIXTURE_MODE__/);
});
