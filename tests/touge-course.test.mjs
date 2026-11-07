import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carAxes, createCar, stepCar } from '../src/physics.js';
import { buildTougeCourse } from '../src/tougeCourse.js';
import { createTougeRun, stepTougeRun } from '../src/tougeRun.js';
import { collideCar } from '../src/track.js';
import { CAR } from '../src/tuning.js';
import { aiControls } from './support/aiDriver.mjs';

const course = buildTougeCourse();
const { samples, gates, world } = course;

test('the switchbacks are an open descent with runway before and after the timed section', () => {
  const first = samples[gates[0].index];
  const finish = samples[gates.at(-1).index];
  const drop = first.y - finish.y;
  assert.ok(drop > 30 && drop < 50);
  assert.ok(first.s - course.spawn.s > 10);
  assert.ok(course.length - finish.s >= 45);
  assert.ok(gates.every((gate, i) => i === 0 || gate.index > gates[i - 1].index));
  for (const [i, p] of samples.entries()) {
    if (i === 0) continue;
    const previous = samples[i - 1];
    assert.ok(p.y < previous.y);
    assert.ok(Math.hypot(p.x - previous.x, p.z - previous.z) < 2.01);
    for (let j = 0; j < i - 25; j++) {
      const other = samples[j];
      assert.ok(Math.hypot(p.x - other.x, p.z - other.z) > course.railOffset * 2,
        `Separated sections intersect at ${i}/${j}`);
    }
  }
});

test('suspension rays and guardrail contacts follow the rendered course surface and edges', () => {
  for (const gate of gates) {
    const p = samples[gate.index];
    const hit = world.raycast([p.x, p.y + 1, p.z], [0.1, -0.97, 0.2], 2);
    assert.ok(hit);
    assert.ok(Math.abs(hit.position[1] - course.groundHeight(hit.position[0], hit.position[2])) < 1e-10);
    assert.equal(hit.grip, 1);
    assert.equal(world.raycast([p.x, p.y + 1, p.z], [0, 1, 0], 2), null);
    for (const side of [-1, 1]) {
      const gravel = course.halfWidth + 0.8;
      const x = p.x + p.rx * side * gravel;
      const z = p.z + p.rz * side * gravel;
      assert.ok(world.gripAt(x, z) < 1);
      assert.equal(Math.sign(course.nearest(x, z).lateral), side);
    }
  }
  for (const rail of course.walls) {
    const x = (rail.ax + rail.bx) / 2;
    const z = (rail.az + rail.bz) / 2;
    const hit = world.contact(x, z);
    assert.ok(hit, 'each rail and end stop is solid');
    assert.ok(hit.nx * rail.nx + hit.nz * rail.nz > 0.98, 'contact pushes inward');
    assert.equal(world.contact(x + 0.5 * rail.nx, z + 0.5 * rail.nz), null);
  }
});

test('the stock car can drive a clean timed descent through every gate using the real physics', () => {
  const { x, y, z, yaw } = course.spawn;
  const car = createCar(CAR, [x, y + 1, z], yaw);
  const run = createTougeRun(course);
  const events = [];
  for (let step = 0; step < 240 * 80; step++) {
    const near = course.nearest(car.pos[0], car.pos[2]);
    assert.ok(near.distance < course.halfWidth, 'car remains on the pavement');
    const controls = aiControls(car, course, near.index, { pace: 6.2, topSpeed: 22 });
    stepCar(car, controls, CAR, 1 / 240, world);
    assert.equal(collideCar(car, world, CAR.Mass), null);
    if ((step + 1) % 4 !== 0) continue;
    const event = stepTougeRun(run, course, car, 1 / 60, 0, { comboActive: false });
    if (event) events.push(event.type);
    if (run.status === 'finished') break;
  }
  assert.deepEqual(events, ['start', 'checkpoint', 'checkpoint', 'checkpoint', 'finish']);
  assert.ok(run.time > 25 && run.time < 80, `finish time ${run.time}`);
  assert.ok(car.grounded && carAxes(car).up[1] > 0.95);
});
