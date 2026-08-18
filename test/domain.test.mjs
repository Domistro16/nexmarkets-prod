import test from 'node:test'; import assert from 'node:assert/strict';
import { ids, TX_STATE, transitionTransaction } from '../packages/domain/src/index.mjs';
test('opaque domain ids are prefixed and unique',()=>{const a=ids.mintIntent(),b=ids.mintIntent();assert.match(a,/^mint_[0-9a-f]{32}$/);assert.notEqual(a,b);});
test('transaction lifecycle is fail-closed',()=>{assert.equal(transitionTransaction(TX_STATE.PREPARED,TX_STATE.WALLET_PENDING),TX_STATE.WALLET_PENDING);assert.throws(()=>transitionTransaction(TX_STATE.PREPARED,TX_STATE.FINALIZED));});
