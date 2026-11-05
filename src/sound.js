// Engine and tire sound, made in code. Browsers only allow audio after a real user gesture, and phones are the strictest:
// a touch counts when the finger lifts, not when it lands, and audio can get suspended again later (a call, a locked phone).
// So every gesture retries until sound is actually running, rather than trying once.

const GESTURES = ["pointerup", "touchend", "click", "keydown", "mousedown"];
const VOLUME = 0.25;

export function createSound({ AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext, events = globalThis, doc = globalThis.document, enabled: startEnabled = true } = {}) {
	let ctx = null;
	let engine, engineGain, squealGain, master;
	let enabled = startEnabled;

	function build() {
		ctx = new AudioContextClass();
		master = ctx.createGain();
		master.gain.value = enabled ? VOLUME : 0;
		master.connect(ctx.destination);
		engine = ctx.createOscillator();
		engine.type = "sawtooth";
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 900;
		engineGain = ctx.createGain();
		engine.connect(filter).connect(engineGain).connect(master);
		engine.start();
		const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		const src = ctx.createBufferSource();
		src.buffer = noise;
		src.loop = true;
		const band = ctx.createBiquadFilter();
		band.type = "bandpass";
		band.frequency.value = 1800;
		band.Q.value = 3;
		squealGain = ctx.createGain();
		squealGain.gain.value = 0;
		src.connect(band).connect(squealGain).connect(master);
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
			engineGain.gain.setTargetAtTime(0.12, t, 0.2);
			squealGain.gain.setTargetAtTime(0, t, 0.05);
		},
		update(car, controls, gearScale = 1) {
			if (!ctx) return;
			// Fake 5-speed gearbox: rpm climbs in each gear band.
			const v = Math.max(0, car.forwardSpeed);
			const gearTop = [11, 20, 30, 42, 60].map((g) => g * gearScale);
			let gear = gearTop.findIndex((t) => v < t);
			if (gear < 0) gear = 4;
			const low = gear === 0 ? 0 : gearTop[gear - 1];
			let rpm = 0.25 + 0.75 * ((v - low) / (gearTop[gear] - low));
			const rearSlip = Math.max(car.wheels[2].slip, car.wheels[3].slip);
			if (controls.throttle > 0 && rearSlip > 4) rpm = Math.min(1.05, rpm + 0.25); // wheelspin revs
			const t = ctx.currentTime;
			engine.frequency.setTargetAtTime(45 + rpm * 160, t, 0.05);
			engineGain.gain.setTargetAtTime(0.25 + controls.throttle * 0.5, t, 0.08);
			squealGain.gain.setTargetAtTime(Math.min(0.6, Math.max(0, (rearSlip - 4) / 14)), t, 0.05);
		},
	};
}
