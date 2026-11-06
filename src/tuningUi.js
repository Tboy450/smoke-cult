import { RANGES } from "./tuning.js";

export const SIMPLE_FIELDS = ["EngineAccel", "FrontGrip", "RearGrip", "MaxSteerDeg", "BrakeAccel", "Damping"];
// Labels and display conversions only. The physics values and slider ranges stay in their original units.
export const TUNING_FIELDS = {
	EngineAccel: ["Acceleration", "Power & weight", "Higher delivers more driving force to the rear wheels.", 1, " m/s²", 2],
	TopSpeed: ["Top speed target", "Power & weight", "Sets where engine pull tapers off; actual speed also depends on grip and drag.", 3.6, " km/h", 1],
	BrakeAccel: ["Brake strength", "Power & weight", "Higher slows the car more strongly before the tires lose traction.", 1, " m/s²", 1],
	Mass: ["Car weight", "Power & weight", "Changes body mass. Reset restores the selected car and its upgrades.", 1, " kg", 0],
	MaxSteerDeg: ["Steering angle", "Steering", "More lock helps catch bigger drifts; too much can feel twitchy.", 1, "°", 1],
	SteerSpeed: ["Steering response", "Steering", "Higher turns the wheels toward your input faster.", 1, " /s", 1],
	HighSpeedSteerScale: ["High-speed steering", "Steering", "Steering lock retained at speed when driving straight.", 100, "%", 0],
	FrontGrip: ["Front tire grip", "Tires", "Higher gives the front tires more cornering grip.", 1, "×", 2],
	RearGrip: ["Rear tire grip", "Tires", "Lower breaks the rear loose more easily; higher helps it recover.", 1, "×", 2],
	FrontSlide: ["Front sliding grip", "Tires", "Fraction of peak grip retained after the front tires start sliding.", 100, "%", 0],
	PeakSlipDeg: ["Peak-grip slip angle", "Tires", "Tire slip angle where cornering grip reaches its peak.", 1, "°", 1],
	SlideSlipDeg: ["Full-slide slip angle", "Tires", "Tire slip angle where grip settles to its sliding value.", 1, "°", 1],
	HandbrakeGrip: ["Handbrake rear grip", "Tires", "Rear grip retained while holding the handbrake; lower lets the tail slide more.", 100, "%", 0],
	SpringLength: ["Suspension travel", "Suspension & body", "Longer travel gives the wheels more room to follow the ground.", 100, " cm", 1],
	StaticSag: ["Suspension sag", "Suspension & body", "How far the suspension compresses under the car at rest.", 100, "%", 0],
	Damping: ["Bounce control", "Suspension & body", "Higher reduces suspension bounce; lower feels looser.", 100, "%", 0],
	Downforce: ["Aero load strength", "Suspension & body", "Adds downward force as speed rises.", 1, "", 4],
	ForceHeight: ["Body-roll control", "Suspension & body", "Higher applies tire forces closer to the axle for a flatter body.", 100, "%", 0],
};

export function formatTuningValue(name, value) {
	const [, , , scale, unit, digits] = TUNING_FIELDS[name];
	return (value * scale).toFixed(digits) + unit;
}

export function createTuningControls(container, buttons, tuning) {
	let selected = "simple";
	let views = [];
	function render(mode) {
		selected = mode;
		container.replaceChildren();
		views = [];
		for (const button of buttons) {
			const active = button.dataset.mode === mode;
			button.classList.toggle("on", active);
			button.setAttribute("aria-selected", String(active));
			button.tabIndex = active ? 0 : -1;
			if (active) container.setAttribute("aria-labelledby", button.id);
		}
		let previousGroup = null;
		const fields = mode === "simple" ? SIMPLE_FIELDS : Object.keys(TUNING_FIELDS);
		for (const name of fields) {
			const [label, group, help] = TUNING_FIELDS[name];
			if (mode === "advanced" && previousGroup !== group) {
				const heading = document.createElement("h3");
				heading.textContent = group;
				container.appendChild(heading);
				previousGroup = group;
			}
			const setting = document.createElement("div");
			setting.className = "tune-setting";
			const row = document.createElement("label");
			const title = document.createElement("span");
			title.textContent = label;
			const slider = document.createElement("input");
			slider.type = "range";
			[slider.min, slider.max, slider.step] = RANGES[name];
			slider.setAttribute("aria-label", label);
			const output = document.createElement("output");
			const hint = document.createElement("p");
			hint.id = `tune-help-${name}`;
			hint.textContent = help;
			slider.setAttribute("aria-describedby", hint.id);
			const sync = () => {
				// Range inputs round on assignment. Display the real car value without feeding rounding back into physics.
				slider.value = tuning[name];
				output.textContent = formatTuningValue(name, tuning[name]);
				slider.setAttribute("aria-valuetext", output.textContent);
			};
			slider.addEventListener("input", () => { tuning[name] = Number(slider.value); sync(); });
			sync();
			views.push(sync);
			row.append(title, slider, output);
			setting.append(row, hint);
			container.appendChild(setting);
		}
	}
	for (const button of buttons) {
		button.addEventListener("click", () => render(button.dataset.mode));
		button.addEventListener("keydown", (event) => {
			if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
			event.preventDefault();
			const mode = event.key === "Home" ? "simple" : event.key === "End" ? "advanced" : selected === "simple" ? "advanced" : "simple";
			render(mode);
			buttons.find((b) => b.dataset.mode === mode).focus();
		});
	}
	render(selected);
	return { sync() { for (const view of views) view(); } };
}
