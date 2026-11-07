const scoreValue = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function readRecords(saved) {
	return {
		combo: scoreValue(saved?.combo),
		lapPoints: scoreValue(saved?.lapPoints),
		lapTime: Number.isFinite(saved?.lapTime) && saved.lapTime > 0 ? saved.lapTime : null,
	};
}

export function mergeRecords(first, second) {
	const fastest = Math.min(first.lapTime ?? Infinity, second.lapTime ?? Infinity);
	return {
		combo: Math.max(first.combo, second.combo),
		lapPoints: Math.max(first.lapPoints, second.lapPoints),
		lapTime: Number.isFinite(fastest) ? fastest : null,
	};
}
