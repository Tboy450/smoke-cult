// SMOKE CULT: Rustline Yard, the garage, one car on track, chase camera, HUD and a live tuning panel.

import * as THREE from "three";
import { carById } from "./cars.js";
import { createCarModel } from "./carModel.js";
import { createEffects } from "./effects.js";
import { createGarageUi } from "./garageUi.js";
import { colorOf, createGarageState, picked, saveData, stepOption } from "./garageState.js";
import { createInput, TOUCH_LAYOUT_QUERY } from "./input.js";
import { createCar, fitCar, placeCar, resetCar, stepCar, carAxes } from "./physics.js";
import { awardBonus, createScore, stepScore, finishScore, SCORE_RULES } from "./scoring.js";
import { createSound } from "./sound.js";
import { buildTrack, collideCar, createLap, createTrackWorld, GARAGE, inGarageBay, nearestSample, resetLap, stepLap, zoneAt } from "./track.js";
import { CAR, PRESET_ORDER } from "./tuning.js";
import { createTuningPanel } from "./tuningPanel.js";
import { createTuningControls } from "./tuningUi.js";
import { buy, carTuning, createProgress, earn, levelsFor } from "./upgrades.js";
import { buildYard } from "./yard.js";

const PHYSICS_DT = 1 / 240;
const WALL_HIT = 3.5; // m/s into a wall that ends a combo; anything softer is a scrape
const CLIP_ANGLE = 20;
const SAVE_KEY = "smoke-cult-garage";
const PROGRESS_KEY = "smoke-cult-progress";
const BAY_SPEED = 7; // m/s: slow to this in the Smokehouse bay and the garage opens
const tuning = { ...CAR };

// --- renderer, scene, light ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8a4a78, 130, 680);
scene.add(new THREE.HemisphereLight(0xffd6f0, 0x46323c, 1.7));
const sun = new THREE.DirectionalLight(0xffc890, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 170 });
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1500);

// --- the yard ---
const track = buildTrack();
const world = createTrackWorld(track);
const yard = buildYard(scene, renderer, track);

const coneGeo = new THREE.ConeGeometry(0.22, 0.7, 16).translate(0, 0.35, 0);
const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.6 });
const cones = [];
function cone(x, z) {
	const mesh = new THREE.Mesh(coneGeo, coneMat);
	mesh.position.set(x, 0, z);
	mesh.castShadow = true;
	scene.add(mesh);
	cones.push({ mesh, home: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), spin: new THREE.Vector3(), hit: false });
}
cone(-17, -62); // figure-eight
cone(17, -62);
for (let i = 0; i < 10; i++) cone(62, -34 + i * 12.5); // slalom
for (let i = 0; i < 16; i++) {
	const a = (i / 16) * Math.PI * 2;
	cone(-72 + Math.cos(a) * 20, 17 + Math.sin(a) * 20); // donut circle
}
function resetCones() {
	for (const c of cones) {
		c.hit = false;
		c.mesh.position.copy(c.home);
		c.mesh.rotation.set(0, 0, 0);
	}
}

// --- car ---
const car = createCar(tuning, [track.spawn.x, 1, track.spawn.z], track.spawn.yaw);
const score = createScore();
const lap = createLap();
const model = createCarModel(scene, tuning);
const effects = createEffects(scene);

// --- HUD ---
const $ = (id) => document.getElementById(id);
const HINTS = {
	keyboard: "W gas · S brake/reverse · A/D steer · SPACE handbrake · T assist · R reset · C camera · G garage · H combo box · TAB tuning · M sound",
	gamepad: "RT gas · LT brake/reverse · Left stick steer · A/X handbrake · D-pad ↑ assist · D-pad ↓ reset · Y camera · Menu garage · View tuning",
	touch: "Drag left side to steer · GAS / BRAKE / HB on the right",
};
const touchLayout = matchMedia(TOUCH_LAYOUT_QUERY);
const syncTouchLayout = () => document.body.classList.toggle("touch", touchLayout.matches);
syncTouchLayout();
touchLayout.addEventListener("change", syncTouchLayout);

