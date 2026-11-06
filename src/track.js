// Rustline Yard: an original circuit wrapped around the test pad. No graphics in here, so the layout, walls, surfaces
// and lap rules can be tested in Node. yard.js draws what this file describes.
//
// The car's nose points toward -Z, so "right" of travel direction (tx, tz) is (-tz, tx).

import { carToWorld, flatWorld } from "./physics.js";

export const ROAD_WIDTH = 15;
const RUNOFF = 9; // gravel between the road edge and the outer wall
const STEP = 3; // metres between track samples
const CELL = 16; // collision grid
const SURFACE_CELL = 4;
const WORLD_HALF = 500;
const DIRT_GRIP = 0.72;

// Start straight, fast kink, north hairpin, esses, west sweepers, south hairpin, back to the start.
const CONTROL = [
	[150, 120], [150, 20], [150, -70], [172, -150], [125, -222], [35, -190], [-30, -228], [-112, -188], [-192, -222],
	[-246, -140], [-198, -72], [-252, 8], [-236, 112], [-162, 176], [-92, 142], [-22, 198], [68, 226], [136, 196],
];

export const PAD = { minX: -112, maxX: 82, minZ: -92, maxZ: 112 };
export const PADDOCK = { minX: 82, maxX: 146, minZ: -12, maxZ: 56 };
// The Smokehouse: the garage and hangout. Its open side faces the track, so you can drive in and out.
export const GARAGE = { x: 106, z: 22, halfX: 13, halfZ: 11 };

// The bay in the middle of the floor. Slowing down here opens the garage.
export const inGarageBay = (x, z) => Math.abs(x - GARAGE.x) < 7 && Math.abs(z - GARAGE.z) < 6;

// Solid blocks in the infield: [centre x, centre z, half x, half z, turn in radians].
const INFIELD_BLOCKS = [
	[-172, -118, 6.1, 1.3, 0.5], [-160, -103, 6.1, 1.3, 0.5], [-172, 60, 1.3, 6.1, 0.1], [-185, 70, 1.3, 6.1, 0.1],
	[100, -135, 6.1, 1.3, -0.3], [88, -120, 6.1, 1.3, -0.3], [12, 160, 6.1, 1.3, 0.05],
];

function catmull(a, b, c, d, t) {
	const t2 = t * t;
	const t3 = t2 * t;
	return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
}

function wrap(i, n) {
	return ((i % n) + n) % n;
}

function resample(points, step) {
	const dense = [];
	const n = points.length;
	for (let i = 0; i < n; i++) {
		const [a, b, c, d] = [points[wrap(i - 1, n)], points[i], points[wrap(i + 1, n)], points[wrap(i + 2, n)]];
		for (let k = 0; k < 60; k++) {
			const t = k / 60;
			dense.push([catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t)]);
		}
	}
	let total = 0;
	const lengths = dense.map((p, i) => {
		const q = dense[(i + 1) % dense.length];
		const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
		total += l;
		return l;
	});
	const count = Math.round(total / step);
	const spacing = total / count;
	const out = [];
	let at = 0;
	let walked = 0;
	for (let i = 0; i < count; i++) {
		const want = i * spacing;
		while (walked + lengths[at] < want) walked += lengths[at++];
		const f = (want - walked) / lengths[at];
		const p = dense[at];
		const q = dense[(at + 1) % dense.length];
		out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
	}
	return { points: out, length: total };
}

