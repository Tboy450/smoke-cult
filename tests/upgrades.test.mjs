import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR } from '../src/tuning.js';
import { buy, carTuning, createProgress, earn, levelsFor, MAX_STAGE, nextPrice, PARTS, stageOf, STAGE_PRICES } from '../src/upgrades.js';
import {
  colorOf, createGarageState, currentRow, hexToHsv, hsvToHex, isPartRow, moveGarage, OPTIONS, picked, saveData, setCustomColor, stepOption, switchTab, TABS,
} from '../src/garageState.js';

test('buying walks through the stages, charges the right price and stops at the top', () => {
  const p = createProgress();
  assert.deepEqual(buy(p, 'cinder', 'engine'), { ok: false, reason: 'short', need: STAGE_PRICES[0] });
  earn(p, 2600);
  assert.deepEqual(buy(p, 'cinder', 'engine'), { ok: true });
  assert.equal(p.bank, 100);
  assert.equal(stageOf(p, 'cinder', 'engine'), 1);
  assert.equal(nextPrice(p, 'cinder', 'engine'), STAGE_PRICES[1]);
  assert.equal(stageOf(p, 'razor', 'engine'), 0, 'upgrades belong to one car');
  earn(p, 10_000_000);
  for (let i = 1; i < MAX_STAGE; i++) assert.ok(buy(p, 'cinder', 'engine').ok);
  const left = p.bank;
  assert.deepEqual(buy(p, 'cinder', 'engine'), { ok: false, reason: 'max' });
  assert.equal(p.bank, left, 'a refused purchase costs nothing');
  assert.equal(nextPrice(p, 'cinder', 'engine'), null);
});

test('each part changes what it says it changes, and stock stays stock', () => {
  assert.deepEqual(carTuning(CAR, {}), CAR);
  const up = (part) => carTuning(CAR, {}, { [part]: 2 });
  assert.ok(up('engine').EngineAccel > CAR.EngineAccel && up('engine').TopSpeed > CAR.TopSpeed);
  assert.ok(up('tires').RearGrip > CAR.RearGrip && up('tires').FrontGrip > CAR.FrontGrip);
  assert.ok(up('angle').MaxSteerDeg > CAR.MaxSteerDeg);
  assert.ok(up('weight').Mass < CAR.Mass);
  assert.equal(up('engine').Mass, CAR.Mass, 'parts do not touch anything else');
  assert.equal(CAR.Mass, 1250, 'the base numbers are never changed');
});

test('a car keeps its own character under upgrades', () => {
  const levels = { engine: 1 };
  assert.equal(carTuning(CAR, { Mass: 880 }, levels).Mass, 880);
  assert.equal(carTuning(CAR, { EngineAccel: 8 }, levels).EngineAccel, 8 * 1.06);
});

test('saved progress is checked before it is trusted', () => {
  assert.deepEqual(createProgress(null), { bank: 0, parts: {} });
  const p = createProgress({ bank: -5, parts: { cinder: { engine: 99, tires: 'lots', angle: 2.5, weight: 2 } } });
  assert.equal(p.bank, 0);
  assert.deepEqual(levelsFor(p, 'cinder'), { engine: MAX_STAGE, tires: 0, angle: 0, weight: 2 });
  assert.equal(createProgress({ bank: 'rich' }).bank, 0);
  const round = createProgress(JSON.parse(JSON.stringify({ bank: 500, parts: { hex: { tires: 3 } } })));
  assert.equal(round.bank, 500);
  assert.equal(stageOf(round, 'hex', 'tires'), 3);
});

test('garage tabs hold every option, and every part has a row', () => {
  const rows = TABS.flatMap((t) => t.rows);
  for (const key of Object.keys(OPTIONS)) assert.ok(rows.includes(key), `${key} has no row`);
  for (const part of PARTS) assert.ok(rows.includes(`part:${part.id}`), `${part.id} has no row`);
});

test('tabs reset the row; left and right do nothing on an upgrade row', () => {
  const s = createGarageState();
  moveGarage(s, 0, 2);
  switchTab(s, 1);
  assert.equal(s.row, 0);
  switchTab(s, 1);
  assert.equal(TABS[s.tab].id, 'upgrades');
  assert.ok(isPartRow(currentRow(s)));
  assert.equal(moveGarage(s, 1, 0), null);
  switchTab(s, -3);
  assert.equal(TABS[s.tab].id, 'gam' + 'e', 'tabs wrap');
});

test('custom colors stick to the right row, survive saving, and bad ones are ignored', () => {
  const s = createGarageState();
  setCustomColor(s, 'paint', 0x123456);
  assert.equal(picked(s, 'paint').id, 'custom');
  assert.equal(colorOf(s, 'paint'), 0x123456);
  assert.equal(colorOf(s, 'rims'), OPTIONS.rims[0].color, 'other rows are untouched');
  const again = createGarageState(JSON.parse(JSON.stringify(saveData(s))));
  assert.equal(colorOf(again, 'paint'), 0x123456);
  stepOption(again, 'paint', 1);
  assert.equal(colorOf(again, 'paint'), OPTIONS.paint[0].color, 'stepping off custom goes back to presets');
  const bad = createGarageState({ paint: 'custom', custom: { paint: 'red' } });
  assert.equal(colorOf(bad, 'paint'), 0xff2aa0);
});

test('color wheel math round-trips and lands on the right colors', () => {
  assert.equal(hsvToHex(0, 1, 1), 0xff0000);
  assert.equal(hsvToHex(120, 1, 1), 0x00ff00);
  assert.equal(hsvToHex(240, 1, 1), 0x0000ff);
  assert.equal(hsvToHex(0, 0, 1), 0xffffff);
  assert.equal(hsvToHex(200, 0.5, 0), 0x000000);
  for (const color of [0xff2aa0, 0x123456, 0x9bdc1e, 0xe8e2d6]) {
    const { h, s, v } = hexToHsv(color);
    assert.equal(hsvToHex(h, s, v), color);
  }
});
