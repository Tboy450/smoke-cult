import { carAxes } from "./physics.js";

const RAIL_POINTS = 200;
const RAIL_HOLD = 0.55;
const RAIL_COOLDOWN = 1;
const REVERSE_LIMIT = 22;
const GATE_TOLERANCE = 12;

export function createTougeRun(course, spawn = course.spawn) {
	const { s } = course.nearest(spawn.x, spawn.z);
	return {
		status: "ready", reason: "", time: 0, score: 0, startScore: 0,
		nextGate: 0, lastGate: -1, s, maxS: s, progress: 0,
		previousX: spawn.x, previousZ: spawn.z,
		railTime: 0, railSide: 0, railCooldown: 0, bonusGate: -1,
	};
}

function invalidate(run, reason) {
	run.status = "invalid";
	run.reason = reason;
	return { type: "void", reason };
}

// Intersect the car's movement with the physical gate plane, keeping only forward crossings within the rails.
function gateCrossing(gate, course, fromX, fromZ, x, z) {
	const before = (fromX - gate.x) * gate.tx + (fromZ - gate.z) * gate.tz;
	const after = (x - gate.x) * gate.tx + (z - gate.z) * gate.tz;
	if (before >= 0 || after < 0) return null;
	const fraction = -before / (after - before);
	const crossingX = fromX + (x - fromX) * fraction;
	const crossingZ = fromZ + (z - fromZ) * fraction;
	const lateral = (crossingX - gate.x) * gate.rx + (crossingZ - gate.z) * gate.rz;
	return Math.abs(lateral) <= course.railOffset ? fraction : null;
}

function nearRail(car, course, position) {
	const { right, look } = carAxes(car);
	const { rx, rz } = course.samples[position.index];
	// The outside corner matters during a drift. A centre-only check rewards cars still well away from the rail.
	const width = Math.abs(right[0] * rx + right[2] * rz) * car.body[0];
	const length = Math.abs(look[0] * rx + look[2] * rz) * car.body[2];
	const clearance = course.railOffset - Math.abs(position.lateral) - (width + length) / 2;
	return clearance >= 0.35 && clearance <= 1.75;
}

// scoreNow is banked + pending points, so a combo can carry across gates without counting earlier points again.
// Return one event for each noteworthy change, or null. The caller applies rail bonuses through the combo scorer.
export function stepTougeRun(run, course, car, dt, scoreNow, { touchedRail = false, comboActive = true } = {}) {
	if (run.status === "invalid" || run.status === "finished" || !Number.isFinite(dt) || dt <= 0) return null;
	const [x, , z] = car.pos;
	if (!Number.isFinite(x) || !Number.isFinite(z)) return invalidate(run, "Car recovered");
	const fromX = run.previousX;
	const fromZ = run.previousZ;
	const position = course.nearest(x, z);
	const forward = position.s - run.s;
	const movement = Math.hypot(x - fromX, z - fromZ);
	const speed = Number.isFinite(car.speed) ? car.speed : 0;
	run.previousX = x;
	run.previousZ = z;
	run.s = position.s;
	if (movement > Math.max(5, speed * dt * 2 + 3) || Math.abs(forward) > Math.max(12, movement * 4 + 5)) {
		return invalidate(run, "Route shortcut");
	}
	if (run.status === "running" && position.distance > course.railOffset + 1.5) {
		return invalidate(run, "Left the route");
	}
	run.maxS = Math.max(run.maxS, position.s);
	if (run.status === "running" && run.maxS - position.s > REVERSE_LIMIT) return invalidate(run, "Wrong way");
	const points = Number.isFinite(scoreNow) ? Math.max(0, Math.floor(scoreNow)) : 0;
	const start = course.samples[course.gates[0].index].s;
	const end = course.samples[course.gates.at(-1).index].s;
	if (run.status === "running") {
		run.time += dt;
		run.score = Math.max(0, points - run.startScore);
		run.progress = Math.min(1, Math.max(0, (position.s - start) / (end - start)));
	}
	run.railCooldown = touchedRail ? RAIL_COOLDOWN : Math.max(0, run.railCooldown - dt);

	const gateIndex = run.nextGate;
	const gate = course.gates[gateIndex];
	const sample = course.samples[gate.index];
	const crossing = gateCrossing(sample, course, fromX, fromZ, x, z);
	if (crossing !== null) {
		run.lastGate = gateIndex;
		run.nextGate++;
		run.railTime = 0;
		if (gateIndex === 0) {
			run.status = "running";
			run.startScore = points;
			run.time = dt * (1 - crossing);
			return { type: "start" };
		}
		if (run.nextGate === course.gates.length) {
			run.status = "finished";
			run.progress = 1;
			run.time -= dt * (1 - crossing);
			return { type: "finish", time: run.time, score: run.score };
		}
		return { type: "checkpoint", index: gateIndex, label: gate.label, time: run.time };
	}
	if (position.s > sample.s + GATE_TOLERANCE) return invalidate(run, `Missed ${gate.label}`);

	const angle = Math.abs(car.driftAngle);
	if (run.status !== "running" || !comboActive || run.railCooldown > 0 || run.bonusGate === run.nextGate ||
		!car.grounded || speed < 9 || !(angle >= 20 && angle <= 70) || forward <= 0 || !nearRail(car, course, position)) {
		run.railTime = 0;
		return null;
	}
	const side = Math.sign(position.lateral);
	if (side !== run.railSide) run.railTime = 0;
	run.railSide = side;
	run.railTime += dt;
	if (run.railTime < RAIL_HOLD) return null;
	run.bonusGate = run.nextGate;
	return { type: "rail", points: RAIL_POINTS };
}
