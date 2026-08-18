import test from 'node:test'; import assert from 'node:assert/strict';
import { keccak256Text, keccak256Hex, selector } from '../packages/chain/src/keccak.mjs';
test('keccak empty vector',()=>assert.equal(keccak256Hex('0x'),'0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'));
test('ERC20 decimals selector',()=>assert.equal(selector('decimals()'),'0x313ce567'));
test('ERC20 symbol selector',()=>assert.equal(selector('symbol()'),'0x95d89b41'));