export function buildTrack() {
	const { points, length } = resample(CONTROL, STEP);
	const n = points.length;
	const samples = points.map(([x, z], i) => {
		const a = points[wrap(i - 2, n)];
		const b = points[wrap(i + 2, n)];
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const tx = (b[0] - a[0]) / l;
		const tz = (b[1] - a[1]) / l;
		return { x, z, tx, tz, rx: -tz, rz: tx, s: (i / n) * length, curve: 0 };
	});
	// Curvature, positive when the road bends right. Averaged so one sample can't spike it.
	for (let i = 0; i < n; i++) {
		const a = samples[wrap(i - 4, n)];
		const b = samples[wrap(i + 4, n)];
		const turn = Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz);
		samples[i].curve = turn / (8 * (length / n));
	}
	// With this road's direction, is the outside of the loop to the right (+1) or left (-1)?
	const mid = samples[0];
	const centre = samples.reduce((c, p) => [c[0] + p.x / n, c[1] + p.z / n], [0, 0]);
	const outer = (mid.x - centre[0]) * mid.rx + (mid.z - centre[1]) * mid.rz > 0 ? 1 : -1;

	const distanceToRoad = (x, z) => {
		let best = Infinity;
		for (const p of samples) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
		return Math.sqrt(best);
	};

	// Outer wall: one closed line. Where the offset folds over itself in a tight corner, those points are skipped.
	const offset = ROAD_WIDTH / 2 + RUNOFF;
	const wall = [];
	for (const p of samples) {
		const x = p.x + p.rx * outer * offset;
		const z = p.z + p.rz * outer * offset;
		if (distanceToRoad(x, z) >= offset - 0.75) wall.push([x, z]);
	}
	const walls = wall.map(([ax, az], i) => {
		const [bx, bz] = wall[(i + 1) % wall.length];
		const l = Math.hypot(bx - ax, bz - az) || 1;
		return { ax, az, bx, bz, nx: -(bz - az) / l, nz: (bx - ax) / l, length: l };
	});
	// Each wall's safe side must face the road. Check one and flip them all to match.
	const test = walls[0];
	const probe = [(test.ax + test.bx) / 2 + test.nx, (test.az + test.bz) / 2 + test.nz];
	if (distanceToRoad(probe[0], probe[1]) > offset) {
		for (const w of walls) {
			w.nx *= -1;
			w.nz *= -1;
		}
	}

	// Clip zones: the outside of the sharpest corners. Passing through while drifting pays a bonus.
	const peaks = [];
	for (let i = 0; i < n; i++) {
		const k = Math.abs(samples[i].curve);
		let isPeak = k > 0.012;
		for (let j = -8; j <= 8 && isPeak; j++) if (Math.abs(samples[wrap(i + j, n)].curve) > k) isPeak = false;
		if (isPeak) peaks.push({ i, k });
	}
	const zones = peaks
		.sort((a, b) => b.k - a.k)
		.reduce((picked, p) => {
			const apart = picked.every((q) => Math.min(wrap(p.i - q.i, n), wrap(q.i - p.i, n)) > 18);
			return picked.length < 6 && apart ? [...picked, p] : picked;
		}, [])
		.sort((a, b) => a.i - b.i)
		.map((p, id) => ({ id, from: wrap(p.i - 6, n), to: wrap(p.i + 6, n), apex: p.i, side: -Math.sign(samples[p.i].curve) }));

	// Tire walls on the inside of the same corners, a few metres off the road. Solid from both sides.
	const blocks = INFIELD_BLOCKS.map(([x, z, hx, hz, turn]) => ({ x, z, hx, hz, turn, kind: "container" }));
	for (const [x, z, hx, hz] of [
		[GARAGE.x - GARAGE.halfX, GARAGE.z, 0.35, GARAGE.halfZ],
		[GARAGE.x, GARAGE.z - GARAGE.halfZ, GARAGE.halfX, 0.35],
		[GARAGE.x, GARAGE.z + GARAGE.halfZ, GARAGE.halfX, 0.35],
		[GARAGE.x - 9.6, GARAGE.z + 8.4, 3.2, 2.4], // the hangout corner: sofas and the fire drum
		[GARAGE.x - 12.2, GARAGE.z - 5.4, 0.7, 4.2], // tool chests and spare tires along the back wall
	]) blocks.push({ x, z, hx, hz, turn: 0, kind: "garage" });
	for (const zone of zones) {
		for (let j = -5; j <= 5; j += 2) {
			const p = samples[wrap(zone.apex + j, n)];
			const off = -zone.side * (ROAD_WIDTH / 2 + 2.6);
			const x = p.x + p.rx * off;
			const z = p.z + p.rz * off;
			if (distanceToRoad(x, z) < ROAD_WIDTH / 2 + 1.6) continue;
			blocks.push({ x, z, hx: 3.2, hz: 0.65, turn: Math.atan2(-p.tz, p.tx), kind: "tires" });
		}
	}
	for (const b of blocks) {
		b.cos = Math.cos(b.turn);
		b.sin = Math.sin(b.turn);
	}

	// Start a little behind the line, so the first crossing starts the lap timer.
	const start = samples[n - 8];
	return {
		samples, length, count: n, outer, walls, blocks, zones,
		spawn: { x: start.x, z: start.z, yaw: Math.atan2(-start.tx, -start.tz) },
		padSpawn: { x: 0, z: 30, yaw: 0 },
		distanceToRoad,
	};
}

// Closest track sample. With a hint, only nearby samples are checked.
export function nearestSample(track, x, z, hint = null) {
	const n = track.count;
	let best = -1;
	let bestD = Infinity;
	const check = (i) => {
		const p = track.samples[i];
		const d = (p.x - x) ** 2 + (p.z - z) ** 2;
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	};
	if (hint === null) for (let i = 0; i < n; i++) check(i);
	else for (let j = -36; j <= 36; j++) check(wrap(hint + j, n));
	return { index: best, distance: Math.sqrt(bestD) };
}