function loadSaved(key) {
	try {
		return JSON.parse(localStorage.getItem(key));
	} catch {
		return null;
	}
}
function save(key, data) {
	try {
		localStorage.setItem(key, JSON.stringify(data));
	} catch {
		// Private windows can refuse storage. The game works the same, it just won't remember.
	}
}
const saveGarage = () => save(SAVE_KEY, saveData(garage));
const saveProgress = () => save(PROGRESS_KEY, progress);
const garage = createGarageState(loadSaved(SAVE_KEY), touchLayout.matches);
const progress = createProgress(loadSaved(PROGRESS_KEY));
// Sound itself starts on the first real tap or key press. Starting it any earlier is what phones refuse.
const sound = createSound({ enabled: picked(garage, "sound").id === "on" });

let mode = "garage";
let cameraMode = 0; // 0 chase, 1 low drift cam, 2 hood
const CAMERA_NAMES = ["Chase", "Drift cam", "Hood"];
const cycle = (list, current) => list[(list.indexOf(current) + 1) % list.length];
const tuningPanel = createTuningPanel($("tune"), $("tune-close"));

function fitView() {
	camera.aspect = innerWidth / innerHeight;
	renderer.setSize(innerWidth, innerHeight);
	// In the garage, slide the picture so the car sits clear of the menu.
	if (mode !== "garage") camera.clearViewOffset();
	else if (innerWidth > innerHeight) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.17, 0, innerWidth, innerHeight);
	else camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.24, innerWidth, innerHeight);
	camera.updateProjectionMatrix();
}
addEventListener("resize", fitView);

// Banked points go into the bank to spend on upgrades. Lost combos pay nothing.
let paidTotal = 0;
function payBanked() {
	if (score.total <= paidTotal) return;
	earn(progress, score.total - paidTotal);
	paidTotal = score.total;
	saveProgress();
}

function openGarage() {
	if (mode === "garage") return;
	finishScore(score, "Back to garage", true);
	payBanked();
	mode = "garage";
	document.body.classList.add("garage");
	yard.garage.setLit(true);
	garageUi.render();
	fitView();
}

const SMOKEHOUSE_SPOT = { x: GARAGE.x, z: GARAGE.z, yaw: -Math.PI / 2 }; // nose toward the open door
let bayArmed = true;
function checkBay() {
	if (!inGarageBay(car.pos[0], car.pos[2])) bayArmed = true;
	else if (bayArmed && car.speed < BAY_SPEED) openGarage();
}

function leaveGarage() {
	mode = "drive";
	document.body.classList.remove("garage");
	yard.garage.setLit(false);
	saveGarage();
	const spot = { smokehouse: SMOKEHOUSE_SPOT, track: track.spawn, pad: track.padSpawn }[picked(garage, "place").id];
	placeCar(car, spot.x, spot.z, spot.yaw);
	bayArmed = false; // leaving the bay shouldn't reopen the garage
	resetLap(lap, track, car.pos[0], car.pos[2]);
	resetCones();
	effects.clearSkids();
	const { look } = carAxes(car);
	camPos.set(spot.x - look[0] * 7, 3, spot.z - look[2] * 7);
	camLook.set(spot.x, 0.6, spot.z);
	fitView();
}

const input = createInput({
	onPreset: () => {
		finishScore(score, "Assist changed");
		car.preset = cycle(PRESET_ORDER, car.preset);
		syncPresetButtons();
	},
	onReset: () => {
		if (mode === "garage") return;
		finishScore(score, "Car reset");
		// Near the road, go back onto it facing the right way. Anywhere else, just get back on your wheels.
		const near = nearestSample(track, car.pos[0], car.pos[2]);
		if (near.distance < 40) {
			const p = track.samples[near.index];
			placeCar(car, p.x, p.z, Math.atan2(-p.tx, -p.tz));
		} else {
			resetCar(car, tuning);
		}
		resetLap(lap, track, car.pos[0], car.pos[2]);
		effects.clearSkids();
		resetCones();
	},
	onCamera: () => {
		if (mode === "garage") return;
		cameraMode = (cameraMode + 1) % CAMERA_NAMES.length;
		flash(CAMERA_NAMES[cameraMode]);
	},
	onTune: () => tuningPanel.toggle(),
	onMute: toggleSound,
	onController: (standard) => {
		sound.unlock();
		flash(standard ? "Controller connected" : "Controller connected (basic mode)");
	},
	onGarage: openGarage,
	onCombo: toggleComboBox,
	isMenuOpen: () => mode === "garage",
	onMenu: (dx, dy, action) => {
		sound.unlock();
		if (action === "tab") garageUi.tab(dx);
		else if (action === "confirm" && garageUi.confirm()) leaveGarage();
		else if (action === "back" && garageUi.back()) leaveGarage();
		else if (!action) garageUi.move(dx, dy);
	},
	// The open panel covers the touch controls. Keyboard and controller keep driving so changes can be felt live.
	isTouchBlocked: () => $("tune").classList.contains("open"),
});

