// The AI driver measures lap times, what upgrades are worth, and how road and gravel differ on each assist preset.
// Run with --test-reporter=spec to see the numbers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS } from '../src/cars.js';
import { CAR, PRESETS } from '../src/tuning.js';
import { createCar, flatWorld, placeCar, stepCar } from '../src/physics.js';
import { createScore, stepScore } from '../src/scoring.js';
import { buildTrack, createLap, createTrackWorld, nearestSample, resetLap } from '../src/track.js';
import { carTuning, MAX_STAGE, PARTS, STAGE_PRICES } from '../src/upgrades.js';
import { drive } from './support/aiDriver.mjs';

const track = buildTrack();
const world = createTrackWorld(track);
const dt = 1 / 240;
const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const maxed = Object.fromEntries(PARTS.map((p) => [p.id, MAX_STAGE]));

function startLap(def, tuning, preset) {
  const car = createCar(tuning, [0, 1, 0], 0, def.wheels, def.body);
  car.preset = preset;
  placeCar(car, track.spawn.x, track.spawn.z, track.spawn.yaw);
  const lap = createLap();
  resetLap(lap, track, car.pos[0], car.pos[2]);
  return { car, lap };
}

function lapTime(def, levels = {}, preset = 'Arcade') {
  const tuning = carTuning(CAR, def.tuning, levels);
  const { car, lap } = startLap(def, tuning, preset);
  const pace = 7 * (tuning.RearGrip / CAR.RearGrip);
  const impact = drive(car, tuning, track, world, lap, 260, { pace, topSpeed: tuning.TopSpeed * 0.62 }, () => lap.lap >= 1);
  return { time: lap.last, impact };
}

test('every car lands a clean AI lap in a sensible range, and they do not all match', (t) => {
  const times = {};
  for (const def of CARS) {
    const { time, impact } = lapTime(def);
    assert.ok(time !== null, `${def.name} never finished a lap`);
    assert.ok(time > 55 && time < 125, `${def.name}: ${time}`);
    assert.ok(impact < 8, `${def.name} hit a wall at ${impact} m/s`);
    times[def.name] = Number(time.toFixed(1));
  }
  t.diagnostic(`AI lap times: ${JSON.stringify(times)}`);
  const values = Object.values(times);
  assert.ok(Math.max(...values) - Math.min(...values) > 1.5, 'cars should not all lap the same');
});

test('full upgrades are clearly faster, without breaking the game', (t) => {
  const stock = lapTime(CARS[0]).time;
  const upgraded = lapTime(CARS[0], maxed);
  t.diagnostic(`Cinder 2D: stock ${stock.toFixed(1)} s, fully upgraded ${upgraded.time.toFixed(1)} s`);
  assert.ok(upgraded.time < stock - 1, 'upgrades must be worth buying');
  assert.ok(upgraded.time > stock * 0.72, 'upgrades must not make the stock car pointless');
});

test('fully upgraded cars still hold a drift on Balanced', () => {
  for (const def of CARS) {
    const tuning = carTuning(CAR, def.tuning, maxed);
    const car = createCar(tuning, [0, 1, 0], 0, def.wheels, def.body);
    car.preset = 'Balanced';
    const run = (secs, c) => { for (let i = 0; i < secs / dt; i++) stepCar(car, c, tuning, dt); };
    run(1, idle);
    while (car.speed * 3.6 < 70) stepCar(car, { ...idle, throttle: 1 }, tuning, dt);
    run(0.25, { ...idle, throttle: 0.5, steer: 1 });
    run(0.15, { ...idle, throttle: 0.3, steer: 1, handbrake: true });
    run(0.6, { ...idle, throttle: 0.85, steer: 1 });
    let held = 0;
    for (let i = 0; i < 2.5 / dt; i++) {
      stepCar(car, { ...idle, throttle: 0.85 }, tuning, dt);
      assert.ok(Math.abs(car.driftAngle) < 85, `${def.name} spun`);
      if (Math.abs(car.driftAngle) >= 12 && car.speed >= 8) held += dt;
    }
    assert.ok(held > 1.5, `${def.name} held only ${held.toFixed(2)} s`);
  }
});

test('the shop: early stages come fast, the top takes real effort', (t) => {
  const def = CARS[0];
  const tuning = carTuning(CAR, def.tuning);
  const { car, lap } = startLap(def, tuning, 'Arcade');
  const score = createScore();
  const earned = () => score.total + Math.floor(score.points);
  drive(car, tuning, track, world, lap, 260, { pace: 11, topSpeed: 34, drift: true, earned }, () => {
    stepScore(score, { ...car, up: 1 }, dt);
    return lap.lap >= 1;
  });
  const perLap = lap.lastScore;
  t.diagnostic(`AI drift lap earned ${perLap.toLocaleString()} points`);
  assert.ok(perLap > 0);
  assert.ok(STAGE_PRICES[0] <= perLap, 'the first stage should come within a lap of decent drifting');
  assert.ok(STAGE_PRICES[0] + STAGE_PRICES[1] <= perLap * 3, 'the first two stages should come within about three laps');
  const onePart = STAGE_PRICES.reduce((a, b) => a + b, 0);
  assert.ok(onePart / perLap >= 8, `one maxed part only takes ${(onePart / perLap).toFixed(1)} expert laps`);
  for (let i = 1; i < STAGE_PRICES.length; i++) assert.ok(STAGE_PRICES[i] >= STAGE_PRICES[i - 1] * 2, 'each stage is a real step up');
});

