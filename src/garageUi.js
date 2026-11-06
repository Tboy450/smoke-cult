// The garage screen: tabs of options that work the same by tap, mouse, keyboard or controller, the upgrade shop,
// and the color wheel.

import { CAR, RANGES } from "./tuning.js";
import { carById } from "./cars.js";
import {
	colorOf, currentRow, currentRows, hexToHsv, hsvToHex, isPartRow, LABELS, moveGarage, picked, setCustomColor, stepOption, switchTab, TABS, WHEEL_COLORS,
} from "./garageState.js";
import { carTuning, levelsFor, MAX_STAGE, nextPrice, PARTS, stageOf } from "./upgrades.js";

const hex = (color) => `#${color.toString(16).padStart(6, "0")}`;
// Bars compare cars against the full range of the tuning sliders.
const STATS = [
	["POWER", (t) => t.EngineAccel, "EngineAccel"],
	["TOP SPEED", (t) => t.TopSpeed, "TopSpeed"],
	["REAR GRIP", (t) => t.RearGrip, "RearGrip"],
	["STEERING", (t) => t.MaxSteerDeg, "MaxSteerDeg"],
	["WEIGHT", (t) => t.Mass, "Mass"],
];

function createColorWheel(root, onPick) {
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
	let dragging = false;
	canvas.addEventListener("pointerdown", (e) => {
		dragging = true;
		canvas.setPointerCapture(e.pointerId);
		pointAt(e);
	});
	canvas.addEventListener("pointermove", (e) => dragging && pointAt(e));
	for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, () => (dragging = false));
	value.addEventListener("input", () => {
		color.v = Number(value.value) / 100;
		apply();
	});
	return {
		show(colorHex) {
			Object.assign(color, hexToHsv(colorHex));
			draw();
		},
		// Controller and keys: left/right turns the hue, up/down changes how strong the color is.
		nudge(dx, dy) {
			color.h = (color.h + dx * 10 + 360) % 360;
			color.s = Math.min(1, Math.max(0, color.s - dy * 0.08));
			apply();
		},
	};
}