let flashTimer = 0;
function flash(text) {
	$("flash").textContent = text;
	$("flash").style.opacity = 1;
	flashTimer = 1.4;
}

// --- tuning panel ---
const tuningControls = createTuningControls($("tune-rows"), Array.from(document.querySelectorAll("#tune-tabs button")), tuning);
function syncTuningSliders() {
	tuningControls.sync();
}
function syncPresetButtons() {
	for (const b of document.querySelectorAll("#tune-presets button")) b.classList.toggle("on", b.dataset.preset === car.preset);
}
for (const name of PRESET_ORDER) {
	const b = document.createElement("button");
	b.textContent = name;
	b.dataset.preset = name;
	b.addEventListener("click", () => {
		if (car.preset !== name) finishScore(score, "Assist changed");
		car.preset = name;
		syncPresetButtons();
	});
	$("tune-presets").appendChild(b);
}
syncPresetButtons();
$("tune-reset").addEventListener("click", () => {
	Object.assign(tuning, baseTuning());
	syncTuningSliders();
});
$("tune-copy").addEventListener("click", async () => {
	const text = JSON.stringify(tuning, null, "\t");
	try {
		await navigator.clipboard.writeText(text);
		flash("Tuning copied");
	} catch {
		console.log(text);
		flash("Tuning printed to console");
	}
});

// --- garage ---
const currentCar = () => carById(picked(garage, "car").id);
// The car's numbers, including everything bought for it.
function baseTuning() {
	const def = currentCar();
	return carTuning(CAR, def.tuning, levelsFor(progress, def.id));
}
function applyLook() {
	model.setLook({ paint: colorOf(garage, "paint"), rims: colorOf(garage, "rims"), decal: colorOf(garage, "decalColor"), glow: picked(garage, "glow").color });
	effects.setSmokeColor(picked(garage, "smoke").color);
}
function buildCarModel() {
	model.setCar(currentCar(), { kit: picked(garage, "kit").id, wheels: picked(garage, "wheels").id, decal: picked(garage, "decal").id });
	applyLook();
}
function applyCar() {
	const def = currentCar();
	Object.assign(tuning, baseTuning());
	syncTuningSliders();
	fitCar(car, tuning, def.wheels, def.body);
	buildCarModel();
}
function applyComboBox() {
	const small = picked(garage, "combo").id === "small";
	$("score-box").classList.toggle("small", small);
	$("combo-toggle").textContent = small ? "+" : "–";
	const label = small ? "Expand score and lap panel" : "Minimize score and lap panel";
	$("combo-toggle").setAttribute("aria-label", label);
	$("combo-toggle").setAttribute("aria-expanded", String(!small));
	$("combo-toggle").title = label;
}
function toggleComboBox() {
	stepOption(garage, "combo", 1);
	applyComboBox();
	saveGarage();
	garageUi.render();
}
function showSoundButton() {
	const on = picked(garage, "sound").id === "on";
	$("sound-btn").textContent = on ? "SOUND ON" : "SOUND OFF";
	$("sound-btn").classList.toggle("off", !on);
}
function applySound() {
	sound.setEnabled(picked(garage, "sound").id === "on");
	showSoundButton();
}
function toggleSound() {
	stepOption(garage, "sound", 1);
	applySound();
	saveGarage();
	garageUi.render();
	flash(sound.enabled ? "Sound on" : "Sound off");
}
function applyGraphics() {
	const low = picked(garage, "graphics").id === "low";
	renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 2));
	renderer.setSize(innerWidth, innerHeight);
	sun.castShadow = !low;
}
const garageUi = createGarageUi($("garage"), garage, progress, {
	onChange: (key) => {
		if (key === "car") applyCar();
		else if (key === "kit" || key === "wheels" || key === "decal") buildCarModel();
		else if (key === "graphics") applyGraphics();
		else if (key === "sound") applySound();
		else if (key === "combo") applyComboBox();
		else if (key !== "place") applyLook();
		saveGarage();
	},
	onDrive: leaveGarage,
	onBuy: (partId) => {
		const result = buy(progress, currentCar().id, partId);
		if (result.ok) {
			saveProgress();
			applyCar();
		}
		return result;
	},
});
applyCar();
applyGraphics();
showSoundButton();
applyComboBox();
garageUi.render();
$("sound-btn").addEventListener("click", toggleSound);
$("combo-toggle").addEventListener("click", toggleComboBox);

