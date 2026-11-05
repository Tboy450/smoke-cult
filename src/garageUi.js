// The garage screen. Rows of options that work the same by tap, mouse, keyboard or controller.

import { CAR, RANGES } from "./tuning.js";
import { carById } from "./cars.js";
import { picked, ROWS, moveGarage, stepOption } from "./garageState.js";

const hex = (color) => `#${color.toString(16).padStart(6, "0")}`;
// Bars compare cars against the full range of the tuning sliders.
const STATS = [
	["POWER", (t) => t.EngineAccel, "EngineAccel"],
	["TOP SPEED", (t) => t.TopSpeed, "TopSpeed"],
	["REAR GRIP", (t) => t.RearGrip, "RearGrip"],
	["STEERING", (t) => t.MaxSteerDeg, "MaxSteerDeg"],
	["WEIGHT", (t) => t.Mass, "Mass"],
];

export function createGarageUi(root, state, { onChange, onDrive }) {
	root.querySelector("#garage-rows").innerHTML = ROWS.map(({ key, label }, i) => `
		<div class="grow" data-row="${i}" data-key="${key}">
			<span class="glabel">${label}</span>
			<button class="garrow" data-step="-1" tabindex="-1" aria-label="Previous ${label.toLowerCase()}">‹</button>
			<span class="gvalue"><i class="gswatch"></i><b></b></span>
			<button class="garrow" data-step="1" tabindex="-1" aria-label="Next ${label.toLowerCase()}">›</button>
		</div>`).join("");
	root.querySelector("#garage-stats").innerHTML = STATS.map(([label]) => `
		<div class="gstat"><span>${label}</span><i><u></u></i></div>`).join("");

	function render() {
		for (const row of root.querySelectorAll(".grow")) {
			const option = picked(state, row.dataset.key);
			row.classList.toggle("focus", Number(row.dataset.row) === state.row);
			row.querySelector("b").textContent = option.name;
			const swatch = row.querySelector(".gswatch");
			swatch.style.display = option.color === undefined ? "none" : "inline-block";
			swatch.style.background = option.color === null || option.color === undefined ? "transparent" : hex(option.color);
		}
		const def = carById(picked(state, "car").id);
		const tuning = { ...CAR, ...def.tuning };
		root.querySelector("#garage-name").textContent = def.name;
		root.querySelector("#garage-tag").textContent = def.tag;
		root.querySelectorAll(".gstat u").forEach((bar, i) => {
			const [, read, range] = STATS[i];
			const [min, max] = RANGES[range];
			bar.style.width = `${Math.round(((read(tuning) - min) / (max - min)) * 100)}%`;
		});
		root.querySelector("#garage-drive").textContent = `DRIVE · ${picked(state, "place").name.toUpperCase()}`;
	}

	root.addEventListener("click", (e) => {
		const row = e.target.closest(".grow");
		if (e.target.closest("#garage-drive")) return onDrive();
		if (!row) return;
		state.row = Number(row.dataset.row);
		const arrow = e.target.closest("[data-step]");
		if (arrow) onChange(stepOption(state, row.dataset.key, Number(arrow.dataset.step)));
		render();
	});

	return {
		render,
		move(dx, dy) {
			const changed = moveGarage(state, dx, dy);
			if (changed) onChange(changed);
			render();
		},
	};
}
