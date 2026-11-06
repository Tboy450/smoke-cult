// A simple AI driver for tests. It follows the centre line and slows for what's ahead. With drift on, it throws the
// car into corners with the handbrake. It's a measuring tool, not a good driver.

import { carAxes, stepCar } from '../../src/physics.js';
import { collideCar, nearestSample, stepLap } from '../../src/track.js';

const dt = 1 / 240;

export function aiControls(car, track, index, { pace = 7, topSpeed = 32, drift = false } = {}) {
  const speed = Math.hypot(car.vel[0], car.vel[2]);
  const aim = track.samples[(index + 4 + Math.round(speed / 5)) % track.count];
  let tight = 0;
  for (let j = 0; j < 30; j++) tight = Math.max(tight, Math.abs(track.samples[(index + j) % track.count].curve));
  const target = Math.min(topSpeed, Math.sqrt(pace / Math.max(tight, 0.004)));
  const { look, right } = carAxes(car);
  const dx = aim.x - car.pos[0];
  const dz = aim.z - car.pos[2];
  const error = Math.atan2(dx * right[0] + dz * right[2], dx * look[0] + dz * look[2]);
  const corner = Math.abs(track.samples[(index + 6) % track.count].curve) > 0.018;
  return {
    steer: Math.max(-1, Math.min(1, error * 2.2)),
    throttle: speed < target ? (drift && corner ? 1 : 0.75) : 0,
    brake: speed > target + 2 ? 0.6 : 0,
    handbrake: drift && corner && Math.abs(car.driftAngle) < 14 && speed > 16,
  };
}

// Run the AI for up to `seconds`. onStep(event) can return true to stop early. Returns the hardest wall hit.
export function drive(car, tuning, track, world, lap, seconds, options = {}, onStep = () => {}) {
  let worstImpact = 0;
  for (let i = 0; i < seconds / dt; i++) {
    const { index } = nearestSample(track, car.pos[0], car.pos[2], lap.index);
    stepCar(car, aiControls(car, track, index, options), tuning, dt, world);
    const hit = collideCar(car, world, tuning.Mass);
    if (hit) worstImpact = Math.max(worstImpact, hit.impact);
    const speed = Math.hypot(car.vel[0], car.vel[2]);
    const event = i % 8 === 0 ? stepLap(lap, track, car.pos[0], car.pos[2], speed, dt * 8, options.earned?.() ?? 0) : null;
    if (onStep(event, hit) === true) break;
  }
  return worstImpact;
}
