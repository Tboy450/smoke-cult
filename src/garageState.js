// What's picked in the garage. No graphics or page code here, so controller, keyboard and touch all share one set of rules.

import { CARS } from "./cars.js";
import { PARTS } from "./upgrades.js";

const CUSTOM = { id: "custom", name: "Custom" };

export const OPTIONS = {
	car: CARS.map((c) => ({ id: c.id, name: c.name })),
	kit: [
		{ id: "stock", name: "Stock" },
		{ id: "street", name: "Street" },
		{ id: "track", name: "Track" },
		{ id: "wide", name: "Wide Arch" },
	],
	wheels: [
		{ id: "five", name: "Five Spoke" },
		{ id: "mesh", name: "Mesh" },
		{ id: "dish", name: "Deep Dish" },
		{ id: "steel", name: "Steelie" },
		{ id: "turbine", name: "Turbine" },
	],
	rims: [
		{ id: "chrome", name: "Chrome", color: 0xc8c8d4 },
		{ id: "black", name: "Black", color: 0x18181c },
		{ id: "gold", name: "Gold", color: 0xd8a830 },
		{ id: "pink", name: "Pink", color: 0xff2aa0 },
		CUSTOM,
	],
	paint: [
		{ id: "pink", name: "Cult Pink", color: 0xff2aa0 },
		{ id: "soot", name: "Soot Black", color: 0x17171d },
		{ id: "rust", name: "Rust Orange", color: 0xd8501a },
		{ id: "acid", name: "Acid Lime", color: 0x9bdc1e },
		{ id: "bone", name: "Bone White", color: 0xe8e2d6 },
		{ id: "violet", name: "Deep Violet", color: 0x4a1a78 },
		{ id: "ice", name: "Ice Blue", color: 0x38b8e8 },
		CUSTOM,
	],
	decal: [
		{ id: "none", name: "None" },
		{ id: "stripes", name: "Twin Stripes" },
		{ id: "slash", name: "Side Slash" },
		{ id: "flames", name: "Flames" },
		{ id: "checker", name: "Checker Fade" },
		{ id: "ring", name: "Cult Ring" },
	],
	decalColor: [
		{ id: "white", name: "White", color: 0xf0f0f4 },
		{ id: "black", name: "Black", color: 0x101014 },
		{ id: "pink", name: "Pink", color: 0xff2aa0 },
		{ id: "gold", name: "Gold", color: 0xe0b030 },
		{ id: "cyan", name: "Cyan", color: 0x20d0f0 },
		CUSTOM,
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
		{ id: "smokehouse", name: "Out the Door" },
		{ id: "track", name: "Start Line" },
		{ id: "pad", name: "Test Pad" },
	],
	sound: [
		{ id: "on", name: "On" },
		{ id: "off", name: "Off" },
	],
	combo: [
		{ id: "full", name: "Full" },
		{ id: "small", name: "Small" },
	],
	graphics: [
		{ id: "high", name: "High" },
		{ id: "low", name: "Low (faster)" },
	],
};

export const LABELS = {
	car: "CAR", kit: "BODY KIT", wheels: "WHEELS", rims: "WHEEL COLOR", paint: "BODY COLOR", decal: "DECAL", decalColor: "DECAL COLOR",
	glow: "UNDERGLOW", smoke: "TIRE SMOKE", place: "DRIVE AT", sound: "SOUND", combo: "COMBO BOX", graphics: "GRAPHICS",
};

// Colors you can also set with the color wheel.
export const WHEEL_COLORS = ["rims", "paint", "decalColor"];

export const TABS = [
	{ id: "car", label: "CAR", rows: ["car", "kit", "wheels", "rims"] },
	{ id: "paint", label: "PAINT", rows: ["paint", "decal", "decalColor", "glow", "smoke"] },
	{ id: "upgrades", label: "UPGRADES", rows: PARTS.map((p) => `part:${p.id}`) },
	{ id: "game", label: "GAME", rows: ["place", "sound", "combo", "graphics"] },
];

const validColor = (c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff;

export function createGarageState(saved = null, lowGraphics = false) {
	const state = { tab: 0, row: 0, custom: { rims: 0xc8c8d4, paint: 0xff2aa0, decalColor: 0xf0f0f4 } };
	for (const key of Object.keys(OPTIONS)) {
		const found = OPTIONS[key].findIndex((o) => o.id === saved?.[key]);
		state[key] = found >= 0 ? found : 0;
	}
	for (const key of WHEEL_COLORS) if (validColor(saved?.custom?.[key])) state.custom[key] = saved.custom[key];
	if (saved?.graphics === undefined && lowGraphics) state.graphics = 1;
	if (saved?.combo === undefined && lowGraphics) state.combo = 1;
	return state;
}

export const picked = (state, key) => OPTIONS[key][state[key]];
export const currentRows = (state) => TABS[state.tab].rows;
export const currentRow = (state) => currentRows(state)[state.row];
export const isPartRow = (row) => row.startsWith("part:");

// The color a row is showing, whether it's a preset or set with the color wheel.
export function colorOf(state, key) {
	const option = picked(state, key);
	return option.id === "custom" ? state.custom[key] : option.color;
}

export function setCustomColor(state, key, color) {
	state.custom[key] = color;
	state[key] = OPTIONS[key].findIndex((o) => o.id === "custom");
}

export function stepOption(state, key, dx) {
	const count = OPTIONS[key].length;
	state[key] = (state[key] + dx + count) % count;
	return key;
}

// One step of navigation: up/down picks a row, left/right changes it. Returns the option that changed, if any.
export function moveGarage(state, dx, dy) {
	const rows = currentRows(state);
	if (dy) state.row = (state.row + dy + rows.length) % rows.length;
	const row = rows[state.row];
	if (!dx || isPartRow(row)) return null;
	return stepOption(state, row, dx);
}

export function switchTab(state, dx) {
	state.tab = (state.tab + dx + TABS.length) % TABS.length;
	state.row = 0;
}

// The small object saved in this browser, so your car is still there next time.
export function saveData(state) {
	const data = Object.fromEntries(Object.keys(OPTIONS).map((key) => [key, picked(state, key).id]));
	data.custom = { ...state.custom };
	return data;
}

// Color wheel math. Hue is 0-360; saturation and value are 0-1.
export function hsvToHex(h, s, v) {
	const channel = (n) => {
		const k = (n + h / 60) % 6;
		return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
	};
	return (channel(5) << 16) | (channel(3) << 8) | channel(1);
}

export function hexToHsv(hex) {
	const r = ((hex >> 16) & 255) / 255;
	const g = ((hex >> 8) & 255) / 255;
	const b = (hex & 255) / 255;
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	let h = 0;
	if (d > 0) {
		if (max === r) h = ((g - b) / d + 6) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
	}
	return { h: h * 60, s: max === 0 ? 0 : d / max, v: max };
}