function buildSurfaceGrid(track) {
	const size = (WORLD_HALF * 2) / SURFACE_CELL;
	const grid = new Uint8Array(size * size);
	const mark = (x, z) => {
		const cx = Math.floor((x + WORLD_HALF) / SURFACE_CELL);
		const cz = Math.floor((z + WORLD_HALF) / SURFACE_CELL);
		if (cx >= 0 && cz >= 0 && cx < size && cz < size) grid[cz * size + cx] = 1;
	};
	const reach = ROAD_WIDTH / 2 + 0.5;
	for (const p of track.samples) {
		for (let a = -reach; a <= reach; a += SURFACE_CELL / 2) {
			for (let b = -2; b <= 2; b += 2) mark(p.x + p.rx * a + p.tx * b, p.z + p.rz * a + p.tz * b);
		}
	}
	for (const r of [PAD, PADDOCK]) {
		for (let x = r.minX; x <= r.maxX; x += SURFACE_CELL) for (let z = r.minZ; z <= r.maxZ; z += SURFACE_CELL) mark(x, z);
	}
	return { grid, size };
}

function buildContactGrid(track) {
	const cells = new Map();
	const add = (x, z, item) => {
		const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
		if (!cells.has(key)) cells.set(key, new Set());
		cells.get(key).add(item);
	};
	const spread = (x, z, reach, item) => {
		for (let a = -reach; a <= reach + CELL; a += CELL) for (let b = -reach; b <= reach + CELL; b += CELL) add(x + a, z + b, item);
	};
	for (const w of track.walls) {
		const steps = Math.ceil(w.length / (CELL / 2));
		for (let i = 0; i <= steps; i++) spread(w.ax + ((w.bx - w.ax) * i) / steps, w.az + ((w.bz - w.az) * i) / steps, 4, w);
	}
	for (const b of track.blocks) spread(b.x, b.z, Math.hypot(b.hx, b.hz) + 4, b);
	return cells;
}

const CONTACT_RADIUS = 0.3;

// Is this point pushing into anything? Returns the deepest contact, or null.
function contactAt(cells, x, z) {
	const nearby = cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
	if (!nearby) return null;
	let best = null;
	for (const item of nearby) {
		let hit = null;
		if (item.ax !== undefined) {
			const ex = item.bx - item.ax;
			const ez = item.bz - item.az;
			const along = ((x - item.ax) * ex + (z - item.az) * ez) / (item.length * item.length);
			const signed = (x - item.ax) * item.nx + (z - item.az) * item.nz;
			// The window behind the wall is wider than one physics step at top speed, so nothing tunnels through.
			if (along >= -0.02 && along <= 1.02 && signed < CONTACT_RADIUS && signed > -3) {
				hit = { nx: item.nx, nz: item.nz, depth: CONTACT_RADIUS - signed };
			}
		} else {
			const lx = (x - item.x) * item.cos - (z - item.z) * item.sin;
			const lz = (x - item.x) * item.sin + (z - item.z) * item.cos;
			const dx = Math.abs(lx) - item.hx;
			const dz = Math.abs(lz) - item.hz;
			if (dx < CONTACT_RADIUS && dz < CONTACT_RADIUS) {
				const useX = dx > dz;
				const sx = useX ? Math.sign(lx) || 1 : 0;
				const sz = useX ? 0 : Math.sign(lz) || 1;
				hit = {
					nx: sx * item.cos + sz * item.sin,
					nz: -sx * item.sin + sz * item.cos,
					depth: CONTACT_RADIUS - (useX ? dx : dz),
				};
			}
		}
		if (hit && (!best || hit.depth > best.depth)) best = hit;
	}
	return best;
}

export function createTrackWorld(track) {
	const surface = buildSurfaceGrid(track);
	const cells = buildContactGrid(track);
	const gripAt = (x, z) => {
		const cx = Math.floor((x + WORLD_HALF) / SURFACE_CELL);
		const cz = Math.floor((z + WORLD_HALF) / SURFACE_CELL);
		if (cx < 0 || cz < 0 || cx >= surface.size || cz >= surface.size) return DIRT_GRIP;
		return surface.grid[cz * surface.size + cx] ? 1 : DIRT_GRIP;
	};
	return {
		track,
		gripAt,
		groundHeight: flatWorld.groundHeight,
		raycast(origin, dir, maxDist) {
			const hit = flatWorld.raycast(origin, dir, maxDist);
			if (hit) hit.grip = gripAt(hit.position[0], hit.position[2]);
			return hit;
		},
		contact: (x, z) => contactAt(cells, x, z),
	};
}