// --- road vs gravel. A plain world with one surface everywhere keeps these clean. ---
const surface = (grip) => ({
  ...flatWorld,
  raycast(origin, dir, maxDist) {
    const hit = flatWorld.raycast(origin, dir, maxDist);
    if (hit) hit.grip = grip;
    return hit;
  },
});
const GRAVEL = 0.72;

function onSurface(grip, preset) {
  const world = surface(grip);
  const car = createCar(CAR, [0, 1, 0]);
  car.preset = preset;
  for (let i = 0; i < 240; i++) stepCar(car, idle, CAR, dt, world);
  return { car, world };
}

function stoppingDistance(grip, preset) {
  const { car, world } = onSurface(grip, preset);
  car.vel = [0, 0, -25];
  const start = car.pos[2];
  for (let i = 0; i < 240 * 10 && car.forwardSpeed >= 0 && (i < 5 || car.speed > 0.5); i++) stepCar(car, { ...idle, brake: 1 }, CAR, dt, world);
  return Math.abs(car.pos[2] - start);
}

function coastLoss(grip, preset) {
  const { car, world } = onSurface(grip, preset);
  car.vel = [0, 0, -25];
  for (let i = 0; i < 240 * 3; i++) stepCar(car, idle, CAR, dt, world);
  return 25 - car.speed;
}

// Traction: push the car sideways and see how hard the tires pull it back, in m/s^2. No steering involved, so it means the
// same thing on every preset.
function sideGrip(grip, preset) {
  const { car, world } = onSurface(grip, preset);
  car.vel = [9, 0, 0];
  for (let i = 0; i < 60; i++) stepCar(car, idle, CAR, dt, world);
  return (9 - Math.abs(car.vel[0])) / (60 * dt);
}

test('gravel is worse than road: longer stops, more drag, less traction', (t) => {
  for (const preset of ['Arcade', 'Balanced', 'Off']) {
    const stop = [stoppingDistance(1, preset), stoppingDistance(GRAVEL, preset)];
    const drag = [coastLoss(1, preset), coastLoss(GRAVEL, preset)];
    const hold = [sideGrip(1, preset), sideGrip(GRAVEL, preset)];
    t.diagnostic(`${preset}: stop ${stop.map((n) => n.toFixed(1))} m, speed lost coasting ${drag.map((n) => n.toFixed(1))} m/s, traction ${hold.map((n) => n.toFixed(1))} m/s²`);
    assert.ok(stop[1] > stop[0], `${preset}: gravel should stop longer`);
    assert.ok(drag[1] > drag[0] + 1, `${preset}: gravel should drag`);
    assert.ok(hold[1] < hold[0], `${preset}: gravel should have less traction`);
  }
});

test('assist presets soften gravel: Arcade forgives most, Off forgives nothing', () => {
  assert.ok(PRESETS.Arcade.SurfacePenalty < PRESETS.Balanced.SurfacePenalty);
  assert.ok(PRESETS.Balanced.SurfacePenalty < PRESETS.Off.SurfacePenalty);
  assert.equal(PRESETS.Off.SurfacePenalty, 1);
  const stop = (p) => stoppingDistance(GRAVEL, p);
  const drag = (p) => coastLoss(GRAVEL, p);
  assert.ok(stop('Arcade') < stop('Balanced') && stop('Balanced') < stop('Off'));
  assert.ok(drag('Arcade') < drag('Balanced') && drag('Balanced') < drag('Off'));
  const lost = (p) => sideGrip(1, p) - sideGrip(GRAVEL, p);
  assert.ok(lost('Arcade') < lost('Off'), 'Arcade loses less traction on gravel than Off');
});

test('presets change nothing on the road itself', () => {
  for (const preset of ['Arcade', 'Off']) {
    const plain = createCar(CAR, [0, 1, 0]);
    const paved = createCar(CAR, [0, 1, 0]);
    plain.preset = paved.preset = preset;
    const road = surface(1);
    for (let i = 0; i < 240 * 3; i++) {
      stepCar(plain, { ...idle, throttle: 1 }, CAR, dt);
      stepCar(paved, { ...idle, throttle: 1 }, CAR, dt, road);
    }
    assert.deepEqual(paved.pos, plain.pos);
  }
});

test('an Arcade car can still drift and recover on the real gravel run-off', () => {
  const p = track.samples[60];
  const off = track.outer * 12;
  const car = createCar(CAR, [0, 1, 0]);
  car.preset = 'Arcade';
  placeCar(car, p.x + p.rx * off, p.z + p.rz * off, Math.atan2(-p.tx, -p.tz));
  for (let i = 0; i < 120; i++) stepCar(car, idle, CAR, dt, world);
  car.vel = [p.tx * 22, 0, p.tz * 22];
  const run = (secs, c) => { for (let i = 0; i < secs / dt; i++) stepCar(car, c, CAR, dt, world); };
  run(0.25, { ...idle, throttle: 0.5, steer: 1 });
  run(0.2, { ...idle, throttle: 0.3, steer: 1, handbrake: true });
  run(0.5, { ...idle, throttle: 0.85, steer: 1 });
  assert.ok(Math.abs(car.driftAngle) > 12, `only ${car.driftAngle}°`);
  assert.ok(nearestSample(track, car.pos[0], car.pos[2]).distance < 40);
});
