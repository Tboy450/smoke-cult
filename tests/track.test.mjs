import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR } from '../src/tuning.js';
import { carAxes, createCar, placeCar, stepCar } from '../src/physics.js';
import { buildTrack, collideCar, createLap, createTrackWorld, GARAGE, inGarageBay, nearestSample, PAD, resetLap, ROAD_WIDTH, stepLap, zoneAt } from '../src/track.js';
import { drive } from './support/aiDriver.mjs';

const track = buildTrack();
const world = createTrackWorld(track);
const dt = 1 / 240;

test('the circuit is a sensible, closed, non-overlapping loop', () => {
  assert.ok(track.length > 1400 && track.length < 2400, `length ${track.length}`);
  for (let i = 0; i < track.count; i++) {
    const p = track.samples[i];
    const q = track.samples[(i + 1) % track.count];
    assert.ok(Math.hypot(p.x - q.x, p.z - q.z) < 4, 'no jump between samples');
    assert.ok(Math.abs(p.x) < 400 && Math.abs(p.z) < 400, 'inside the world');
    assert.ok(Math.abs(p.curve) < 1 / 9, `corner tighter than a 9 m radius at ${i}`);
    // Sections of road that aren't neighbours must keep clear of each other.
    for (let j = i + 40; j < track.count - 40 + Math.min(i, 40); j++) {
      const o = track.samples[j % track.count];
      assert.ok(Math.hypot(p.x - o.x, p.z - o.z) > ROAD_WIDTH + 6, `road overlaps itself near ${i}/${j}`);
    }
  }
});

test('road, test pad and garage keep out of each other', () => {
  for (const p of track.samples) {
    const inPad = p.x > PAD.minX - ROAD_WIDTH && p.x < PAD.maxX + ROAD_WIDTH && p.z > PAD.minZ - ROAD_WIDTH && p.z < PAD.maxZ + ROAD_WIDTH;
    assert.ok(!inPad, `road crosses the test pad at ${p.x},${p.z}`);
  }
  for (const b of track.blocks) {
    if (b.kind === 'tires') continue;
    assert.ok(track.distanceToRoad(b.x, b.z) > ROAD_WIDTH / 2 + Math.hypot(b.hx, b.hz) + 1, `${b.kind} sits on the road`);
  }
});

test('walls are closed, stay off the road and face it', () => {
  assert.ok(track.walls.length > 100);
  for (const [i, w] of track.walls.entries()) {
    const next = track.walls[(i + 1) % track.walls.length];
    assert.ok(Math.hypot(w.bx - next.ax, w.bz - next.az) < 0.01, 'wall has no gaps');
    const mx = (w.ax + w.bx) / 2;
    const mz = (w.az + w.bz) / 2;
    const d = track.distanceToRoad(mx, mz);
    assert.ok(d > ROAD_WIDTH / 2 + 1.5, `wall too close to the road: ${d}`);
    assert.ok(track.distanceToRoad(mx + w.nx * 2, mz + w.nz * 2) < d, 'wall faces the road');
  }
});

test('surfaces: road and pad grip fully, gravel does not', () => {
  const s = track.samples[20];
  assert.equal(world.gripAt(s.x, s.z), 1);
  assert.equal(world.gripAt(0, 0), 1);
  const out = track.outer * (ROAD_WIDTH / 2 + 6);
  assert.ok(world.gripAt(s.x + s.rx * out, s.z + s.rz * out) < 1);
  assert.equal(world.raycast([s.x, 1, s.z], [0, -1, 0], 2).grip, 1);
});

test('full speed into the wall stops the car, on every side, without tunnelling', () => {
  for (const at of [0.05, 0.3, 0.55, 0.8]) {
    const p = track.samples[Math.floor(track.count * at)];
    const car = createCar(CAR, [p.x, 1, p.z]);
    const dir = track.outer;
    placeCar(car, p.x, p.z, Math.atan2(-p.rx * dir, -p.rz * dir));
    run: for (let i = 0; i < 240 * 3; i++) {
      if (i === 240) car.vel = [p.rx * dir * 60, 0, p.rz * dir * 60];
      stepCar(car, { throttle: 1, brake: 0, steer: 0, handbrake: false }, CAR, dt, world);
      collideCar(car, world, CAR.Mass);
      if (track.distanceToRoad(car.pos[0], car.pos[2]) > ROAD_WIDTH / 2 + 12) break run;
    }
    const d = track.distanceToRoad(car.pos[0], car.pos[2]);
    assert.ok(d < ROAD_WIDTH / 2 + 10.5, `car went through the wall: ${d} m from the road`);
    assert.ok(car.pos.every(Number.isFinite));
  }
});

