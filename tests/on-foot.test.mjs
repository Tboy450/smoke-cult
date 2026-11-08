import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEnterCar, createWalker, doorSpots, JOG_SPEED, stepWalker, WALK_SPEED } from '../src/onFoot.js';
import { createCar, flatWorld } from '../src/physics.js';
import { buildTougeCourse } from '../src/tougeCourse.js';
import { CAR } from '../src/tuning.js';

const openWorld = { ...flatWorld, contact: () => null };
const dt = 1 / 60;

test('getting out uses the clear door, and getting in requires being near a clear door', () => {
  const car = createCar(CAR);
  const world = { ...openWorld, contact: (x) => x < -1.3 };
  const spots = doorSpots(car, world, 0.3);
  assert.equal(spots.length, 1);
  assert.ok(spots[0].x > 0, 'the blocked driver side falls back to the passenger side');
  const walker = createWalker(spots[0]);
  assert.ok(canEnterCar(walker, spots, world));
  walker.x += 2;
  assert.ok(!canEnterCar(walker, spots, world));
  assert.equal(doorSpots(car, { ...openWorld, contact: (x) => Math.abs(x) > 1.3 }, 0.3).length, 0);
});

test('walk and jog use the camera heading without diagonal speed gain', () => {
  const car = createCar(CAR, [15, 1, 15]);
  const start = { x: 0, y: 0, z: 0, yaw: Math.PI / 2 };
  for (const jog of [false, true]) {
    const walker = createWalker(start);
    for (let i = 0; i < 60; i++) stepWalker(walker, { x: 1, z: -1, jog }, car, openWorld, dt);
    assert.ok(Math.abs(Math.hypot(walker.x, walker.z) - (jog ? JOG_SPEED : WALK_SPEED)) < 1e-9);
    assert.ok(walker.x < 0 && walker.z < 0);
    assert.ok(walker.phase > 0 && walker.pace > 0);
  }
});

test('the walker stays on the mountain grade and cannot pass through the car or rails', () => {
  const course = buildTougeCourse();
  const { x, y, z, yaw } = course.spawn;
  const car = createCar(CAR, [x, y + 0.74, z], yaw);
  const walker = createWalker(doorSpots(car, course.world, 0.3)[0]);
  for (let i = 0; i < 60; i++) stepWalker(walker, { x: 1, z: 0, jog: false }, car, course.world, dt);
  const lateral = () => course.nearest(walker.x, walker.z).lateral;
  assert.ok(Math.abs(lateral()) >= car.body[0] / 2 + 0.25);
  const side = Math.sign(lateral());
  for (let i = 0; i < 180; i++) stepWalker(walker, { x: -1, z: 0, jog: true }, car, course.world, dt);
  assert.equal(Math.sign(lateral()), side);
  assert.ok(Math.abs(lateral()) > course.railOffset - 0.6);
  assert.ok(Math.abs(lateral()) < course.railOffset);
  assert.equal(walker.y, course.groundHeight(walker.x, walker.z));
});
