import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScore, stepScore, finishScore } from '../src/scoring.js';
import { createCar, stepCar, carAxes } from '../src/physics.js';
import { CAR } from '../src/tuning.js';

const drifting = { speed: 15, forwardSpeed: 12, driftAngle: 40, grounded: true, up: 1 };
function drive(s, seconds, sample = drifting, hz = 240) {
  for (let i = 0; i < Math.round(seconds * hz); i++) stepScore(s, sample, 1 / hz);
  return s;
}

test('straight driving, slow sliding and airtime cannot start scoring', () => {
  for (const sample of [{ driftAngle: 0 }, { speed: 7 }, { grounded: false }, { forwardSpeed: -12 }]) {
    const s = drive(createScore(), 3, { ...drifting, ...sample });
    assert.equal(s.active, false); assert.equal(s.points, 0); assert.equal(s.total, 0);
  }
});

test('angle, speed and held drift time increase the reward; multiplier caps at 3', () => {
  const base = drive(createScore(), 1);
  assert.ok(drive(createScore(), 1, { ...drifting, speed: 25 }).points > base.points);
  assert.ok(drive(createScore(), 1, { ...drifting, driftAngle: 60 }).points > base.points);
  const long = drive(createScore(), 40);
  assert.equal(long.multiplier, 3);
  assert.ok(long.points > base.points * 40);
});

test('short straight links a combo without awarding points; expired grace banks it with a reason', () => {
  const s = drive(createScore(), 2);
  const before = s.points;
  drive(s, 1, { ...drifting, driftAngle: 0 });
  assert.equal(s.active, true); assert.equal(s.points, before);
  drive(s, 1);
  assert.equal(s.grace, 0); assert.ok(s.points > before);
  const bank = Math.floor(s.points);
  drive(s, 1.6, { ...drifting, driftAngle: 0 });
  assert.equal(s.active, false); assert.equal(s.total, bank); assert.equal(s.best, bank);
  assert.deepEqual(s.result, { points: bank, banked: true, reason: 'Straightened out' });
  drive(s, 2, { ...drifting, driftAngle: 0 });
  assert.equal(s.total, bank, 'must bank once');
});

test('clean side changes earn a bonus, steering chatter does not', () => {
  const s = drive(createScore(), 2);
  drive(s, 0.3, { ...drifting, driftAngle: -40 });
  assert.equal(s.transitions, 1); assert.ok(s.bonusTime > 0);
  const points = s.points;
  const noise = drive(createScore(), 2);
  for (let i = 0; i < 30; i++) drive(noise, 0.05, { ...drifting, driftAngle: i % 2 ? -40 : 40 });
  assert.equal(noise.transitions, 0);
  assert.ok(points > 150);
});

test('spin, rollover, cone hit, reset and assist change forfeit pending points, preserving banked scores', () => {
  const invalid = [{ driftAngle: 85 }, { forwardSpeed: -4 }, { up: 0.1 }];
  for (const sample of invalid) {
    const s = drive(createScore(), 2);
    stepScore(s, { ...drifting, ...sample }, 1 / 240);
    assert.equal(s.total, 0); assert.equal(s.active, false); assert.equal(s.result.reason, 'Spun out');
  }
  for (const reason of ['Cone hit', 'Car reset', 'Assist changed']) {
    const s = drive(createScore(), 2);
    finishScore(s, 'Straightened out', true);
    const bank = s.total;
    drive(s, 2); finishScore(s, reason);
    assert.equal(s.total, bank); assert.equal(s.best, bank);
    assert.equal(s.points, 0); assert.equal(s.result.reason, reason); assert.equal(s.result.banked, false);
  }
});

test('loss of speed and ground contact have distinct combo-end feedback', () => {
  for (const [sample, reason] of [[{ speed: 5 }, 'Too slow'], [{ grounded: false }, 'Left the ground']]) {
    const s = drive(createScore(), 1);
    drive(s, 1.6, { ...drifting, ...sample });
    assert.equal(s.result.reason, reason); assert.equal(s.result.banked, true);
  }
});

test('score is stable across update rates and rejects invalid state', () => {
  const scores = [30, 60, 240].map((hz) => drive(createScore(), 10, drifting, hz).points);
  assert.ok(Math.max(...scores) - Math.min(...scores) < 3);
  const s = drive(createScore(), 1);
  stepScore(s, { ...drifting, speed: NaN }, 1 / 240);
  assert.equal(s.points, 0); assert.equal(s.result.reason, 'Car recovered');
  stepScore(s, drifting, NaN); assert.equal(s.points, 0);
});

test('the real assisted physics drifts earn a combo, while the initial straight earns nothing', () => {
  for (const preset of ['Arcade', 'Balanced']) {
    const car = createCar(CAR);
    car.preset = preset;
    const s = createScore();
    const run = (seconds, controls) => {
      for (let i = 0; i < seconds * 240; i++) {
        stepCar(car, controls, CAR, 1 / 240);
        stepScore(s, { ...car, up: carAxes(car).up[1] }, 1 / 240);
      }
    };
    run(1, { throttle: 0, brake: 0, steer: 0, handbrake: false });
    run(4, { throttle: 1, brake: 0, steer: 0, handbrake: false });
    assert.equal(s.points, 0);
    run(0.4, { throttle: 0.3, brake: 0, steer: 1, handbrake: true });
    run(4, { throttle: 0.85, brake: 0, steer: 0, handbrake: false });
    assert.ok(s.active, preset); assert.ok(s.points > 100, preset);
  }
});
