import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PRODUCT_AUTHORITY } from '../packages/config/src/networks.mjs';
import { liveAuthority } from '../scripts/lib/live-authority.mjs';

const reference = await readFile(new URL(`../${PRODUCT_AUTHORITY.file}`, import.meta.url), 'utf8');
const presentation = liveAuthority(reference);
const embeddedSources = html => [...html.matchAll(/\bconst\s+(PASS_B64|NM_EIGHT_PACK_SOURCE_B64)\s*=\s*(['"])([A-Za-z0-9+/=]+)\2/g)]
  .map(match => ({ name: match[1], html: Buffer.from(match[3], 'base64').toString('utf8') }));
const legacyBrand = /\bNexMarkets\b|\bNEXMARKETS\b|\$\{(?:d\.logo|inlineLogoContent\(d\.logo\))\} (?:Markets|MARKETS)/;

test('Outerfield branding reaches native packs and both embedded Pass renderers', () => {
  assert.equal(presentation.match(legacyBrand)?.[0], undefined, 'Native pack branding');
  const documents = embeddedSources(presentation);
  assert.equal(documents.length, 2);
  for (const document of documents) {
    assert.match(document.html, /Outerfield|OUTERFIELD/);
    assert.equal(document.html.match(legacyBrand)?.[0], undefined, document.name);
  }
  assert.match(documents.find(document => document.name === 'PASS_B64').html, /OUTERFIELD PASS/);
  assert.match(documents.find(document => document.name === 'NM_EIGHT_PACK_SOURCE_B64').html, /<b>Outerfield<\/b>/);
});

test('presentation rebranding preserves legacy storage keys and service URLs', () => {
  for (const key of ['nexmarkets_social_v1', 'nexmarkets-random-v1']) {
    assert.ok(reference.includes(key));
    assert.ok(presentation.includes(key));
  }
  const urls = html => [...new Set([...html.matchAll(/https?:\/\/[^\s'"<>]+/g)].map(match => match[0]).filter(url => /nexmarkets/i.test(url)))].sort();
  assert.deepEqual(urls(presentation), urls(reference));
  assert.match(presentation, /window\.nexmarketsV2/);
});
