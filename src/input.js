// Keyboard, controller (Gamepad API) and touch, merged into one set of controls.

const DEADZONE = 0.12;
export const TOUCH_LAYOUT_QUERY = "(any-pointer: coarse), (max-width: 700px), (max-width: 950px) and (max-height: 500px)";

function shapeStick(x) {
	const m = Math.abs(x);
	if (m < DEADZONE) return 0;
	return Math.sign(x) * ((m - DEADZONE) / (1 - DEADZONE)) ** 1.4;
}

const MENU_KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };

export function createInput({ onPreset, onReset, onCamera, onTune, onMute, onController = () => {}, onGarage = () => {}, onMenu = () => {}, isMenuOpen = () => false, isTouchBlocked = () => false }) {
	const keys = new Set();
	const touch = { gas: false, brake: false, handbrake: false, steer: 0 };
	let device = typeof matchMedia === "function" && matchMedia(TOUCH_LAYOUT_QUERY).matches ? "touch" : "keyboard";
	let padWas = {};
	let padId = null;
	let stickHeld = false;
	let active = true;
	const heldButtons = new Map();
	let steerId = null;
	const clearTouch = () => {
		touch.gas = touch.brake = touch.handbrake = false;
		touch.steer = 0;
		steerId = null;
		heldButtons.clear();
	};
	const clear = () => {
		keys.clear();
		clearTouch();
	};

	addEventListener("keydown", (e) => {
		if (e.code === "Tab") {
			e.preventDefault();
			if (!e.repeat) onTune();
			return;
		}
		if (isMenuOpen()) {
			const step = MENU_KEYS[e.code];
			if (step) onMenu(step[0], step[1]);
			else if (!e.repeat && (e.code === "Enter" || e.code === "Space")) onMenu(0, 0, "confirm");
			else if (!e.repeat && (e.code === "Escape" || e.code === "KeyG")) onMenu(0, 0, "back");
			else return;
			e.preventDefault();
			return;
		}
		if (e.repeat) return;
		// A focused slider or button keeps the keys it uses; every other key still drives.
		const inForm = e.target?.closest?.("input, textarea, select, button");
		if (inForm && (e.code === "Space" || e.code === "Enter" || e.code.startsWith("Arrow"))) return;
		if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
		keys.add(e.code);
		device = "keyboard";
		if (e.code === "KeyT") onPreset();
		if (e.code === "KeyR") onReset();
		if (e.code === "KeyC") onCamera();
		if (e.code === "KeyM") onMute();
		if (e.code === "KeyG") onGarage();
		if (e.code === "Space") e.preventDefault();
	});
	addEventListener("keyup", (e) => keys.delete(e.code));
	addEventListener("blur", () => { active = false; clear(); });
	addEventListener("focus", () => { active = true; });
	document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });

	// Touch: drag anywhere on the left half to steer; buttons on the right.
	const steerZone = document.getElementById("touch-steer");
	let steerStartX = 0;
	steerZone?.addEventListener("pointerdown", (e) => {
		if (steerId !== null || isTouchBlocked()) return;
		steerId = e.pointerId;
		steerStartX = e.clientX;
		steerZone.setPointerCapture(e.pointerId);
		device = "touch";
	});
	steerZone?.addEventListener("pointermove", (e) => {
		if (e.pointerId === steerId) touch.steer = Math.max(-1, Math.min(1, (e.clientX - steerStartX) / 90));
	});
	const endSteer = (e) => {
		if (e.pointerId === steerId) {
			steerId = null;
			touch.steer = 0;
		}
	};
	steerZone?.addEventListener("pointerup", endSteer);
	steerZone?.addEventListener("pointercancel", endSteer);
	steerZone?.addEventListener("lostpointercapture", endSteer);
	for (const [id, key] of [["touch-gas", "gas"], ["touch-brake", "brake"], ["touch-hb", "handbrake"]]) {
		const b = document.getElementById(id);
		b?.addEventListener("pointerdown", (e) => {
			if (isTouchBlocked()) return;
			if (!heldButtons.has(key)) heldButtons.set(key, new Set());
			heldButtons.get(key).add(e.pointerId);
			touch[key] = true;
			device = "touch";
			b.setPointerCapture(e.pointerId);
		});
		for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b?.addEventListener(ev, (e) => {
			heldButtons.get(key)?.delete(e.pointerId);
			touch[key] = (heldButtons.get(key)?.size ?? 0) > 0;
		});
	}
	for (const [id, fn] of [["touch-preset", onPreset], ["touch-reset", onReset], ["touch-cam", onCamera], ["touch-tune", onTune], ["touch-garage", onGarage]]) {
		document.getElementById(id)?.addEventListener("click", fn);
	}

	const controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
	const down = (...codes) => codes.some((c) => keys.has(c));

	return {
		controls,
		get device() {
			return device;
		},
		touch,
		update() {
			if (!active || document.hidden) {
				Object.assign(controls, { throttle: 0, brake: 0, steer: 0, handbrake: false });
				return;
			}
			let padSteer = 0;
			let padGas = 0;
			let padBrake = 0;
			let padHandbrake = false;
			const pads = Array.from(navigator.getGamepads?.() ?? []).filter(Boolean);
			// Prefer a standard pad. Anything else that looks like a real controller gets a best guess at the same layout.
			const pad = pads.find((p) => p.mapping === "standard") ?? pads.find((p) => p.axes.length >= 2 && p.buttons.length >= 8);
			const nextPadId = pad ? `${pad.index}:${pad.id}` : null;
			if (nextPadId !== padId) {
				padWas = {};
				padId = nextPadId;
				if (pad) onController(pad.mapping === "standard");
			}
			if (pad) {
				const b = (i) => pad.buttons[i] ?? { value: 0, pressed: false };
				padSteer = shapeStick(pad.axes[0] ?? 0);
				padGas = b(7).value;
				padBrake = b(6).value;
				padHandbrake = b(0).pressed || b(2).pressed;
				const pressedNow = (i) => b(i).pressed && !padWas[i];
				if (isMenuOpen()) {
					// D-pad or left stick moves through the garage; A drives, B or Menu goes back.
					const stickX = Math.abs(pad.axes[0] ?? 0) > 0.6 ? Math.sign(pad.axes[0]) : 0;
					const stickY = Math.abs(pad.axes[1] ?? 0) > 0.6 ? Math.sign(pad.axes[1]) : 0;
					if (pressedNow(12) || (stickY < 0 && !stickHeld)) onMenu(0, -1);
					if (pressedNow(13) || (stickY > 0 && !stickHeld)) onMenu(0, 1);
					if (pressedNow(14) || (stickX < 0 && !stickHeld)) onMenu(-1, 0);
					if (pressedNow(15) || (stickX > 0 && !stickHeld)) onMenu(1, 0);
					stickHeld = stickX !== 0 || stickY !== 0;
					if (pressedNow(0)) onMenu(0, 0, "confirm");
					else if (pressedNow(1) || pressedNow(9)) onMenu(0, 0, "back");
				} else {
					if (pressedNow(12)) onPreset(); // D-pad up
					if (pressedNow(13)) onReset(); // D-pad down
					if (pressedNow(3)) onCamera(); // Y
					if (pressedNow(9)) onGarage(); // Menu
				}
				if (pressedNow(8)) onTune(); // View
				for (let i = 0; i < pad.buttons.length; i++) padWas[i] = pad.buttons[i].pressed;
				if (padSteer || padGas > 0.05 || padBrake > 0.05 || padHandbrake) device = "gamepad";
			}
			if (isMenuOpen()) {
				clearTouch();
				Object.assign(controls, { throttle: 0, brake: 0, steer: 0, handbrake: false });
				return;
			}
			if (isTouchBlocked()) clearTouch();
			const keySteer = (down("KeyD", "ArrowRight") ? 1 : 0) - (down("KeyA", "ArrowLeft") ? 1 : 0);
			controls.steer = keySteer || padSteer || touch.steer;
			controls.throttle = Math.max(down("KeyW", "ArrowUp") ? 1 : 0, padGas, touch.gas ? 1 : 0);
			controls.brake = Math.max(down("KeyS", "ArrowDown") ? 1 : 0, padBrake, touch.brake ? 1 : 0);
			controls.handbrake = down("Space") || padHandbrake || touch.handbrake;
		},
	};
}