export function createGarageUi(root, state, progress, { onChange, onDrive, onBuy }) {
	const rowsEl = root.querySelector("#garage-rows");
	const note = root.querySelector("#garage-note");
	const picker = root.querySelector("#picker");
	let pickerKey = null;
	const carId = () => picked(state, "car").id;
	const say = (text) => (note.textContent = text);

	const wheel = createColorWheel(root, (color) => {
		setCustomColor(state, pickerKey, color);
		onChange(pickerKey);
		renderRows();
	});

	root.querySelector("#garage-tabs").innerHTML = TABS.map((t, i) => `<button class="gtab" data-tab="${i}" tabindex="-1">${t.label}</button>`).join("");
	root.querySelector("#garage-stats").innerHTML = STATS.map(([label]) => `
		<div class="gstat"><span>${label}</span><i><u></u></i></div>`).join("");

	function optionRow(key, i) {
		const option = picked(state, key);
		const color = WHEEL_COLORS.includes(key) ? colorOf(state, key) : option.color;
		const swatch = color === undefined || color === null ? "" : `<i class="gswatch" style="background:${hex(color)}"></i>`;
		const canPick = WHEEL_COLORS.includes(key);
		return `<div class="grow${canPick ? " hascolor" : ""}${i === state.row ? " focus" : ""}" data-row="${i}" data-key="${key}">
			<span class="glabel">${LABELS[key]}</span>
			<button class="garrow" data-step="-1" tabindex="-1" aria-label="Previous ${LABELS[key].toLowerCase()}">‹</button>
			<span class="gvalue">${swatch}<b>${option.name}</b></span>
			<button class="garrow" data-step="1" tabindex="-1" aria-label="Next ${LABELS[key].toLowerCase()}">›</button>
			${canPick ? `<button class="gwheel" data-wheel tabindex="-1" aria-label="Open color wheel"></button>` : ""}
		</div>`;
	}

	function partRow(row, i) {
		const part = PARTS.find((p) => `part:${p.id}` === row);
		const level = stageOf(progress, carId(), part.id);
		const price = nextPrice(progress, carId(), part.id);
		const pips = Array.from({ length: MAX_STAGE }, (_, n) => `<i class="${n < level ? "on" : ""}"></i>`).join("");
		const afford = price !== null && progress.bank >= price;
		return `<div class="grow gpart${i === state.row ? " focus" : ""}" data-row="${i}" data-part="${part.id}">
			<span class="gpname"><b>${part.name}</b><small>${part.tip}</small></span>
			<span class="gpips">${pips}</span>
			<button class="gbuy${afford ? " can" : ""}" data-buy tabindex="-1">${price === null ? "MAX" : price.toLocaleString()}</button>
		</div>`;
	}

	function renderRows() {
		rowsEl.innerHTML = currentRows(state).map((row, i) => (isPartRow(row) ? partRow(row, i) : optionRow(row, i))).join("");
	}

	function render() {
		root.querySelectorAll(".gtab").forEach((b, i) => b.classList.toggle("on", i === state.tab));
		renderRows();
		const def = carById(carId());
		const tuning = carTuning(CAR, def.tuning, levelsFor(progress, def.id));
		root.querySelector("#garage-name").textContent = def.name;
		root.querySelector("#garage-tag").textContent = def.tag;
		root.querySelector("#garage-bank").textContent = progress.bank.toLocaleString();
		root.querySelectorAll(".gstat u").forEach((bar, i) => {
			const [, read, range] = STATS[i];
			const [min, max] = RANGES[range];
			bar.style.width = `${Math.round(Math.min(1, (read(tuning) - min) / (max - min)) * 100)}%`;
		});
		root.querySelector("#garage-drive").textContent = `DRIVE · ${picked(state, "place").name.toUpperCase()}`;
	}

	function closePicker() {
		pickerKey = null;
		picker.classList.remove("open");
		render();
	}
	function openPicker(key) {
		pickerKey = key;
		root.querySelector("#picker-title").textContent = LABELS[key];
		picker.classList.add("open");
		root.scrollTop = 0;
		wheel.show(colorOf(state, key));
	}

	function purchase(partId) {
		const result = onBuy(partId);
		const part = PARTS.find((p) => p.id === partId);
		if (result.ok) say(`${part.name} stage ${stageOf(progress, carId(), partId)} fitted`);
		else if (result.reason === "max") say(`${part.name} is fully upgraded`);
		else say(`Need ${result.need.toLocaleString()} more points`);
		render();
	}

	root.addEventListener("click", (e) => {
		if (e.target.closest("#garage-drive")) return onDrive();
		if (e.target.closest("#picker-done")) return closePicker();
		const tab = e.target.closest("[data-tab]");
		if (tab) {
			state.tab = Number(tab.dataset.tab);
			state.row = 0;
			say("");
			return render();
		}
		const row = e.target.closest(".grow");
		if (!row) return;
		state.row = Number(row.dataset.row);
		const arrow = e.target.closest("[data-step]");
		if (arrow) onChange(stepOption(state, row.dataset.key, Number(arrow.dataset.step)));
		if (e.target.closest("[data-wheel]")) openPicker(row.dataset.key);
		if (e.target.closest("[data-buy]")) return purchase(row.dataset.part);
		render();
	});

	return {
		render,
		move(dx, dy) {
			if (pickerKey) return wheel.nudge(dx, dy);
			const changed = moveGarage(state, dx, dy);
			if (changed) onChange(changed);
			render();
		},
		tab(dx) {
			if (pickerKey) return;
			switchTab(state, dx);
			say("");
			render();
		},
		// A or Enter: buy on an upgrade row, open the wheel on a color row, otherwise drive. Returns true to drive.
		confirm() {
			if (pickerKey) {
				closePicker();
				return false;
			}
			const row = currentRow(state);
			if (isPartRow(row)) {
				purchase(row.slice(5));
				return false;
			}
			if (WHEEL_COLORS.includes(row)) {
				openPicker(row);
				return false;
			}
			return true;
		},
		// B or Escape: close the wheel if it's open. Returns true when there's nothing left to close.
		back() {
			if (!pickerKey) return true;
			closePicker();
			return false;
		},
	};
}
