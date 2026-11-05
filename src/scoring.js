// Practice scoring, independent of graphics and handling. Speeds are metres per second.
export const SCORE_RULES = Object.freeze({ minSpeed: 8, minAngle: 12, maxAngle: 80, linkTime: 1.5 });

export function createScore() {
	return { points: 0, total: 0, best: 0, duration: 0, multiplier: 1, grace: 0,
		side: 0, candidateSide: 0, sideTime: 0, transitionDistance: 0, transitions: 0,
		bonusTime: 0, bonusText: "", result: null, resultTime: 0, active: false, hint: "Build speed · 29 km/h to score" };
}

// A one-off reward during a live combo, such as a clip zone. Scaled by the multiplier like transitions.
export function awardBonus(s, text, points) {
	if (!s.active) return false;
	s.points += points * s.multiplier;
	s.bonusText = text;
	s.bonusTime = 1.5;
	return true;
}

export function finishScore(s, reason, bank = false) {
	if (s.active) {
		const points = Math.floor(s.points);
		if (bank) { s.total += points; s.best = Math.max(s.best, points); }
		// A worthless combo (the bounce after a crash) must not cover up the real result still on screen.
		if (points > 0 || s.resultTime <= 0) {
			s.result = { points, banked: bank, reason };
			s.resultTime = 3;
		}
	}
	Object.assign(s, { active: false, points: 0, duration: 0, multiplier: 1, grace: 0,
		side: 0, candidateSide: 0, sideTime: 0, transitionDistance: 0, transitions: 0, bonusTime: 0 });
}

export function stepScore(s, car, dt) {
	if (!(dt > 0) || !Number.isFinite(dt)) return;
	s.resultTime = Math.max(0, s.resultTime - dt);
	s.bonusTime = Math.max(0, s.bonusTime - dt);
	const angle = Math.abs(car.driftAngle);
	if (![car.speed, car.forwardSpeed, angle].every(Number.isFinite)) {
		finishScore(s, "Car recovered"); return;
	}
	if (car.up < 0.4 || angle > SCORE_RULES.maxAngle || (car.speed > 4 && car.forwardSpeed <= 0)) {
		finishScore(s, "Spun out"); s.hint = "Recover the car to start another drift"; return;
	}
	const fast = car.speed >= SCORE_RULES.minSpeed;
	const valid = fast && angle >= SCORE_RULES.minAngle && car.grounded;
	if (!valid) {
		s.candidateSide = 0; s.sideTime = 0;
		const reason = !car.grounded ? "Left the ground" : !fast ? "Too slow" : "Straightened out";
		s.hint = s.active ? `${reason} · Link another drift` : !fast ? "Build speed · 29 km/h to score" : "Add angle · 12° to score";
		if (s.active) {
			s.grace += dt;
			if (s.grace >= SCORE_RULES.linkTime) finishScore(s, reason, true);
		}
		return;
	}
	s.active = true;
	s.grace = 0;
	s.duration += dt;
	s.multiplier = Math.min(3, 1 + Math.floor(s.duration / 4) * 0.25);
	s.points += 60 * (angle / 45) * Math.min(car.speed / 15, 2.5) * s.multiplier * dt;
	s.transitionDistance += car.speed * dt;
	const side = Math.sign(car.driftAngle);
	if (s.candidateSide !== side) { s.candidateSide = side; s.sideTime = 0; }
	s.sideTime += dt;
	// Commit a side only after holding it. Rapid steering chatter cannot earn transition bonuses.
	if (s.sideTime >= 0.25 && side !== s.side) {
		if (s.side && s.transitionDistance >= 10) {
			s.points += 150 * s.multiplier;
			s.transitions++;
			s.bonusText = "Clean transition +150 × multiplier";
			s.bonusTime = 1.5;
		}
		s.side = side;
		s.transitionDistance = 0;
	}
	s.hint = s.bonusTime > 0 ? s.bonusText : `Angle ${Math.round(angle)}° · Speed ${Math.round(car.speed * 3.6)} km/h`;
}
