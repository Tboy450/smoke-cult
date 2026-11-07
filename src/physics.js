// Raycast drift-car physics with its own small rigid-body solver. No three.js in here, so it runs in Node
// for tests and ports to Roblox Luau almost line for line (see 3 Experiments\handling-prototype).
//
// Each corner: a spring pushes the body up, and a tire pushes it along the road. Drift comes from the rear
// tires losing grip past their peak slip angle, and from the "friction circle": rear tires putting down
// power have less grip left for cornering.

import { BODY_SIZE, DEFAULT_PRESET, PRESETS, WHEELS } from "./tuning.js";

export const GRAVITY = 9.81;

// --- tiny vector / quaternion helpers (arrays: [x, y, z] and [x, y, z, w]) ---
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => {
	const l = length(a);
	return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
};
const lerp = (a, b, t) => add(a, scale(sub(b, a), t));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function qMul(a, b) {
	return [
		a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
		a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
		a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
		a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
	];
}
const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
function qRotate(q, v) {
	const r = qMul(qMul(q, [v[0], v[1], v[2], 0]), qConj(q));
	return [r[0], r[1], r[2]];
}
function qNormalize(q) {
	const l = Math.hypot(q[0], q[1], q[2], q[3]);
	return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export function qFromYaw(yaw) {
	return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}
// Rotate a car-space direction around the car's up axis (used for steered front wheels).
const yawDir = (dir, angle) => {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return [dir[0] * c + dir[2] * s, dir[1], -dir[0] * s + dir[2] * c];
};

// Grip as a fraction of peak for a given tire slip angle: rises to 1 at the peak, then falls to slideRatio.
function gripCurve(slipDeg, peakDeg, slideDeg, slideRatio) {
	if (slipDeg < peakDeg) return slipDeg / peakDeg;
	if (slipDeg < slideDeg) return 1 + ((slideRatio - 1) * (slipDeg - peakDeg)) / (slideDeg - peakDeg);
	return slideRatio;
}

// The world: flat ground at height 0. Swap this for a heightfield or mesh raycast when maps arrive.
export const flatWorld = {
	raycast(origin, dir, maxDist) {
		if (dir[1] >= -1e-3) return null;
		const t = -origin[1] / dir[1];
		if (t < 0 || t > maxDist) return null;
		return { distance: t, position: add(origin, scale(dir, t)), normal: [0, 1, 0] };
	},
	groundHeight: () => 0,
};

export function createCar(tuning, position = [0, 1, 0], yaw = 0, wheels = WHEELS, body = BODY_SIZE) {
	return {
		pos: [...position],
		vel: [0, 0, 0],
		quat: qFromYaw(yaw),
		angVel: [0, 0, 0],
		steer: 0,
		steerAngle: 0,
		speed: 0,
		forwardSpeed: 0,
		drive: 0,
		burnout: false,
		driftAngle: 0, // degrees, signed: + = sliding with the tail out to the left
		grounded: false,
		preset: DEFAULT_PRESET,
		body,
		wheels: makeWheels(tuning, wheels),
	};
}

function makeWheels(tuning, defs) {
	return defs.map((def) => ({
		def,
		lastCompression: 0,
		spin: 0,
		wheelspin: 0,
		slip: 0,
		grounded: false,
		drop: tuning.SpringLength * (1 - tuning.StaticSag),
		contact: null,
	}));
}

// Swap the wheel positions and body size when the player picks another car.
export function fitCar(car, tuning, wheels, body) {
	car.wheels = makeWheels(tuning, wheels);
	car.body = body;
}

export function carToWorld(car, p) {
	return add(car.pos, qRotate(car.quat, p));
}
export function carAxes(car) {
	return {
		right: qRotate(car.quat, [1, 0, 0]),
		up: qRotate(car.quat, [0, 1, 0]),
		look: qRotate(car.quat, [0, 0, -1]),
	};
}

// One physics step. controls = { throttle 0-1, brake 0-1, steer -1..1 (right +), handbrake bool }.
export function stepCar(car, controls, c, dt, world = flatWorld) {
	const preset = PRESETS[car.preset] ?? PRESETS[DEFAULT_PRESET];
	const mass = c.Mass;
	const cornerMass = mass / 4;
	const { right: carRight, up, look } = carAxes(car);
	const localVel = qRotate(qConj(car.quat), car.vel);
	const forwardSpeed = -localVel[2];
	const speed = Math.hypot(localVel[0], localVel[2]);

	// Car slip angle (radians). Positive = travelling to the right of where the nose points.
	const beta = speed > 2.5 ? Math.atan2(localVel[0], Math.abs(forwardSpeed)) : 0;

	// Steering: player input, eased, with less lock at speed unless drifting, plus counter-steer assist.
	const lock = rad(c.MaxSteerDeg);
	const speedFactor = clamp(speed / c.TopSpeed, 0, 1);
	const slideSteer = clamp((Math.abs(beta) - rad(6)) / rad(12), 0, 1);
	const playerLock = lock * (1 - (1 - c.HighSpeedSteerScale) * speedFactor * (1 - slideSteer));
	car.steer += (controls.steer - car.steer) * Math.min(1, c.SteerSpeed * dt);
	const assist = car.grounded ? preset.Assist * beta * clamp((forwardSpeed - 2) / 1.5, 0, 1) : 0;
	car.steerAngle = clamp(car.steer * playerLock + assist, -lock, lock);

	let force = [0, -mass * GRAVITY, 0];
	let torque = [0, 0, 0];
	const addForceAt = (f, point) => {
		force = add(force, f);
		torque = add(torque, cross(sub(point, car.pos), f));
	};

	const springLength = c.SpringLength;
	const radius = c.WheelRadius;
	const rayLength = springLength + radius;
	const stiffness = (cornerMass * GRAVITY) / (c.StaticSag * springLength);
	const damping = c.Damping * 2 * Math.sqrt(stiffness * cornerMass);
	const powerBrake = controls.throttle > 0.25 && controls.brake > 0.25 ? clamp((5 - speed) / 2, 0, 1) : 0;
	const rollingBack = forwardSpeed < -0.5 && -forwardSpeed > Math.abs(localVel[0]);
	const reversing = controls.throttle <= 0.02 && controls.brake > 0 && forwardSpeed < 0.5 &&
		(speed < 1.5 || rollingBack || car.drive < 0);
	const drive = reversing ? -controls.brake : controls.throttle * (1 - controls.brake * (1 - powerBrake));
	const poweredHandbrake = controls.handbrake && Math.abs(drive) > 0.25 ? clamp((8 - speed) / 4, 0, 1) : 0;
	const burnout = Math.max(powerBrake, poweredHandbrake);
	const gearSpeed = Math.max(0, Math.sign(drive) * forwardSpeed);
	const gearLimit = reversing ? c.ReverseSpeed : c.TopSpeed;
	const room = clamp(1 - (gearSpeed / gearLimit) ** 1.25, 0, 1);
	const driveForce = drive * mass * c.EngineAccel * (reversing ? 0.76 : 1.06) * room / 2;
	const coasting = controls.throttle === 0 && controls.brake === 0;
	let groundedWheels = 0;

	for (const wheel of car.wheels) {
		const def = wheel.def;
		const mount = carToWorld(car, def.mount);
		const hit = world.raycast(mount, scale(up, -1), rayLength);
		wheel.grounded = !!hit;
		wheel.contact = hit ? hit.position : null;
		if (!hit) {
			wheel.lastCompression = 0;
			wheel.wheelspin = 0;
			wheel.slip = 0;
			wheel.drop = springLength;
			continue;
		}
		groundedWheels++;
		wheel.drop = hit.distance - radius;

		// Spring + damper.
		const compression = rayLength - hit.distance;
		const compressionSpeed = (compression - wheel.lastCompression) / dt;
		wheel.lastCompression = compression;
		const load = Math.max(0, stiffness * compression + damping * compressionSpeed);

		// Tire directions on the road surface.
		const n = hit.normal;
		const wheelLook = def.front ? qRotate(car.quat, yawDir([0, 0, -1], -car.steerAngle)) : look;
		const forward = normalize(sub(wheelLook, scale(n, dot(wheelLook, n))));
		const side = cross(forward, n);
		const velocity = add(car.vel, cross(car.angVel, sub(hit.position, car.pos)));
		const vLong = dot(velocity, forward);
		const vLat = dot(velocity, side);
		// Half the force that would stop this corner in one step; the full amount overshoots and jitters.
		const stopLong = (0.5 * Math.abs(vLong) * cornerMass) / dt;

		// Engine (rear-wheel drive), brakes, handbrake, rolling resistance.
		const rough = (1 - (hit.grip ?? 1)) * preset.SurfacePenalty; // 0 on the road
		let fLong = -vLong * cornerMass * (0.02 + rough * 0.6);
		if (coasting && !def.front) fLong -= sign(vLong) * Math.min(cornerMass * 1.2, stopLong); // engine braking
		if (!def.front) {
			fLong += driveForce;
			if (controls.handbrake) fLong -= sign(vLong) * Math.min(cornerMass * c.BrakeAccel * 0.8 * (1 - poweredHandbrake), stopLong);
		}
		if (controls.brake > 0 && !reversing) {
			// Brakes bite less on loose ground, even when there's grip to spare for cornering.
			const pedal = controls.brake * (def.front ? 1 : 1 - powerBrake);
			fLong -= sign(vLong) * Math.min(pedal * cornerMass * c.BrakeAccel * (1 - rough * 2), stopLong);
		}
		if (coasting && Math.abs(vLong) < 0.5) fLong -= sign(vLong) * stopLong; // parked cars stay parked

		// Friction circle: grip spent on power/braking is gone from cornering (but never all of it).
		let grip = (def.front ? c.FrontGrip : c.RearGrip) * (1 - rough);
		if (controls.handbrake && !def.front) grip *= c.HandbrakeGrip;
		if (!def.front) grip *= 1 - 0.45 * powerBrake;
		const maxForce = grip * load;
		fLong = clamp(fLong, -maxForce, maxForce);
		const used = maxForce > 0 ? fLong / maxForce : 0;
		const slipDeg = deg(Math.atan2(Math.abs(vLat), Math.max(Math.abs(vLong), 0.6)));
		const slideRatio = def.front ? c.FrontSlide : preset.RearSlide;
		const lateralMax =
			maxForce * Math.sqrt(Math.max(0.09, 1 - used * used)) *
			gripCurve(slipDeg, c.PeakSlipDeg, c.SlideSlipDeg, slideRatio);
		const fLat = -sign(vLat) * Math.min(lateralMax, (0.5 * Math.abs(vLat) * cornerMass) / dt);

		addForceAt(scale(up, load), mount);
		addForceAt(add(scale(forward, fLong), scale(side, fLat)), lerp(hit.position, mount, c.ForceHeight));

		if (!def.front) {
			const excess = Math.max(0, (Math.abs(driveForce) - maxForce) / (cornerMass * 1.6));
			const target = load > 0 ? Math.sign(drive) * Math.min(22, excess + 10 * burnout * Math.abs(drive)) : 0;
			wheel.wheelspin += (target - wheel.wheelspin) * Math.min(1, (drive ? 12 : 18) * dt);
		}
		wheel.spin += ((vLong + wheel.wheelspin) / radius) * dt;
		wheel.slip = Math.hypot(vLat, wheel.wheelspin);
	}

	car.grounded = groundedWheels >= 2;
	if (car.grounded) force = add(force, scale(up, -mass * c.Downforce * speed * speed));
	force = add(force, scale(car.vel, -0.4 * length(car.vel))); // air drag

	// Body scraping the ground (rollovers, big bumps): stiff spring + friction at the box corners.
	const [hx, hy, hz] = car.body.map((s) => s / 2);
	for (const sx of [-hx, hx])
		for (const sy of [-hy, hy])
			for (const sz of [-hz, hz]) {
				const p = carToWorld(car, [sx, sy, sz]);
				const ground = world.groundHeight(p[0], p[2]);
				if (p[1] >= ground) continue;
				const vp = add(car.vel, cross(car.angVel, sub(p, car.pos)));
				const normalForce = Math.max(0, mass * (300 * (ground - p[1]) - 25 * vp[1]));
				const slide = [vp[0], 0, vp[2]];
				const friction = scale(normalize(slide), -Math.min(0.5 * normalForce, (length(slide) * mass) / 8 / dt));
				addForceAt(add([0, normalForce, 0], friction), p);
			}

	// Integrate (semi-implicit Euler). Inertia of a solid box, in car space.
	const [sx, sy, sz] = car.body;
	const inertia = [(mass * (sy * sy + sz * sz)) / 12, (mass * (sx * sx + sz * sz)) / 12, (mass * (sx * sx + sy * sy)) / 12];
	car.vel = add(car.vel, scale(force, dt / mass));
	const localTorque = qRotate(qConj(car.quat), torque);
	let localAng = qRotate(qConj(car.quat), car.angVel);
	localAng = localAng.map((w, i) => w + (localTorque[i] / inertia[i]) * dt);
	car.angVel = qRotate(car.quat, localAng);

	// Spin guard: past the preset's angle, slow down rotation that would spin the car out.
	const yaw = dot(car.angVel, up);
	if (car.grounded && forwardSpeed > 0 && preset.SpinGuard > 0 && Math.abs(beta) > rad(preset.SpinGuardDeg) && beta * yaw > 0) {
		car.angVel = sub(car.angVel, scale(up, yaw * Math.min(1, preset.SpinGuard * dt)));
	}

	car.pos = add(car.pos, scale(car.vel, dt));
	const w = car.angVel;
	const dq = qMul([w[0], w[1], w[2], 0], car.quat);
	car.quat = qNormalize(car.quat.map((q, i) => q + 0.5 * dt * dq[i]));

	car.speed = speed;
	car.forwardSpeed = forwardSpeed;
	car.drive = drive;
	car.burnout = burnout > 0.25 && car.grounded;
	car.driftAngle = speed > 4 && forwardSpeed > 0 ? deg(beta) : 0;
	car.lateral = carRight; // for visuals
}

// Set the car down at a spot, stopped and on its wheels.
export function placeCar(car, x, z, yaw) {
	car.pos = [x, 1, z];
	car.vel = [0, 0, 0];
	car.angVel = [0, 0, 0];
	car.quat = qFromYaw(yaw);
	car.steer = 0;
	car.steerAngle = 0;
	car.speed = car.forwardSpeed = car.driftAngle = car.drive = 0;
	car.grounded = car.burnout = false;
	for (const wheel of car.wheels) {
		wheel.lastCompression = wheel.wheelspin = wheel.slip = 0;
		wheel.contact = null;
		wheel.grounded = false;
	}
}

// Put the car back on its wheels, facing the way it was roughly pointing.
export function resetCar(car, tuning) {
	const { look } = carAxes(car);
	const yaw = Math.atan2(-look[0], -look[2]);
	placeCar(car, car.pos[0], car.pos[2], Math.abs(look[0]) + Math.abs(look[2]) > 0.1 ? yaw : 0);
}
