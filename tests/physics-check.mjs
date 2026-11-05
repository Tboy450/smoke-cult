// Headless handling check: `node tests/physics-check.mjs` (from the drift-sandbox folder).
// Drives a scripted flick drift on each assist preset and prints the drift angle every 0.5 s.
// Expected today: Arcade/Balanced hold roughly 35-60 deg hands-off; Off spins out (angle drops to 0).
import { CAR } from "../src/tuning.js";
import { createCar, stepCar, carAxes } from "../src/physics.js";
import assert from "node:assert/strict";

const dt = 1 / 240;
const run = (car, secs, ctl, every, log) => {
	for (let i = 0; i < secs / dt; i++) {
		stepCar(car, typeof ctl === "function" ? ctl(car) : ctl, CAR, dt);
		assert.ok([...car.pos, ...car.vel, ...car.quat, ...car.angVel, car.speed, car.driftAngle].every(Number.isFinite), "Physics must stay finite");
		if (log && i % every === 0) log(car);
	}
};
let failed = false;
for (const preset of ["Arcade", "Balanced", "Off"]) {
	const car = createCar(CAR, [0, 1, 0]);
	car.preset = preset;
	run(car, 1, { throttle: 0, brake: 0, steer: 0, handbrake: false });
	run(car, 4, { throttle: 1, brake: 0, steer: 0, handbrake: false });
	assert.ok(car.speed * 3.6 > 45, `${preset}: accelerates above 45 km/h in 4 s`);
	run(car, 0.4, { throttle: 0.3, brake: 0, steer: 1, handbrake: true });
	const angles = [];
	run(car, 4, { throttle: 0.85, brake: 0, steer: 0, handbrake: false }, 120, (c) => angles.push(Math.round(c.driftAngle)));
	const upright = carAxes(car).up[1] > 0.9;
	assert.ok(upright, `${preset}: stays upright`);
	if (preset !== "Off") {
		assert.ok(angles.slice(-4).every((a) => Math.abs(a) >= 30 && Math.abs(a) <= 65), `${preset}: must sustain a 30–65° drift`);
	}
	const beforeBrake = car.speed;
	run(car, 1, { throttle: 0, brake: 1, steer: 0, handbrake: false });
	assert.ok(car.speed < beforeBrake, `${preset}: brake reduces speed`);
	if (!upright || car.pos.some(Number.isNaN)) failed = true;
	console.log(preset.padEnd(9), angles.join(" "), `| ${Math.round(beforeBrake * 3.6)} km/h before braking, upright=${upright}`);
}
process.exit(failed ? 1 : 0);
