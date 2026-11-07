import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, readRecords } from '../src/records.js';

test('records reload exactly and invalid or missing saves fall back safely', () => {
  const original = { combo: 342, lapPoints: 4988, lapTime: 92.8125 };
  assert.deepEqual(readRecords(JSON.parse(JSON.stringify(original))), original);
  const empty = { combo: 0, lapPoints: 0, lapTime: null };
  assert.deepEqual(readRecords(null), empty);
  assert.deepEqual(readRecords({ combo: '342', lapPoints: -1, lapTime: Infinity }), empty);
  assert.deepEqual(readRecords({ combo: 1.5, lapPoints: 2 ** 53, lapTime: 0 }), empty);
});

test('merging results keeps the fastest lap and highest scores independently', () => {
  const old = { combo: 1000, lapPoints: 1200, lapTime: 95 };
  const newer = { combo: 900, lapPoints: 2100, lapTime: 93 };
  const best = { combo: 1000, lapPoints: 2100, lapTime: 93 };
  assert.deepEqual(mergeRecords(old, newer), best);
  assert.deepEqual(mergeRecords(newer, old), best);
  assert.deepEqual(mergeRecords(best, readRecords(null)), best);
  assert.equal(mergeRecords(readRecords(null), readRecords(null)).lapTime, null);
});
