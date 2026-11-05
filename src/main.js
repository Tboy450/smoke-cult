// Drift sandbox: the M1 test pad, one car, chase camera, HUD and a live tuning panel.

import * as THREE from "three";
import { createCarModel } from "./carModel.js";
import { createEffects } from "./effects.js";
import { createInput } from "./input.js";
import { createCar, resetCar, stepCar, carAxes } from "./physics.js";
import { CAR, PRESET_ORDER, RANGES } from "./tuning.js";
import { createTuningPanel } from "./tuningPanel.js";

const PHYSICS_DT = 1 / 240;
const tuning = { ...CAR };

// --- renderer, scene, light ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6a3a7a);
scene.fog = new THREE.Fog(0x6a3a7a, 80, 420);
scene.add(new THREE.HemisphereLight(0xffd6f0, 0x3a2a40, 2.2));
const sun = new THREE.DirectionalLight(0xffc890, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 150 });
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1000);
addEventListener("resize", () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

// --- test pad: asphalt lot, painted grid, cones ---
function asphaltTexture() {
	const c = document.createElement("canvas");
	c.width = c.height = 512;
	const g = c.getContext("2d");
	g.fillStyle = "#4a4a52";
	g.fillRect(0, 0, 512, 512);
	for (let i = 0; i < 9000; i++) {
		const v = 60 + Math.random() * 40;
		g.fillStyle = `rgb(${v},${v},${v + 6})`;
		g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
	}
	g.fillStyle = "rgba(235,235,240,0.55)";
	g.fillRect(0, 0, 512, 4); // grid line every tile (25 m)
	g.fillRect(0, 0, 4, 512);
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set(32, 32);
	t.anisotropy = 8;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}
const ground = new THREE.Mesh(
	new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2),
	new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }),
);
ground.receiveShadow = true;
scene.add(ground);

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

// --- car ---
const SPAWN = [0, 1, 30];
const car = createCar(tuning, SPAWN, 0);
const model = createCarModel(scene, tuning);
const effects = createEffects(scene);

// --- HUD ---
const $ = (id) => document.getElementById(id);
const HINTS = {
	keyboard: "W gas · S brake/reverse · A/D steer · SPACE handbrake · T assist · R reset · C camera · TAB tuning · M sound",
	gamepad: "RT gas · LT brake/reverse · Left stick steer · A/X handbrake · D-pad ↑ assist · D-pad ↓ reset · Y camera · Menu tuning",
	touch: "Drag left side to steer · GAS / BRAKE / HB on the right · TUNE for settings",
};
const touchLayout = matchMedia("(any-pointer: coarse), (max-width: 700px)");
const syncTouchLayout = () => document.body.classList.toggle("touch", touchLayout.matches);
syncTouchLayout();
touchLayout.addEventListener("change", syncTouchLayout);

let cameraMode = 0; // 0 chase, 1 low drift cam, 2 hood
const CAMERA_NAMES = ["Chase", "Drift cam", "Hood"];
const cycle = (list, current) => list[(list.indexOf(current) + 1) % list.length];
const tuningPanel = createTuningPanel($("tune"), $("tune-close"));
const input = createInput({
	onPreset: () => {
		car.preset = cycle(PRESET_ORDER, car.preset);
		syncPresetButtons();
	},
	onReset: () => {
		resetCar(car, tuning);
		effects.clearSkids();
		for (const c of cones) {
			c.hit = false;
			c.mesh.position.copy(c.home);
			c.mesh.rotation.set(0, 0, 0);
		}
	},
	onCamera: () => {
		cameraMode = (cameraMode + 1) % CAMERA_NAMES.length;
		flash(CAMERA_NAMES[cameraMode]);
	},
	onTune: () => tuningPanel.toggle(),
	onMute: () => sound.toggle(),
	onController: (standard) => flash(standard ? "Controller connected" : "Controller connected (basic mode)"),
	// The open panel covers the touch controls. Keyboard and controller keep driving so changes can be felt live.
	isTouchBlocked: () => $("tune").classList.contains("open"),
});

let flashTimer = 0;
function flash(text) {
	$("flash").textContent = text;
	$("flash").style.opacity = 1;
	flashTimer = 1.2;
}

