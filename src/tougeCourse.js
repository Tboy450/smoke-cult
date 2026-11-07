import { createTrackContact } from "./track.js";

const START_X = -60;
const START_Z = -145;
const START_HEIGHT = 52;
const GRADE = 0.14;
const DIAGONAL = 0.24;
const HALF_WIDTH = 6.5;
const RAIL_OFFSET = 8.2;
const SAMPLE_STEP = 2;
const GRID_SIZE = 16;
const SEARCH_REACH = 18;

const groundHeight = (_x, z) => START_HEIGHT - GRADE * (z - START_Z);
const upLength = Math.hypot(1, GRADE);
const up = Object.freeze([0, 1 / upLength, GRADE / upLength]);

function wallBetween(ax, az, bx, bz, insideX, insideZ) {
	const length = Math.hypot(bx - ax, bz - az);
	let nx = -(bz - az) / length;
	let nz = (bx - ax) / length;
	if ((insideX - ax) * nx + (insideZ - az) * nz < 0) {
		nx = -nx;
		nz = -nz;
	}
	return { ax, az, bx, bz, nx, nz, length };
}

function buildRails(samples) {
	const walls = [];
	for (const side of [-1, 1]) {
		const offset = side * RAIL_OFFSET;
		for (let i = 1; i < samples.length; i++) {
			const a = samples[i - 1];
			const b = samples[i];
			walls.push(wallBetween(a.x + a.rx * offset, a.z + a.rz * offset,
				b.x + b.rx * offset, b.z + b.rz * offset, (a.x + b.x) / 2, (a.z + b.z) / 2));
		}
	}
	for (const [end, neighbour] of [[samples[0], samples[1]], [samples.at(-1), samples.at(-2)]]) {
		walls.push(wallBetween(end.x - end.rx * RAIL_OFFSET, end.z - end.rz * RAIL_OFFSET,
			end.x + end.rx * RAIL_OFFSET, end.z + end.rz * RAIL_OFFSET, neighbour.x, neighbour.z));
	}
	return walls;
}

function createRoadQueries(samples) {
	const cells = new Map();
	const segments = samples.slice(1).map((b, index) => {
		const a = samples[index];
		const dx = b.x - a.x;
		const dz = b.z - a.z;
		const length = Math.hypot(dx, dz);
		const segment = { a, b, dx, dz, length, index };
		const minX = Math.floor((Math.min(a.x, b.x) - SEARCH_REACH) / GRID_SIZE);
		const maxX = Math.floor((Math.max(a.x, b.x) + SEARCH_REACH) / GRID_SIZE);
		const minZ = Math.floor((Math.min(a.z, b.z) - SEARCH_REACH) / GRID_SIZE);
		const maxZ = Math.floor((Math.max(a.z, b.z) + SEARCH_REACH) / GRID_SIZE);
		for (let x = minX; x <= maxX; x++) {
			for (let z = minZ; z <= maxZ; z++) {
				const key = `${x},${z}`;
				if (!cells.has(key)) cells.set(key, []);
				cells.get(key).push(segment);
			}
		}
		return segment;
	});
	const nearby = (x, z) => cells.get(`${Math.floor(x / GRID_SIZE)},${Math.floor(z / GRID_SIZE)}`);
	function closest(x, z, candidates) {
		let best;
		let bestSquared = Infinity;
		let fraction = 0;
		for (const segment of candidates) {
			const { a, dx, dz, length } = segment;
			const offsetX = x - a.x;
			const offsetZ = z - a.z;
			const t = Math.max(0, Math.min(1, (offsetX * dx + offsetZ * dz) / (length * length)));
			const squared = (offsetX - dx * t) ** 2 + (offsetZ - dz * t) ** 2;
			if (squared >= bestSquared) continue;
			best = segment;
			bestSquared = squared;
			fraction = t;
		}
		const { a, b, dx, dz, length, index } = best;
		const tx = dx / length;
		const tz = dz / length;
		return {
			s: a.s + (b.s - a.s) * fraction,
			lateral: (z - a.z) * tx - (x - a.x) * tz,
			distance: Math.sqrt(bestSquared),
			index: fraction < 0.5 ? index : index + 1,
			tx,
			tz,
		};
	}
	return {
		nearest(x, z) {
			const local = nearby(x, z);
			const hit = local && closest(x, z, local);
			return hit && hit.distance <= SEARCH_REACH ? hit : closest(x, z, segments);
		},
		gripAt(x, z) {
			const local = nearby(x, z);
			return local && closest(x, z, local).distance <= HALF_WIDTH ? 1 : 0.72;
		},
	};
}

export function buildTougeCourse() {
	const samples = [];
	const gates = [];
	let heading = DIAGONAL;
	function append(x, z, s, direction, curve = 0) {
		const tx = Math.cos(direction);
		const tz = Math.sin(direction);
		samples.push({ x, y: groundHeight(x, z), z, s, tx, tz, rx: -tz, rz: tx, curve });
	}
	function straight(length) {
		const from = samples.at(-1);
		const count = Math.ceil(length / SAMPLE_STEP);
		for (let i = 1; i <= count; i++) {
			const s = length * i / count;
			append(from.x + from.tx * s, from.z + from.tz * s, from.s + s, heading);
		}
	}
	function hairpin(radius, nextHeading) {
		const from = samples.at(-1);
		const turn = nextHeading - heading;
		const length = Math.abs(turn) * radius;
		const curvature = turn / length;
		const count = Math.ceil(length / SAMPLE_STEP);
		for (let i = 1; i <= count; i++) {
			const direction = heading + turn * i / count;
			const x = from.x + (Math.sin(direction) - Math.sin(heading)) / curvature;
			const z = from.z + (Math.cos(heading) - Math.cos(direction)) / curvature;
			append(x, z, from.s + length * i / count, direction, curvature);
		}
		heading = nextHeading;
	}
	const gate = (label) => gates.push({ index: samples.length - 1, label });
	append(START_X, START_Z, 0, heading);
	straight(8);
	const spawnPoint = samples.at(-1);
	const spawn = { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z, s: spawnPoint.s,
		yaw: Math.atan2(-spawnPoint.tx, -spawnPoint.tz) };
	straight(16);
	gate("Start");
	straight(96);
	hairpin(25, Math.PI - DIAGONAL);
	gate("Checkpoint 1");
	straight(124);
	hairpin(22, DIAGONAL);
	gate("Checkpoint 2");
	straight(116);
	hairpin(29, Math.PI - DIAGONAL);
	gate("Checkpoint 3");
	straight(75);
	gate("Finish");
	straight(50);

	const walls = buildRails(samples);
	const blocks = [];
	const { nearest, gripAt } = createRoadQueries(samples);
	const world = {
		groundHeight,
		gripAt,
		contact: createTrackContact({ walls, blocks }),
		raycast(origin, dir, maxDist) {
			const towardsGround = dir[1] + GRADE * dir[2];
			if (towardsGround >= -1e-3) return null;
			const distance = (groundHeight(origin[0], origin[2]) - origin[1]) / towardsGround;
			if (distance < 0 || distance > maxDist) return null;
			const position = origin.map((component, i) => component + dir[i] * distance);
			return { distance, position, normal: up, grip: gripAt(position[0], position[2]) };
		},
	};
	return { samples, count: samples.length, length: samples.at(-1).s, halfWidth: HALF_WIDTH,
		railOffset: RAIL_OFFSET, spawn, gates, walls, blocks, groundHeight, nearest, world };
}