// --- minimap: the road is drawn once, then only the dot moves ---
const map = $("minimap");
const mapContext = map.getContext("2d");
const MAP_PAD = 8;
const mapBase = document.createElement("canvas");
mapBase.width = mapBase.height = map.width;
const mapScale = (() => {
	const reach = Math.max(...track.samples.map((p) => Math.max(Math.abs(p.x), Math.abs(p.z))));
	return (map.width / 2 - MAP_PAD) / reach;
})();
const toMap = (x, z) => [map.width / 2 + x * mapScale, map.height / 2 + z * mapScale];
{
	const g = mapBase.getContext("2d");
	const path = () => {
		g.beginPath();
		track.samples.forEach((p, i) => g[i ? "lineTo" : "moveTo"](...toMap(p.x, p.z)));
		g.closePath();
	};
	g.lineJoin = "round";
	g.strokeStyle = "rgba(10,4,16,0.75)";
	g.lineWidth = 9;
	path();
	g.stroke();
	g.strokeStyle = "#e8e4ee";
	g.lineWidth = 4;
	path();
	g.stroke();
	g.fillStyle = "#ff2aa0";
	for (const zone of track.zones) {
		const [x, y] = toMap(track.samples[zone.apex].x, track.samples[zone.apex].z);
		g.beginPath();
		g.arc(x, y, 3.5, 0, Math.PI * 2);
		g.fill();
	}
	const [gx, gy] = toMap(GARAGE.x, GARAGE.z); // the Smokehouse
	g.fillStyle = "#20e0ff";
	g.fillRect(gx - 5, gy - 5, 10, 10);
}
function drawMinimap() {
	mapContext.clearRect(0, 0, map.width, map.height);
	mapContext.drawImage(mapBase, 0, 0);
	const [x, y] = toMap(car.pos[0], car.pos[2]);
	mapContext.fillStyle = "#ffd23f";
	mapContext.strokeStyle = "#120818";
	mapContext.lineWidth = 2;
	mapContext.beginPath();
	mapContext.arc(x, y, 5.5, 0, Math.PI * 2);
	mapContext.fill();
	mapContext.stroke();
}

// --- camera ---
const camPos = new THREE.Vector3(track.spawn.x, 3, track.spawn.z + 7);
const camLook = new THREE.Vector3();
function updateCamera(dt) {
	const { look, up } = carAxes(car);
	const pos = new THREE.Vector3(...car.pos);
	const heading = new THREE.Vector3(look[0], 0, look[2]).normalize();
	const travel = new THREE.Vector3(car.vel[0], 0, car.vel[2]);
	// Chase cams sit behind the direction of travel, so you see the car's drift angle.
	const dir = travel.length() > 3 ? heading.clone().lerp(travel.normalize(), 0.65).normalize() : heading;
	let target;
	let lookAt;
	if (cameraMode === 2) {
		target = pos.clone().add(new THREE.Vector3(...up).multiplyScalar(0.75)).addScaledVector(heading, 0.2);
		lookAt = target.clone().addScaledVector(heading, 10);
		camPos.copy(target);
	} else {
		const back = cameraMode === 0 ? 6.5 : 4.8;
		const height = cameraMode === 0 ? 2.4 : 1.2;
		target = pos.clone().addScaledVector(dir, -back).add(new THREE.Vector3(0, height, 0));
		camPos.lerp(target, 1 - Math.exp(-dt * 6));
		lookAt = pos.clone().add(new THREE.Vector3(0, 0.6, 0)).addScaledVector(dir, 2);
	}
	camLook.lerp(lookAt, 1 - Math.exp(-dt * 12));
	camera.position.copy(camPos);
	camera.lookAt(camLook);
	const fov = 62 + Math.min(14, car.speed * 0.25);
	camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
	camera.updateProjectionMatrix();
	aimSun(pos.x, pos.z);
}
function aimSun(x, z) {
	sun.position.set(x + 58, 62, z - 42);
	sun.target.position.set(x, 0, z);
}