// --- tuning panel ---
const tuneRows = $("tune-rows");
for (const [name, [min, max, step]] of Object.entries(RANGES)) {
	const row = document.createElement("label");
	row.innerHTML = `<span>${name}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
	const slider = row.querySelector("input");
	const out = row.querySelector("output");
	const show = () => (out.textContent = Number(tuning[name]).toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0));
	slider.value = tuning[name];
	show();
	slider.addEventListener("input", () => {
		tuning[name] = Number(slider.value);
		show();
	});
	row.dataset.name = name;
	tuneRows.appendChild(row);
}
function syncPresetButtons() {
	for (const b of document.querySelectorAll("#tune-presets button")) b.classList.toggle("on", b.dataset.preset === car.preset);
}
for (const name of PRESET_ORDER) {
	const b = document.createElement("button");
	b.textContent = name;
	b.dataset.preset = name;
	b.addEventListener("click", () => {
		car.preset = name;
		syncPresetButtons();
	});
	$("tune-presets").appendChild(b);
}
syncPresetButtons();
$("tune-reset").addEventListener("click", () => {
	Object.assign(tuning, CAR);
	for (const row of tuneRows.children) {
		row.querySelector("input").value = tuning[row.dataset.name];
		row.querySelector("input").dispatchEvent(new Event("input"));
	}
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

// --- engine + tire sound (starts after the first key/tap, as browsers require) ---
const sound = (() => {
	let ctx = null;
	let engine, engineGain, squealGain, master;
	let muted = false;
	const start = () => {
		if (ctx) return;
		ctx = new AudioContext();
		master = ctx.createGain();
		master.gain.value = 0.25;
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
	};
	addEventListener("keydown", start, { once: true });
	addEventListener("pointerdown", start, { once: true });
	return {
		toggle() {
			muted = !muted;
			if (master) master.gain.value = muted ? 0 : 0.25;
			flash(muted ? "Sound off" : "Sound on");
		},
		update(car, controls) {
			if (!ctx) return;
			// Fake 5-speed gearbox: rpm climbs in each gear band.
			const v = Math.max(0, car.forwardSpeed);
			const gearTop = [11, 20, 30, 42, 60];
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
})();

// --- camera ---
const camPos = new THREE.Vector3(0, 4, 40);
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
	sun.position.set(pos.x + 25, 45, pos.z + 15);
	sun.target.position.copy(pos);
}

// --- cones get knocked flying ---
function updateCones(dt) {
	const { look, right } = carAxes(car);
	for (const c of cones) {
		const p = c.mesh.position;
		if (!c.hit) {
			const rel = [p.x - car.pos[0], 0, p.z - car.pos[2]];
			const along = rel[0] * look[0] + rel[2] * look[2];
			const across = rel[0] * right[0] + rel[2] * right[2];
			if (Math.abs(along) < 2.4 && Math.abs(across) < 1.1) {
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

// --- main loop: fixed-rate physics, render every frame ---
let accumulator = 0;
let last = performance.now();
let fpsTime = 0;
let fpsFrames = 0;
function frame(now) {
	const dt = Math.min(0.1, (now - last) / 1000);
	last = now;
	input.update();
	const controls = window.sandbox.override ?? input.controls;
	accumulator += dt;
	while (accumulator >= PHYSICS_DT) {
		stepCar(car, controls, tuning, PHYSICS_DT);
		accumulator -= PHYSICS_DT;
	}
	if (car.pos[1] < -20 || car.pos.some(Number.isNaN)) resetCar(car, tuning);

	model.update(car);
	effects.update(car, dt);
	updateCones(dt);
	updateCamera(dt);
	sound.update(car, controls);

	$("speed").textContent = Math.round(car.speed * 3.6);
	const angle = Math.abs(car.driftAngle);
	$("angle").textContent = angle > 5 ? `${Math.round(angle)}°` : "";
	$("angle-bar").style.width = `${Math.min(100, (angle / 70) * 100)}%`;
	$("preset").textContent = car.preset;
	$("hint").textContent = HINTS[input.device];
	if (flashTimer > 0 && (flashTimer -= dt) <= 0) $("flash").style.opacity = 0;
	fpsFrames++;
	if ((fpsTime += dt) > 0.5) {
		$("fps").textContent = `${Math.round(fpsFrames / fpsTime)} fps`;
		fpsTime = fpsFrames = 0;
	}

	renderer.render(scene, camera);
	requestAnimationFrame(frame);
}

// Debug hooks for testing from the browser console: sandbox.override = { throttle: 1, steer: 0, brake: 0, handbrake: false }
window.sandbox = { car, tuning, override: null };
requestAnimationFrame(frame);
