// Engine and tire sound, made in code. Browsers only allow audio after a real user gesture, and phones are the strictest:
// a touch counts when the finger lifts, not when it lands, and audio can get suspended again later (a call, a locked phone).
// So every gesture retries until sound is actually running, rather than trying once.

const GESTURES = ["pointerup", "touchend", "click", "keydown", "mousedown"];
const VOLUME = 0.25;

export function createSound({ AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext, events = globalThis, doc = globalThis.document, enabled: startEnabled = true } = {}) {
	let ctx = null;
	let engine, engineFilter, engineGain, squealBand, squealGain, master;
	let enabled = startEnabled;

	function build() {
		ctx = new AudioContextClass();
		master = ctx.createGain();
		master.gain.value = enabled ? VOLUME : 0;
		master.connect(ctx.destination);
		engine = ctx.createOscillator();
		engine.type = "sawtooth";
		engineFilter = ctx.createBiquadFilter();
		engineFilter.type = "lowpass";
		engineFilter.frequency.value = 900;
		engineGain = ctx.createGain();
		engine.connect(engineFilter).connect(engineGain).connect(master);
		engine.start();
		const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		const src = ctx.createBufferSource();
		src.buffer = noise;
		src.loop = true;
		squealBand = ctx.createBiquadFilter();
		squealBand.type = "bandpass";
		squealBand.frequency.value = 1800;
		squealBand.Q.value = 3;
		squealGain = ctx.createGain();
		squealGain.gain.value = 0;
		src.connect(squealBand).connect(squealGain).connect(master);
		src.start();
	}

	function unlock() {
		if (!enabled || !AudioContextClass) return;
		if (!ctx) build();
		if (ctx.state !== "running") ctx.resume()?.catch?.(() => {}); // refused without a gesture; the next one retries
	}

	for (const type of GESTURES) events.addEventListener(type, unlock, { passive: true });
	// Don't keep droning from a background tab.
	doc?.addEventListener("visibilitychange", () => {
		if (doc.hidden) ctx?.suspend?.()?.catch?.(() => {});
		else unlock();
	});

	return {
		unlock,
		get enabled() {
			return enabled;
		},
		get state() {
			return ctx ? ctx.state : "not started";
		},
		setEnabled(on) {
			enabled = on;
			if (master) master.gain.value = on ? VOLUME : 0;
			if (on) unlock();
			else ctx?.suspend?.()?.catch?.(() => {});
		},
		// Quiet idle while parked in the garage.
		idle() {
			if (!ctx) return;
			const t = ctx.currentTime;
			engine.frequency.setTargetAtTime(52, t, 0.2);
			engineFilter.frequency.setTargetAtTime(630, t, 0.2);
			engineGain.gain.setTargetAtTime(0.12, t, 0.2);
			squealGain.gain.setTargetAtTime(0, t, 0.05);
		},
		update(car, topSpeed, reverseSpeed) {
			if (!ctx) return;
			const backing = car.drive < 0 || car.forwardSpeed < -0.5;
			const v = Math.abs(car.forwardSpeed);
			const gearTop = backing ? [reverseSpeed] : [0.18, 0.33, 0.5, 0.7, 1].map((g) => g * topSpeed);
			let gear = gearTop.findIndex((t) => v < t);
			if (gear < 0) gear = gearTop.length - 1;
			const low = gear === 0 ? 0 : gearTop[gear - 1];
			const pedal = Math.abs(car.drive);
			const wheelspin = Math.max(Math.abs(car.wheels[2].wheelspin), Math.abs(car.wheels[3].wheelspin));
			const rearSlip = Math.max(car.wheels[2].slip, car.wheels[3].slip);
			const freeRev = 0.09 + Math.max(wheelspin, rearSlip * 0.3) * 0.045;
			const rpm = Math.min(1.08, 0.23 + 0.72 * ((v - low) / (gearTop[gear] - low)) + pedal * freeRev);
			const slip = Math.max(...car.wheels.map((wheel) => wheel.slip * (wheel.def.front ? 0.65 : 1)));
			const t = ctx.currentTime;
			const limiter = rpm > 1 ? 5 * Math.sin(t * 70) : 0;
			engine.frequency.setTargetAtTime(38 + rpm * 168 + limiter, t, 0.055);
			engineFilter.frequency.setTargetAtTime(520 + rpm * 900 + pedal * 450, t, 0.08);
			engineGain.gain.setTargetAtTime(0.18 + pedal * 0.52, t, 0.08);
			squealBand.frequency.setTargetAtTime(1400 + Math.min(1100, slip * 45 + v * 10), t, 0.06);
			squealGain.gain.setTargetAtTime(Math.min(0.64, Math.max(0, (slip - 3.2) / 17)), t, 0.06);
		},
	};
}