// --- cones get knocked flying ---
function updateCones(dt) {
	const { look, right } = carAxes(car);
	const halfLength = car.body[2] / 2 + 0.2;
	const halfWidth = car.body[0] / 2 + 0.2;
	for (const c of cones) {
		const p = c.mesh.position;
		if (!c.hit) {
			const rel = [p.x - car.pos[0], 0, p.z - car.pos[2]];
			const along = rel[0] * look[0] + rel[2] * look[2];
			const across = rel[0] * right[0] + rel[2] * right[2];
			if (Math.abs(along) < halfLength && Math.abs(across) < halfWidth) {
				finishScore(score, "Cone hit");
				c.hit = true;
				c.vel.set(car.vel[0] * 0.9 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, car.vel[2] * 0.9);
				c.spin.set(Math.random() * 10, Math.random() * 6, Math.random() * 10);
			}
			continue;
		}
		if (p.y > 0 || c.vel.y > 0) {
			c.vel.y -= 9.81 * dt;
			p.addScaledVector(c.vel, dt);
			c.mesh.rotation.x += c.spin.x * dt;
			c.mesh.rotation.z += c.spin.z * dt;
			if (p.y < 0) {
				p.y = 0;
				c.vel.multiplyScalar(0.35);
				c.vel.y = Math.abs(c.vel.y) > 1 ? Math.abs(c.vel.y) * 0.3 : 0;
				c.spin.multiplyScalar(0.4);
			}
		}
	}
}

// --- laps and clip zones ---
const clock = (seconds) => {
	if (seconds === null) return "--:--.-";
	const m = Math.floor(seconds / 60);
	const s = seconds - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};
function updateLap(dt) {
	const earned = score.total + Math.floor(score.points); // a combo still running counts toward the lap
	const event = stepLap(lap, track, car.pos[0], car.pos[2], car.speed, dt, earned);
	if (event === "lap") flash(`LAP ${lap.lap} · ${clock(lap.last)}`);
	if (event === "void") flash("Lap void · stay on the road");
	if (score.active && Math.abs(car.driftAngle) >= CLIP_ANGLE) {
		const zone = zoneAt(lap, track, car.pos[0], car.pos[2]);
		if (zone && awardBonus(score, "Clip zone +300 × multiplier", 300)) {
			lap.zonesDone.add(zone.id);
			flash("CLIP ZONE");
		}
	}
	$("wrong-way").style.display = lap.wrongWay ? "block" : "none";
	$("lap-line").textContent = lap.running
		? `LAP ${lap.lap + 1} ${clock(lap.time)} · BEST ${clock(lap.best)}${lap.valid ? "" : " · VOID"}`
		: lap.best === null
			? "Cross the start line to time a lap"
			: `BEST LAP ${clock(lap.best)} · ${lap.bestScore.toLocaleString()} PTS`;
}

// --- main loop: fixed-rate physics, render every frame ---
let accumulator = 0;
let last = performance.now();
let fpsTime = 0;
let fpsFrames = 0;
let turntable = -Math.PI / 2 - 0.7;
let sparkWait = 0;