test('solid blocks stop the car from any direction', () => {
  const block = track.blocks.find((b) => b.kind === 'container');
  for (const angle of [0, 1.6, 3.1, 4.7]) {
    const car = createCar(CAR, [0, 1, 0]);
    const sx = Math.sin(angle);
    const cz = Math.cos(angle);
    placeCar(car, block.x + sx * 14, block.z + cz * 14, Math.atan2(sx, cz));
    for (let i = 0; i < 40; i++) stepCar(car, { throttle: 0, brake: 0, steer: 0, handbrake: false }, CAR, dt, world);
    car.vel = [-sx * 35, 0, -cz * 35];
    let hit = 0;
    for (let i = 0; i < 240; i++) {
      stepCar(car, { throttle: 0, brake: 0, steer: 0, handbrake: false }, CAR, dt, world);
      hit = Math.max(hit, collideCar(car, world, CAR.Mass)?.impact ?? 0);
    }
    assert.ok(hit > 10, `no impact from angle ${angle}`);
    const lx = (car.pos[0] - block.x) * block.cos - (car.pos[2] - block.z) * block.sin;
    const lz = (car.pos[0] - block.x) * block.sin + (car.pos[2] - block.z) * block.cos;
    assert.ok(Math.abs(lx) > block.hx || Math.abs(lz) > block.hz, 'car ended up inside the block');
  }
});

test('a robot driver can lap it, and the lap counter agrees', () => {
  const car = createCar(CAR, [track.spawn.x, 1, track.spawn.z]);
  placeCar(car, track.spawn.x, track.spawn.z, track.spawn.yaw);
  car.preset = 'Arcade';
  const lap = createLap();
  resetLap(lap, track, car.pos[0], car.pos[2]);
  // Roll back a little so the first crossing of the line starts the timer.
  placeCar(car, track.spawn.x - track.samples[0].tx * 20, track.spawn.z - track.samples[0].tz * 20, track.spawn.yaw);
  lap.index = nearestSample(track, car.pos[0], car.pos[2]).index;
  const events = [];
  const impact = drive(car, CAR, track, world, lap, 300, {}, (event) => {
    if (event) events.push(event);
    return lap.lap >= 2;
  });
  assert.deepEqual(events, ['lap', 'lap'], `events ${events}, travel ${lap.travel}, at ${lap.index}/${track.count}`);
  assert.ok(lap.best > 30 && lap.best < 200, `lap time ${lap.best}`);
  assert.ok(impact < 4, `robot hit something at ${impact} m/s`);
  assert.ok(carAxes(car).up[1] > 0.9);
});

test('lap points include a combo still running, and never go negative', () => {
  const lap = createLap();
  resetLap(lap, track, track.samples[track.count - 3].x, track.samples[track.count - 3].z);
  const around = (earned) => {
    for (let i = lap.index + 1, end = lap.index + track.count; i <= end; i += 10) {
      const p = track.samples[i % track.count];
      stepLap(lap, track, p.x, p.z, 20, 0.5, earned);
    }
  };
  const p = track.samples[1];
  stepLap(lap, track, p.x, p.z, 20, 0.1, 100); // crosses the line with 100 points earned so far
  assert.equal(lap.running, true);
  assert.equal(lap.startTotal, 100);
  around(600);
  stepLap(lap, track, track.samples[3].x, track.samples[3].z, 20, 0.1, 600);
  assert.equal(lap.lap, 1, `travel ${lap.travel}`);
  assert.equal(lap.lastScore, 500);
  around(50); // the running combo was lost
  stepLap(lap, track, track.samples[5].x, track.samples[5].z, 20, 0.1, 50);
  assert.equal(lap.lap, 2);
  assert.equal(lap.lastScore, 0);
  assert.equal(lap.bestScore, 500);
});

