import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTougeRun, stepTougeRun } from '../src/tougeRun.js';

// A straight corridor isolates the timer and gate rules from the mountain geometry.
function fixture() {
  const course = {
    samples: Array.from({ length: 121 }, (_, s) => ({ x: 0, y: 0, z: -s, tx: 0, tz: -1, rx: 1, rz: 0, s })),
    gates: [{ index: 10, label: 'Start' }, { index: 40, label: 'Checkpoint 1' }, { index: 70, label: 'Checkpoint 2' }, { index: 100, label: 'Finish' }],
    railOffset: 8.2,
    spawn: { x: 0, z: -2 },
    nearest(x, z) {
      const s = Math.max(0, Math.min(120, -z));
      return { s, lateral: x, distance: Math.hypot(x, z + s), index: Math.round(s) };
    },
  };
  const run = createTougeRun(course);
  const car = { pos: [0, 1, -2], body: [1.8, 1, 4.2], quat: [0, 0, 0, 1], speed: 24, driftAngle: 0, grounded: true };
  function step(s, { x = 0, dt = 0.2, points = 0, ...options } = {}) {
    car.pos = [x, 1, -s];
    return stepTougeRun(run, course, car, dt, points, options);
  }
  return { course, run, car, step };
}

test('only the downhill start-to-finish interval counts, with all gates required in order', () => {
  const { run, step } = fixture();
  const events = [];
  for (let s = 5; s <= 105; s += 5) {
    const event = step(s, { points: 500 + s * 10 });
    if (event) events.push(event);
    if (s === 5) assert.equal(run.time, 0, 'approach time does not count');
  }
  assert.deepEqual(events.map(({ type }) => type), ['start', 'checkpoint', 'checkpoint', 'finish']);
  assert.equal(events[1].label, 'Checkpoint 1');
  assert.equal(run.status, 'finished');
  assert.equal(run.progress, 1);
  assert.ok(Math.abs(run.time - 3.6) < 1e-9);
  assert.equal(run.score, 900, 'subtract points already present at the start');
  assert.equal(events[3].score, run.score);
  assert.equal(step(110, { points: 9000 }), null, 'finish only fires once');
  assert.equal(run.score, 900);
});

test('run timing interpolates gate crossing within a frame', () => {
  const { run, step } = fixture();
  step(6);
  step(9);
  assert.deepEqual(step(11), { type: 'start' });
  assert.ok(Math.abs(run.time - 0.1) < 1e-9);
  for (let s = 15; s <= 99; s += 4) step(s);
  const finish = step(101);
  assert.equal(finish.type, 'finish');
  assert.ok(Math.abs(finish.time - 4.6) < 1e-9);
});

test('teleporting or bypassing a checkpoint voids the run', () => {
  const jump = fixture();
  jump.step(6);
  jump.step(10);
  assert.equal(jump.step(90).reason, 'Route shortcut');
  assert.equal(jump.step(100), null);
  assert.equal(jump.run.status, 'invalid');

  const bypass = fixture();
  bypass.step(6);
  bypass.step(10);
  bypass.step(14, { x: 4 });
  for (let s = 18; s < 54; s += 4) assert.equal(bypass.step(s, { x: 8.6 }), null);
  assert.deepEqual(bypass.step(54, { x: 8.6 }), { type: 'void', reason: 'Missed Checkpoint 1' });
});

test('leaving the road corridor or sustained backtracking requires a retry', () => {
  const offRoad = fixture();
  offRoad.step(6);
  offRoad.step(10);
  offRoad.step(14, { x: 6 });
  assert.equal(offRoad.step(18, { x: 10 }).reason, 'Left the route');
  assert.equal(createTougeRun(offRoad.course).status, 'ready');

  const reverse = fixture();
  for (let s = 5; s <= 35; s += 5) reverse.step(s);
  for (let s = 31; s >= 15; s -= 4) assert.equal(reverse.step(s), null);
  assert.equal(reverse.step(11).reason, 'Wrong way');
});

test('rail bonuses require a clean hold and only pay once between checkpoints', () => {
  const { car, step } = fixture();
  car.driftAngle = 30;
  for (let s = 5; s <= 11; s += 3) step(s, { dt: 0.1 });
  step(12, { x: 3, dt: 0.1 });
  assert.equal(step(13, { x: 6.2, dt: 0.1, touchedRail: true }), null);
  for (let s = 14; s <= 23; s++) assert.equal(step(s, { x: 6.2, dt: 0.1 }), null);
  const first = [];
  for (let s = 24; s < 40; s++) {
    const event = step(s, { x: 6.2, dt: 0.1 });
    if (event) first.push(event);
  }
  assert.deepEqual(first, [{ type: 'rail', points: 200 }]);
  assert.equal(step(40, { x: 6.2, dt: 0.1 }).type, 'checkpoint');
  const second = [];
  for (let s = 41; s <= 55; s++) {
    const event = step(s, { x: 6.2, dt: 0.1 });
    if (event) second.push(event);
  }
  assert.deepEqual(second, [{ type: 'rail', points: 200 }]);
});

test('straight driving, centre-line drifts and a lost combo give no rail bonus', () => {
  const { car, step } = fixture();
  step(6);
  step(10);
  for (let s = 11; s < 18; s++) assert.equal(step(s, { x: 6.2, dt: 0.1 }), null);
  car.driftAngle = 30;
  for (let s = 18; s < 25; s++) assert.equal(step(s, { x: 6.2, dt: 0.1, comboActive: false }), null);
  for (let s = 25; s < 35; s++) assert.equal(step(s, { dt: 0.1 }), null);
});
