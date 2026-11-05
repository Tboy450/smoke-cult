import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR } from '../src/tuning.js';
import { CARS } from '../src/cars.js';
import { carAxes, createCar, stepCar } from '../src/physics.js';
import { createGarageState, moveGarage, OPTIONS, picked, ROWS, saveData, stepOption } from '../src/garageState.js';

const dt = 1 / 240;
const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const run = (car, tuning, secs, controls) => { for (let i = 0; i < secs / dt; i++) stepCar(car, controls, tuning, dt); };

for (const def of CARS) {
  const tuning = { ...CAR, ...def.tuning };
  test(`${def.name}: settles, accelerates, brakes and stays upright`, () => {
    const car = createCar(tuning, [0, 1, 0], 0, def.wheels, def.body);
    run(car, tuning, 2, idle);
    assert.ok(Math.abs(car.pos[1] - 0.74) < 0.05, `rest height ${car.pos[1]}`);
    assert.ok(car.speed < 0.2, 'stays parked');
    run(car, tuning, 4, { ...idle, throttle: 1 });
    assert.ok(car.speed * 3.6 > 50, `only ${car.speed * 3.6} km/h after 4 s`);
    const before = car.speed;
    run(car, tuning, 1, { ...idle, brake: 1 });
    assert.ok(car.speed < before - 5, 'brakes work');
    assert.ok(carAxes(car).up[1] > 0.95);
  });

  for (const preset of ['Arcade', 'Balanced']) {
    test(`${def.name} on ${preset}: a real flick becomes a held drift, with no spin`, () => {
      const car = createCar(tuning, [0, 1, 0], 0, def.wheels, def.body);
      car.preset = preset;
      run(car, tuning, 1, idle);
      while (car.speed * 3.6 < 70) stepCar(car, { ...idle, throttle: 1 }, tuning, dt);
      run(car, tuning, 0.25, { ...idle, throttle: 0.5, steer: 1 });
      run(car, tuning, 0.15, { ...idle, throttle: 0.3, steer: 1, handbrake: true });
      run(car, tuning, 0.6, { ...idle, throttle: 0.85, steer: 1 });
      let held = 0;
      for (let i = 0; i < 2.5 / dt; i++) {
        stepCar(car, { ...idle, throttle: 0.85 }, tuning, dt);
        const angle = Math.abs(car.driftAngle);
        assert.ok(angle < 85, `spun at ${angle}°`);
        if (angle >= 12 && car.speed >= 8) held += dt;
      }
      assert.ok(held > 1.5, `only held the drift for ${held.toFixed(2)} s`);
      assert.ok(carAxes(car).up[1] > 0.9, 'stayed on its wheels');
      assert.ok([...car.pos, ...car.quat].every(Number.isFinite));
    });
  }
}

test('the first car keeps the verified baseline handling', () => {
  assert.deepEqual(CARS[0].tuning, {});
  assert.deepEqual(CARS[0].wheels.map((w) => w.mount), [[-0.78, -0.2, -1.3], [0.78, -0.2, -1.3], [-0.78, -0.2, 1.3], [0.78, -0.2, 1.3]]);
});

test('every car has a unique id, a sane shape and its own feel', () => {
  assert.ok(CARS.length >= 5);
  assert.equal(new Set(CARS.map((c) => c.id)).size, CARS.length);
  for (const def of CARS) {
    assert.ok(def.wheelbase < def.length - 0.8, `${def.name}: wheels fall off the ends`);
    assert.ok(def.track + 0.13 < def.width + 0.03, `${def.name}: wheels stick out past the body`);
    assert.ok(Math.abs(def.upper.at(0)[0] + def.upper.at(-1)[0]) < 0.1, `${def.name}: nose and tail should balance`);
    for (const list of [def.upper, def.glass]) {
      for (let i = 1; i < list.length; i++) assert.ok(list[i][0] > list[i - 1][0], `${def.name}: profile must run nose to tail`);
    }
  }
  assert.equal(new Set(CARS.map((c) => JSON.stringify(c.tuning))).size, CARS.length);
});

test('garage navigation wraps, changes only the focused row and saves', () => {
  const state = createGarageState();
  assert.equal(state.row, 0);
  moveGarage(state, 0, -1);
  assert.equal(ROWS[state.row].key, 'graphics', 'up from the top wraps to the bottom');
  moveGarage(state, 0, 1);
  assert.equal(moveGarage(state, 1, 0), 'car');
  assert.equal(picked(state, 'car').id, CARS[1].id);
  moveGarage(state, -1, 0);
  moveGarage(state, -1, 0);
  assert.equal(picked(state, 'car').id, CARS.at(-1).id, 'left from the first car wraps');
  moveGarage(state, 0, 1);
  assert.equal(moveGarage(state, 1, 0), 'paint');
  assert.equal(picked(state, 'car').id, CARS.at(-1).id, 'other rows stay put');
  stepOption(state, 'place', 1);
  assert.equal(picked(state, 'place').id, 'pad');

  const again = createGarageState(JSON.parse(JSON.stringify(saveData(state))));
  for (const { key } of ROWS) assert.equal(picked(again, key).id, picked(state, key).id);
});

test('bad or missing saved data falls back safely', () => {
  const state = createGarageState({ car: 'not-a-car', paint: 12, glow: null });
  for (const { key } of ROWS) assert.ok(OPTIONS[key][state[key]], key);
  assert.equal(picked(createGarageState(null, true), 'graphics').id, 'low', 'phones start on low graphics');
  assert.equal(picked(createGarageState({ graphics: 'high' }, true), 'graphics').id, 'high', 'a saved choice wins');
});