test('you can drive into the Smokehouse through the door, and out again, but not through the walls', () => {
  const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  const roll = (car, controls, secs) => {
    for (let i = 0; i < secs / dt; i++) {
      stepCar(car, controls, CAR, dt, world);
      collideCar(car, world, CAR.Mass);
    }
  };
  // In off the paddock, heading -X toward the bay.
  const car = createCar(CAR, [0, 1, 0]);
  placeCar(car, GARAGE.x + 34, GARAGE.z, Math.PI / 2);
  roll(car, idle, 0.4);
  car.vel = [-14, 0, 0];
  let reached = false;
  for (let i = 0; i < 240 * 4 && !reached; i++) {
    stepCar(car, idle, CAR, dt, world);
    collideCar(car, world, CAR.Mass);
    reached = inGarageBay(car.pos[0], car.pos[2]);
  }
  assert.ok(reached, `never reached the bay, stopped at x=${car.pos[0]}`);

  // Back out through the door under power.
  placeCar(car, GARAGE.x, GARAGE.z, -Math.PI / 2);
  roll(car, { ...idle, throttle: 1 }, 3);
  assert.ok(car.pos[0] > GARAGE.x + GARAGE.halfX + 5, `stuck inside at x=${car.pos[0]}`);
  assert.ok(!inGarageBay(car.pos[0], car.pos[2]));

  // The hangout corner and the tool chests are solid too, and neither sits in the stopping bay.
  const solid = track.blocks.filter((b) => b.kind === 'garage');
  assert.equal(solid.length, 5);
  for (const b of solid) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      assert.ok(!inGarageBay(b.x + sx * b.hx, b.z + sz * b.hz), 'furniture blocks the bay');
    }
  }

  // The other three sides are solid.
  for (const [x, z, yaw, vel] of [
    [GARAGE.x, GARAGE.z - GARAGE.halfZ - 14, Math.PI, [0, 0, 30]],
    [GARAGE.x, GARAGE.z + GARAGE.halfZ + 14, 0, [0, 0, -30]],
    [GARAGE.x - GARAGE.halfX - 14, GARAGE.z, -Math.PI / 2, [30, 0, 0]],
  ]) {
    const hit = createCar(CAR, [0, 1, 0]);
    placeCar(hit, x, z, yaw);
    roll(hit, idle, 0.4);
    hit.vel = [...vel];
    roll(hit, idle, 1.2);
    assert.ok(!inGarageBay(hit.pos[0], hit.pos[2]), 'drove through a wall');
  }
});

test('short cuts and wrong-way driving do not count as laps', () => {
  const lap = createLap();
  resetLap(lap, track, track.samples[track.count - 3].x, track.samples[track.count - 3].z);
  const visit = (i) => { const p = track.samples[i % track.count]; return stepLap(lap, track, p.x, p.z, 20, 0.1, 0); };
  for (let i = track.count - 3; i <= track.count + 2; i++) visit(i); // starts the timer
  assert.equal(lap.running, true);
  for (let i = 3; i < 60; i++) visit(i);
  stepLap(lap, track, 0, 0, 20, 0.1, 0); // straight across the infield
  assert.equal(lap.valid, false);
  lap.index = track.count - 2;
  const event = visit(track.count + 1);
  assert.notEqual(event, 'lap');
  assert.equal(lap.lap, 0);

  const back = createLap();
  resetLap(back, track, track.samples[200].x, track.samples[200].z);
  for (let i = 200; i > 170; i--) { const p = track.samples[i]; stepLap(back, track, p.x, p.z, 20, 0.1, 0); }
  assert.equal(back.wrongWay, true);
});

test('clip zones sit on the outside of real corners and pay once per lap', () => {
  assert.ok(track.zones.length >= 4, `only ${track.zones.length} zones`);
  const lap = createLap();
  for (const zone of track.zones) {
    const p = track.samples[zone.apex];
    assert.equal(zone.side, -Math.sign(p.curve), 'zone is on the outside of the corner');
    lap.index = zone.apex;
    const x = p.x + p.rx * zone.side * 5;
    const z = p.z + p.rz * zone.side * 5;
    assert.equal(zoneAt(lap, track, x, z)?.id, zone.id);
    assert.equal(zoneAt(lap, track, p.x - p.rx * zone.side * 5, p.z - p.rz * zone.side * 5), null, 'inside line does not count');
    lap.zonesDone.add(zone.id);
    assert.equal(zoneAt(lap, track, x, z), null, 'each zone pays once');
  }
});
