import { hexToHsv, hsvToHex } from "./garageState.js";

const hex = (color) => "#" + color.toString(16).padStart(6, "0");

export function createColorWheel(root, onPick) {
	const canvas = root.querySelector("#picker-wheel");
	const g = canvas.getContext("2d");
	const size = canvas.width;
	const r = size / 2 - 6;
	const base = document.createElement("canvas");
	base.width = base.height = size;
	const b = base.getContext("2d");
	const hues = b.createConicGradient(0, size / 2, size / 2);
	for (let i = 0; i <= 12; i++) hues.addColorStop(i / 12, `hsl(${i * 30} 100% 50%)`);
	b.fillStyle = hues;
	b.beginPath();
	b.arc(size / 2, size / 2, r, 0, Math.PI * 2);
	b.fill();
	const white = b.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, r);
	white.addColorStop(0, "rgba(255,255,255,1)");
	white.addColorStop(1, "rgba(255,255,255,0)");
	b.fillStyle = white;
	b.fill();

	const value = root.querySelector("#picker-value");
	const color = { h: 0, s: 1, v: 1 };

	function draw() {
		g.clearRect(0, 0, size, size);
		g.drawImage(base, 0, 0);
		g.fillStyle = `rgba(0,0,0,${1 - color.v})`;
		g.beginPath();
		g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
		g.fill();
		const angle = (color.h * Math.PI) / 180;
		g.strokeStyle = color.v > 0.5 ? "#000" : "#fff";
		g.lineWidth = 3;
		g.beginPath();
		g.arc(size / 2 + Math.cos(angle) * r * color.s, size / 2 + Math.sin(angle) * r * color.s, 8, 0, Math.PI * 2);
		g.stroke();
		value.value = Math.round(color.v * 100);
		root.querySelector("#picker-percent").textContent = `${value.value}%`;
		root.querySelector("#picker-swatch").style.background = hex(hsvToHex(color.h, color.s, color.v));
	}
	const apply = () => {
		draw();
		onPick(hsvToHex(color.h, color.s, color.v));
	};
	function pointAt(e) {
		const box = canvas.getBoundingClientRect();
		const x = ((e.clientX - box.left) / box.width) * size - size / 2;
		const y = ((e.clientY - box.top) / box.height) * size - size / 2;
		color.h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
		color.s = Math.min(1, Math.hypot(x, y) / r);
		apply();
	}
	let pointer = null;
	function cancel() {
		const previous = pointer;
		pointer = null;
		if (previous !== null && canvas.hasPointerCapture?.(previous)) canvas.releasePointerCapture(previous);
	}
	canvas.addEventListener("pointerdown", (e) => {
		if (pointer !== null || e.button > 0) return;
		pointer = e.pointerId;
		canvas.setPointerCapture(e.pointerId);
		pointAt(e);
	});
	canvas.addEventListener("pointermove", (e) => { if (e.pointerId === pointer) pointAt(e); });
	for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
		canvas.addEventListener(type, (e) => { if (e.pointerId === pointer) cancel(); });
	}
	value.addEventListener("input", () => {
		color.v = Math.min(1, Math.max(0, Number(value.value) / 100));
		apply();
	});
	return {
		cancel,
		show(colorHex) {
			cancel();
			Object.assign(color, hexToHsv(colorHex));
			draw();
		},
		// Controller and keys: left/right turns the hue, up/down changes how strong the color is.
		nudge(dx, dy) {
			color.h = (color.h + dx * 10 + 360) % 360;
			color.s = Math.min(1, Math.max(0, color.s - dy * 0.08));
			apply();
		},
		brightness(direction) {
			color.v = Math.min(1, Math.max(0, color.v + direction * 0.05));
			apply();
		},
	};
}
