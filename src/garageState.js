// What's picked in the garage. No graphics or page code here, so controller, keyboard and touch all share one set of rules.

import { CARS } from "./cars.js";

export const OPTIONS = {
	car: CARS.map((c) => ({ id: c.id, name: c.name })),
	paint: [
		{ id: "pink", name: "Cult Pink", color: 0xff2aa0 },
		{ id: "soot", name: "Soot Black", color: 0x17171d },
		{ id: "rust", name: "Rust Orange", color: 0xd8501a },
		{ id: "acid", name: "Acid Lime", color: 0x9bdc1e },
		{ id: "bone", name: "Bone White", color: 0xe8e2d6 },
		{ id: "violet", name: "Deep Violet", color: 0x4a1a78 },
		{ id: "ice", name: "Ice Blue", color: 0x38b8e8 },
	],
	rims: [
		{ id: "chrome", name: "Chrome", color: 0xc8c8d4 },
		{ id: "black", name: "Black", color: 0x18181c },
		{ id: "gold", name: "Gold", color: 0xd8a830 },
		{ id: "pink", name: "Pink", color: 0xff2aa0 },
	],
	glow: [
		{ id: "pink", name: "Pink", color: 0xff2aa0 },
		{ id: "cyan", name: "Cyan", color: 0x20e0ff },
		{ id: "lime", name: "Lime", color: 0xa0ff20 },
		{ id: "amber", name: "Amber", color: 0xffa020 },
		{ id: "off", name: "Off", color: null },
	],
	smoke: [
		{ id: "white", name: "White", color: 0xe6e6ec },
		{ id: "pink", name: "Pink", color: 0xff70c0 },
		{ id: "cyan", name: "Cyan", color: 0x70e8ff },
		{ id: "violet", name: "Violet", color: 0xa070ff },
		{ id: "black", name: "Soot", color: 0x303036 },
	],
	place: [
		{ id: "track", name: "Rustline Circuit" },
		{ id: "pad", name: "Test Pad" },
	],
	sound: [
		{ id: "on", name: "On" },
		{ id: "off", name: "Off" },
	],
	graphics: [
		{ id: "high", name: "High" },
		{ id: "low", name: "Low (faster)" },
	],
};

export const ROWS = [
	{ key: "car", label: "CAR" },
	{ key: "paint", label: "PAINT" },
	{ key: "rims", label: "RIMS" },
	{ key: "glow", label: "UNDERGLOW" },
	{ key: "smoke", label: "TIRE SMOKE" },
	{ key: "place", label: "DRIVE AT" },
	{ key: "sound", label: "SOUND" },
	{ key: "graphics", label: "GRAPHICS" },
];

export function createGarageState(saved = null, lowGraphics = false) {
	const state = { row: 0 };
	for (const { key } of ROWS) {
		const found = OPTIONS[key].findIndex((o) => o.id === saved?.[key]);
		state[key] = found >= 0 ? found : 0;
	}
	if (saved?.graphics === undefined && lowGraphics) state.graphics = 1;
	return state;
}

export const picked = (state, key) => OPTIONS[key][state[key]];

// One step of navigation: up/down picks a row, left/right changes it. Returns the row that changed, if any.
export function moveGarage(state, dx, dy) {
	if (dy) state.row = (state.row + dy + ROWS.length) % ROWS.length;
	if (!dx) return null;
	return stepOption(state, ROWS[state.row].key, dx);
}

export function stepOption(state, key, dx) {
	const count = OPTIONS[key].length;
	state[key] = (state[key] + dx + count) % count;
	return key;
}

// The small object saved in this browser, so your car is still there next time.
export function saveData(state) {
	return Object.fromEntries(ROWS.map(({ key }) => [key, picked(state, key).id]));
}
