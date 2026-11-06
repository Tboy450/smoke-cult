// Upgrades bought with banked drift points. No graphics or page code, so prices and effects can be tested.
// To rebalance the shop, these two lists are all you need to change.

// The first two stages come quickly, then each one is a real goal.
export const STAGE_PRICES = [2500, 6000, 25000, 80000, 200000];
export const MAX_STAGE = STAGE_PRICES.length;

export const PARTS = [
	{ id: "engine", name: "ENGINE", tip: "More power and top speed", apply: (t, n) => { t.EngineAccel *= 1 + 0.06 * n; t.TopSpeed *= 1 + 0.03 * n; } },
	{ id: "tires", name: "TIRES", tip: "More grip, front and rear", apply: (t, n) => { t.FrontGrip *= 1 + 0.03 * n; t.RearGrip *= 1 + 0.03 * n; } },
	{ id: "angle", name: "ANGLE KIT", tip: "More steering lock, quicker hands", apply: (t, n) => { t.MaxSteerDeg += 2.5 * n; t.SteerSpeed += 0.4 * n; } },
	{ id: "weight", name: "WEIGHT", tip: "Strip the car, lose the mass", apply: (t, n) => { t.Mass *= 1 - 0.025 * n; } },
];

const stage = (n) => (Number.isInteger(n) ? Math.min(MAX_STAGE, Math.max(0, n)) : 0);

// A car's real numbers: the base handling, then that car's changes, then what's been bought for it.
export function carTuning(base, carChanges, levels = {}) {
	const tuning = { ...base, ...carChanges };
	for (const part of PARTS) part.apply(tuning, stage(levels[part.id]));
	return tuning;
}

export function createProgress(saved = null) {
	const bank = Number.isFinite(saved?.bank) ? Math.max(0, Math.floor(saved.bank)) : 0;
	const parts = {};
	for (const [car, levels] of Object.entries(saved?.parts ?? {})) {
		parts[car] = {};
		for (const part of PARTS) parts[car][part.id] = stage(levels?.[part.id]);
	}
	return { bank, parts };
}

export const levelsFor = (progress, carId) => progress.parts[carId] ?? {};
export const stageOf = (progress, carId, partId) => stage(levelsFor(progress, carId)[partId]);

export function nextPrice(progress, carId, partId) {
	return STAGE_PRICES[stageOf(progress, carId, partId)] ?? null;
}

export function earn(progress, points) {
	progress.bank += Math.max(0, Math.floor(points));
}

// Returns { ok: true } or { ok: false, reason: "max" | "short", need }.
export function buy(progress, carId, partId) {
	const price = nextPrice(progress, carId, partId);
	if (price === null) return { ok: false, reason: "max" };
	if (progress.bank < price) return { ok: false, reason: "short", need: price - progress.bank };
	progress.bank -= price;
	progress.parts[carId] ??= {};
	progress.parts[carId][partId] = stageOf(progress, carId, partId) + 1;
	return { ok: true };
}