function garageFrame(dt) {
	turntable += dt * 0.32;
	model.showParked(GARAGE.x, GARAGE.z, turntable, car);
	camera.fov = 44;
	camera.position.set(GARAGE.x + 9.5, 1.55, GARAGE.z + 2.6);
	camera.lookAt(GARAGE.x, 0.72, GARAGE.z);
	camera.updateProjectionMatrix();
	aimSun(GARAGE.x, GARAGE.z);
	sound.idle();
}

function driveFrame(dt, controls) {
	accumulator += dt;
	sparkWait -= dt;
	while (accumulator >= PHYSICS_DT) {
		stepCar(car, controls, tuning, PHYSICS_DT, world);
		const hit = collideCar(car, world, tuning.Mass);
		if (hit && hit.impact > 1 && sparkWait <= 0) {
			effects.sparks(hit.x, hit.z, Math.min(12, Math.ceil(hit.impact)));
			sparkWait = 0.06;
		}
		if (hit && hit.impact > WALL_HIT) finishScore(score, "Wall hit");
		stepScore(score, { ...car, up: carAxes(car).up[1] }, PHYSICS_DT);
		accumulator -= PHYSICS_DT;
	}
	if (car.pos[1] < -20 || car.pos.some((n) => !Number.isFinite(n))) {
		finishScore(score, "Car recovered");
		placeCar(car, track.spawn.x, track.spawn.z, track.spawn.yaw);
	}

	model.update(car);
	effects.update(car, dt);
	updateCones(dt);
	updateLap(dt);
	payBanked();
	checkBay();
	updateCamera(dt);
	sound.update(car, controls, tuning.TopSpeed / CAR.TopSpeed);
	drawMinimap();

	$("speed").textContent = Math.round(car.speed * 3.6);
	const angle = Math.abs(car.driftAngle);
	$("angle").textContent = angle > 5 ? `${Math.round(angle)}°` : "";
	$("angle-bar").style.width = `${Math.min(100, (angle / 70) * 100)}%`;
	$("preset").textContent = car.preset;
	$("combo-score").textContent = Math.floor(score.points).toLocaleString();
	$("combo-multiplier").textContent = `×${score.multiplier.toFixed(2)}`;
	$("bank-score").textContent = progress.bank.toLocaleString();
	$("best-score").textContent = score.best.toLocaleString();
	$("combo-link").value = score.active ? 1 - score.grace / SCORE_RULES.linkTime : 0;
	$("score-box").classList.toggle("scoring", score.active);
	// A lost combo stays on screen briefly even if the next drift has already started.
	const feedback = score.resultTime > 0 && (!score.active || score.resultTime > 1.6)
		? `${score.result.banked ? "BANKED" : "LOST"} ${score.result.points.toLocaleString()} · ${score.result.reason}`
		: score.hint;
	if ($("score-feedback").textContent !== feedback) $("score-feedback").textContent = feedback;
	$("hint").textContent = HINTS[input.device];
}

function frame(now) {
	if (document.hidden) { last = now; requestAnimationFrame(frame); return; }
	const dt = Math.min(0.1, (now - last) / 1000);
	last = now;
	input.update();
	if (mode === "garage") garageFrame(dt);
	else driveFrame(dt, window.sandbox.override ?? input.controls);

	if (flashTimer > 0 && (flashTimer -= dt) <= 0) $("flash").style.opacity = 0;
	fpsFrames++;
	if ((fpsTime += dt) > 0.5) {
		$("fps").textContent = `${Math.round(fpsFrames / fpsTime)} fps`;
		fpsTime = fpsFrames = 0;
	}

	renderer.render(scene, camera);
	requestAnimationFrame(frame);
}

// Runs the real drive loop without waiting for the screen, so tests work even when the page isn't being drawn.
function advance(seconds, step = 1 / 60) {
	for (let t = 0; t < seconds; t += step) {
		input.update();
		driveFrame(step, window.sandbox.override ?? input.controls);
	}
}

// Debug hooks for testing from the browser console: sandbox.override = { throttle: 1, steer: 0, brake: 0, handbrake: false }
window.sandbox = { car, tuning, score, lap, track, world, garage, openGarage, leaveGarage, garageUi, renderer, scene, camera, advance, sound, progress, override: null };
document.body.classList.add("garage");
yard.garage.setLit(true);
fitView();
requestAnimationFrame(frame);
