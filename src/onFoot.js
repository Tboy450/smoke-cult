// Locomotion in metres, independent of rendering and input devices.
import { carAxes } from "./physics.js";

export const WALK_SPEED = 2.3;
export const JOG_SPEED = 4.5;
const BODY_CLEARANCE = 0.28;

function parkedAxes(car) {
	const { look } = carAxes(car);
	return Math.atan2(-look[0], -look[2]);
}

export function doorSpots(car, world, seatZ) {
	const yaw = parkedAxes(car);
	const sin = Math.sin(yaw), cos = Math.cos(yaw);
	const x = car.pos[0] + sin * seatZ;
	const z = car.pos[2] + cos * seatZ;
	const halfWidth = car.body[0] / 2;
	const door = [];
	for (const side of [-1, 1]) {
		const edge = side * (halfWidth + 0.2);
		const offset = side * (halfWidth + 0.72);
		const doorX = x + cos * offset;
		const doorZ = z - sin * offset;
		if (world.contact(x + cos * edge, z - sin * edge) || world.contact(doorX, doorZ)) continue;
		door.push({ x: doorX, y: world.groundHeight(doorX, doorZ), z: doorZ, yaw });
	}
	return door;
}

export function createWalker(spot) {
	return { ...spot, viewYaw: spot.yaw, pace: 0, phase: 0 };
}

export function canEnterCar(walker, spots, world) {
	return spots.some((spot) => Math.hypot(walker.x - spot.x, walker.z - spot.z) < 1.35 &&
		!world.contact((walker.x + spot.x) / 2, (walker.z + spot.z) / 2));
}

export function stepWalker(walker, input, car, world, dt) {
	const speed = input.jog ? JOG_SPEED : WALK_SPEED;
	const scale = speed * dt / Math.max(1, Math.hypot(input.x, input.z));
	const cos = Math.cos(walker.viewYaw), sin = Math.sin(walker.viewYaw);
	const dx = (input.x * cos + input.z * sin) * scale;
	const dz = (-input.x * sin + input.z * cos) * scale;
	const carYaw = parkedAxes(car);
	const rightX = Math.cos(carYaw), rightZ = -Math.sin(carYaw);
	function canStand(x, z) {
		const rx = x - car.pos[0], rz = z - car.pos[2];
		const across = rx * rightX + rz * rightZ;
		const along = rz * rightX - rx * rightZ;
		const touchesCar = Math.abs(across) < car.body[0] / 2 + BODY_CLEARANCE && Math.abs(along) < car.body[2] / 2 + BODY_CLEARANCE;
		return !touchesCar && !world.contact(x, z);
	}
	const beforeX = walker.x, beforeZ = walker.z;
	if (dx || dz) {
		if (canStand(walker.x + dx, walker.z + dz)) {
			walker.x += dx;
			walker.z += dz;
		} else {
			if (dx && canStand(walker.x + dx, walker.z)) walker.x += dx;
			if (dz && canStand(walker.x, walker.z + dz)) walker.z += dz;
		}
	}
	walker.y = world.groundHeight(walker.x, walker.z);
	const movedX = walker.x - beforeX, movedZ = walker.z - beforeZ;
	const distance = Math.hypot(movedX, movedZ);
	if (distance > 0.0001) {
		const turn = Math.atan2(-movedX, -movedZ) - walker.yaw;
		walker.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-dt * 18));
		walker.phase = (walker.phase + distance * Math.PI * 2 / (input.jog ? 1.75 : 1.22)) % (Math.PI * 2);
	}
	walker.pace += ((dt > 0 ? distance / dt : 0) - walker.pace) * (1 - Math.exp(-dt * 12));
}
