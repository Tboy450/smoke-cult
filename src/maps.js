import { GARAGE } from "./track.js";

export const MAPS = [
	{ id: "yard", name: "Rustline Yard" },
	{ id: "touge", name: "Cinder Pass" },
];

export const SPAWNS = {
	yard: [
		{ id: "smokehouse", name: "Out the Door", position: () => ({ x: GARAGE.x, z: GARAGE.z, yaw: -Math.PI / 2 }) },
		{ id: "track", name: "Start Line", position: ({ track }) => track.spawn },
		{ id: "pad", name: "Test Pad", position: ({ track }) => track.padSpawn },
	],
	touge: [
		{ id: "summit", name: "Summit Start", position: ({ course }) => course.spawn },
		{ id: "base", name: "Lift Base", position: ({ course }) => course.baseSpawn, message: "LIFT BASE · RIDE OR TELEPORT UP" },
	],
};

export function spawnById(mapId, spawnId) {
	const options = SPAWNS[mapId];
	return options.find((spawn) => spawn.id === spawnId) ?? options[0];
}