// Stop the car at walls and solid blocks. Returns { impact (m/s into the wall), x, z }, or null if nothing touched.
export function collideCar(car, world, mass) {
	const [sx, , sz] = car.body;
	const hx = sx / 2;
	const hz = sz / 2;
	let best = null;
	for (const [px, pz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [-hx, 0], [hx, 0], [0, -hz], [0, hz]]) {
		const p = carToWorld(car, [px, 0, pz]);
		const hit = world.contact(p[0], p[2]);
		if (hit && (!best || hit.depth > best.hit.depth)) best = { hit, p };
	}
	if (!best) return null;
	const { hit, p } = best;
	car.pos[0] += hit.nx * hit.depth;
	car.pos[2] += hit.nz * hit.depth;

	const rx = p[0] - car.pos[0];
	const rz = p[2] - car.pos[2];
	const w = car.angVel[1];
	// Velocity of the touching point: linear plus spin (around the up axis only).
	const vx = car.vel[0] + w * rz;
	const vz = car.vel[2] - w * rx;
	const into = vx * hit.nx + vz * hit.nz;
	if (into >= 0) return { impact: 0, x: p[0], z: p[2] };

	const inertia = (mass * (sx * sx + sz * sz)) / 12;
	const lever = rz * hit.nx - rx * hit.nz;
	const j = (-(1 + 0.15) * into) / (1 / mass + (lever * lever) / inertia);
	// A little wall friction along the surface, so a scrape costs speed.
	const tx = -hit.nz;
	const tz = hit.nx;
	const slide = vx * tx + vz * tz;
	const leverT = rz * tx - rx * tz;
	const limit = Math.abs(slide) / (1 / mass + (leverT * leverT) / inertia);
	const f = -Math.sign(slide) * Math.min(0.2 * j, limit);
	const fx = hit.nx * j + tx * f;
	const fz = hit.nz * j + tz * f;
	car.vel[0] += fx / mass;
	car.vel[2] += fz / mass;
	car.angVel[1] += (rz * fx - rx * fz) / inertia;
	return { impact: -into, x: p[0], z: p[2] };
}

// --- laps ---
export function createLap() {
	return { index: 0, travel: 0, running: false, valid: true, lap: 0, time: 0, last: null, best: null,
		lastScore: 0, bestScore: 0, startTotal: 0, backward: 0, wrongWay: false, zonesDone: new Set() };
}

// Forget the current lap, for resets and leaving the garage. Best times stay.
export function resetLap(lap, track, x, z) {
	lap.index = nearestSample(track, x, z).index;
	Object.assign(lap, { travel: 0, running: false, valid: true, time: 0, backward: 0, wrongWay: false });
	lap.zonesDone.clear();
}

// Advance the lap from the car's position. Returns "lap" when a clean lap finishes, "void" when a cut lap reaches the line.
// earned is all points so far, including a combo still running.
export function stepLap(lap, track, x, z, speed, dt, earned = 0) {
	const n = track.count;
	let near = nearestSample(track, x, z, lap.index);
	if (near.distance > ROAD_WIDTH * 1.5) near = nearestSample(track, x, z); // driven in from the infield: find the road again
	const { index, distance } = near;
	let delta = wrap(index - lap.index, n);
	if (delta > n / 2) delta -= n;
	lap.index = index;
	if (lap.running) lap.time += dt;
	if (Math.abs(delta) > 40) {
		lap.valid = false; // jumped along the track, so part of the lap was skipped
		return null;
	}
	// Going the wrong way only counts when you're actually on the road.
	lap.backward = delta < 0 && distance < ROAD_WIDTH ? lap.backward + dt : delta > 0 ? 0 : lap.backward;
	lap.wrongWay = lap.backward > 0.8 && speed > 4;

	if (distance > ROAD_WIDTH / 2 + 34) lap.valid = false; // well off the road: you took a shortcut
	const crossed = delta > 0 && index < delta;
	lap.travel += delta;
	if (!crossed) return null;
	const complete = lap.running && lap.travel >= n * 0.97;
	const clean = complete && lap.valid;
	if (clean) {
		lap.lap++;
		lap.last = lap.time;
		lap.best = lap.best === null ? lap.time : Math.min(lap.best, lap.time);
		lap.lastScore = Math.max(0, earned - lap.startTotal); // a lost combo can take back points counted last lap
		lap.bestScore = Math.max(lap.bestScore, lap.lastScore);
	}
	const event = clean ? "lap" : lap.running ? "void" : null;
	Object.assign(lap, { running: true, valid: true, travel: 0, time: 0, startTotal: earned });
	lap.zonesDone.clear();
	return event;
}

// Which unclaimed clip zone is the car in, if any? Zones sit on the outside half of the road.
export function zoneAt(lap, track, x, z) {
	const n = track.count;
	const p = track.samples[lap.index];
	for (const zone of track.zones) {
		if (lap.zonesDone.has(zone.id) || wrap(lap.index - zone.from, n) > wrap(zone.to - zone.from, n)) continue;
		const lateral = ((x - p.x) * p.rx + (z - p.z) * p.rz) * zone.side;
		if (lateral > 1.5 && lateral < ROAD_WIDTH / 2 + 2.5) return zone;
	}
	return null;
}
