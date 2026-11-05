// Draws Rustline Yard from the layout in track.js: sky, gravel, road, kerbs, walls, containers, sheds, lights, signs,
// the garage and the test pad. Everything is original and generated in code. Repeated objects use instancing so phones cope.

import * as THREE from "three";
import { GARAGE, PAD, PADDOCK, ROAD_WIDTH } from "./track.js";

const PINK = 0xff2aa0;

// Same scenery every load.
function random(seed) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function canvasTexture(width, height, draw, repeat = null) {
	const c = document.createElement("canvas");
	c.width = width;
	c.height = height;
	draw(c.getContext("2d"), width, height);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	if (repeat) {
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.repeat.set(repeat[0], repeat[1]);
	}
	return t;
}

function speckle(g, w, h, base, count, low, spread, seed) {
	const r = random(seed);
	g.fillStyle = base;
	g.fillRect(0, 0, w, h);
	for (let i = 0; i < count; i++) {
		const v = low + r() * spread;
		g.fillStyle = `rgb(${v},${v},${v + 5})`;
		g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
	}
}

const asphalt = (repeat) => canvasTexture(512, 512, (g, w, h) => speckle(g, w, h, "#3c3c44", 16000, 42, 46, 3), repeat);

// Flat layers share the ground plane, so each one gets a depth nudge instead of relying on height.
function flat(options, layer) {
	return new THREE.MeshStandardMaterial({ roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 2, ...options });
}

// A strip that follows the track between two sideways offsets (metres right of the centre line).
function ribbon(track, from, count, offA, offB, material, metresPerTile) {
	const positions = [];
	const uvs = [];
	const index = [];
	for (let k = 0; k <= count; k++) {
		const p = track.samples[(from + k) % track.count];
		const v = (k * (track.length / track.count)) / metresPerTile;
		positions.push(p.x + p.rx * offA, 0, p.z + p.rz * offA, p.x + p.rx * offB, 0, p.z + p.rz * offB);
		uvs.push(0, v, 1, v);
		if (k < count) {
			const i = k * 2;
			index.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
	g.setAttribute("normal", new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
	g.setIndex(index);
	const mesh = new THREE.Mesh(g, material);
	mesh.receiveShadow = true;
	return mesh;
}

function rectangle(r, material, tile) {
	const w = r.maxX - r.minX;
	const d = r.maxZ - r.minZ;
	const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
	const uv = g.getAttribute("uv");
	for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
	const mesh = new THREE.Mesh(g, material);
	mesh.position.set((r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2);
	mesh.receiveShadow = true;
	return mesh;
}

function sign(text, { width = 1024, height = 256, color = "#ff2aa0", background = "#12081a", font = "900 150px 'Arial Black', Impact, sans-serif" } = {}) {
	return canvasTexture(width, height, (g, w, h) => {
		g.fillStyle = background;
		g.fillRect(0, 0, w, h);
		g.strokeStyle = color;
		g.lineWidth = 10;
		g.strokeRect(12, 12, w - 24, h - 24);
		g.font = font;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.shadowColor = color;
		g.shadowBlur = 26;
		g.fillStyle = color;
		let size = parseInt(font.match(/(\d+)px/)[1], 10);
		while (g.measureText(text).width > w - 70 && size > 20) {
			size -= 6;
			g.font = font.replace(/\d+px/, `${size}px`);
		}
		g.fillText(text, w / 2, h / 2 + 6);
	});
}

function instanced(geometry, material, items, place) {
	const mesh = new THREE.InstancedMesh(geometry, material, items.length);
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const up = new THREE.Vector3(0, 1, 0);
	items.forEach((item, i) => {
		const { x, y, z, turn = 0, sx = 1, sy = 1, sz = 1, color } = place(item, i);
		q.setFromAxisAngle(up, turn);
		m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
		mesh.setMatrixAt(i, m);
		if (color !== undefined) mesh.setColorAt(i, new THREE.Color(color));
	});
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.frustumCulled = false;
	return mesh;
}

function buildSky(scene, renderer) {
	const texture = canvasTexture(16, 512, (g, w, h) => {
		const grad = g.createLinearGradient(0, 0, 0, h);
		grad.addColorStop(0, "#150a2e");
		grad.addColorStop(0.3, "#3a1a5c");
		grad.addColorStop(0.42, "#8a2f7a");
		grad.addColorStop(0.485, "#ff7a4a");
		grad.addColorStop(0.5, "#ffc070");
		grad.addColorStop(0.52, "#6a3a5a");
		grad.addColorStop(1, "#201428");
		g.fillStyle = grad;
		g.fillRect(0, 0, w, h);
	});
	const sky = new THREE.Mesh(
		new THREE.SphereGeometry(1100, 32, 24),
		new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }),
	);
	scene.add(sky);

	// Reflections for paint and glass come from this same sky.
	const envScene = new THREE.Scene();
	envScene.add(sky.clone());
	const panel = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), new THREE.MeshBasicMaterial({ color: 0xffe0c0, side: THREE.DoubleSide }));
	panel.position.set(300, 200, -300);
	panel.lookAt(0, 0, 0);
	envScene.add(panel);
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(envScene, 0.03).texture;
	scene.environmentIntensity = 0.75;
	pmrem.dispose();

	// Jagged hills all the way round, so the yard doesn't end in empty fog.
	const r = random(11);
	const positions = [];
	const index = [];
	const steps = 180;
	for (let i = 0; i <= steps; i++) {
		const a = (i / steps) * Math.PI * 2;
		const h = 46 + Math.sin(a * 5) * 18 + Math.sin(a * 13 + 1) * 12 + r() * 16;
		positions.push(Math.cos(a) * 900, -4, Math.sin(a) * 900, Math.cos(a) * 900, h, Math.sin(a) * 900);
		if (i < steps) {
			const k = i * 2;
			index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	g.setIndex(index);
	scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x2c1838, side: THREE.DoubleSide, fog: false, toneMapped: false })));
}

function buildGround(scene, track) {
	const gravel = canvasTexture(512, 512, (g, w, h) => {
		const r = random(7);
		g.fillStyle = "#5a4a48";
		g.fillRect(0, 0, w, h);
		for (let i = 0; i < 24000; i++) {
			const v = 62 + r() * 62;
			g.fillStyle = `rgb(${v + 12},${v},${v - 6})`;
			g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
		}
	}, [90, 90]);
	const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 }));
	ground.receiveShadow = true;
	scene.add(ground);

	const road = flat({ map: asphalt([1, 1]) }, 1);
	scene.add(ribbon(track, 0, track.count, -ROAD_WIDTH / 2, ROAD_WIDTH / 2, road, 16));

	const line = flat({ color: 0xe8e8ee }, 2);
	for (const side of [-1, 1]) scene.add(ribbon(track, 0, track.count, side * (ROAD_WIDTH / 2 - 0.55), side * (ROAD_WIDTH / 2 - 0.3), line, 10));

	// Kerbs around every corner, on both sides.
	const kerb = flat({
		map: canvasTexture(64, 64, (g, w, h) => {
			g.fillStyle = "#ff2aa0";
			g.fillRect(0, 0, w, h / 2);
			g.fillStyle = "#101014";
			g.fillRect(0, h / 2, w, h / 2);
		}, [1, 1]),
	}, 2);
	let runStart = null;
	for (let i = 0; i <= track.count; i++) {
		const bent = i < track.count && Math.abs(track.samples[i].curve) > 0.01;
		if (bent && runStart === null) runStart = i;
		if (!bent && runStart !== null) {
			const from = (runStart - 3 + track.count) % track.count;
			const count = i - runStart + 6;
			for (const side of [-1, 1]) scene.add(ribbon(track, from, count, side * (ROAD_WIDTH / 2), side * (ROAD_WIDTH / 2 + 1.3), kerb, 3));
			runStart = null;
		}
	}

	// Clip zones: pink chevrons on the outside of the corners.
	const chevron = flat({
		map: canvasTexture(256, 128, (g, w, h) => {
			g.clearRect(0, 0, w, h);
			g.fillStyle = "rgba(255,42,160,0.26)";
			g.fillRect(0, 0, w, h);
			g.strokeStyle = "rgba(255,120,200,0.95)";
			g.lineWidth = 16;
			g.beginPath();
			g.moveTo(30, h - 8);
			g.lineTo(w / 2, 14);
			g.lineTo(w - 30, h - 8);
			g.stroke();
		}, [1, 1]),
		transparent: true,
		depthWrite: false,
		emissive: PINK,
		emissiveIntensity: 0.28,
	}, 3);
	for (const zone of track.zones) {
		const span = (zone.to - zone.from + track.count) % track.count;
		const inner = zone.side * 1.5;
		const outer = zone.side * (ROAD_WIDTH / 2 - 0.2);
		scene.add(ribbon(track, zone.from, span, Math.min(inner, outer), Math.max(inner, outer), chevron, 6));
	}

	// Checkered start line.
	const start = flat({
		map: canvasTexture(128, 32, (g, w, h) => {
			for (let x = 0; x < 16; x++) {
				for (let y = 0; y < 4; y++) {
					g.fillStyle = (x + y) % 2 ? "#f4f4f8" : "#101014";
					g.fillRect((x * w) / 16, (y * h) / 4, w / 16, h / 4);
				}
			}
		}),
	}, 3);
	const line0 = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 2.4).rotateX(-Math.PI / 2), start);
	line0.position.set(track.samples[0].x, 0, track.samples[0].z);
	line0.rotation.y = Math.atan2(-track.samples[0].tx, -track.samples[0].tz);
	line0.receiveShadow = true;
	scene.add(line0);

	// Test pad: the same grid as before, on its own slab, plus the paddock in front of the garage.
	const grid = canvasTexture(512, 512, (g, w, h) => {
		speckle(g, w, h, "#46464e", 12000, 56, 44, 5);
		g.fillStyle = "rgba(235,235,240,0.55)";
		g.fillRect(0, 0, w, 5);
		g.fillRect(0, 0, 5, h);
	}, [1, 1]);
	scene.add(rectangle(PAD, flat({ map: grid }, 1), 25));
	scene.add(rectangle(PADDOCK, flat({ map: asphalt([1, 1]) }, 1), 16));
}

function buildBarriers(scene, track) {
	const concrete = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
	scene.add(instanced(new THREE.BoxGeometry(1, 1, 0.7), concrete, track.walls, (w, i) => ({
		x: (w.ax + w.bx) / 2,
		y: 0.5,
		z: (w.az + w.bz) / 2,
		turn: Math.atan2(-(w.bz - w.az), w.bx - w.ax),
		sx: w.length + 0.05,
		color: Math.floor(i / 6) % 4 === 0 ? PINK : i % 2 ? 0x8a8a92 : 0x74747c,
	})));

	// Chain-link fence above the wall. It's see-through, so it doesn't box the view in.
	const fence = canvasTexture(128, 128, (g, w, h) => {
		g.clearRect(0, 0, w, h);
		g.strokeStyle = "rgba(170,170,185,0.8)";
		g.lineWidth = 2;
		for (let i = -h; i < w; i += 16) {
			g.beginPath();
			g.moveTo(i, 0);
			g.lineTo(i + h, h);
			g.moveTo(i + h, 0);
			g.lineTo(i, h);
			g.stroke();
		}
	}, [3, 1]);
	const fenceMesh = instanced(
		new THREE.PlaneGeometry(1, 1),
		new THREE.MeshBasicMaterial({ map: fence, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, depthWrite: false }),
		track.walls,
		(w) => ({ x: (w.ax + w.bx) / 2, y: 2.4, z: (w.az + w.bz) / 2, turn: Math.atan2(-(w.bz - w.az), w.bx - w.ax), sx: w.length + 0.05, sy: 2.8 }),
	);
	fenceMesh.castShadow = false;
	scene.add(fenceMesh);

	const tires = track.blocks.filter((b) => b.kind === "tires");
	const stacks = [];
	for (const b of tires) {
		for (let i = -2; i <= 2; i++) {
			for (let level = 0; level < 3; level++) {
				stacks.push({ x: b.x + i * 1.26 * b.cos, y: 0.17 + level * 0.32, z: b.z - i * 1.26 * b.sin, color: level === 1 && i % 2 === 0 ? PINK : 0x1a1a1f });
			}
		}
	}
	scene.add(instanced(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), stacks, (s) => s));
}

function containerMaterial() {
	const map = canvasTexture(128, 64, (g, w, h) => {
		g.fillStyle = "#ffffff";
		g.fillRect(0, 0, w, h);
		for (let x = 0; x < w; x += 8) {
			g.fillStyle = "rgba(0,0,0,0.22)";
			g.fillRect(x, 0, 3, h);
		}
		g.fillStyle = "rgba(60,30,10,0.25)";
		g.fillRect(0, h - 8, w, 8);
	});
	return new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.75, metalness: 0.2 });
}

function buildScenery(scene, track) {
	const r = random(21);
	const colors = [0xb0401e, 0x1e6a7a, 0x8a7a1e, 0x4a2a6a, 0x7a2030, 0x2a5a3a, 0x9a9aa2];
	const pick = () => colors[Math.floor(r() * colors.length)];
	const containers = [];
	for (const b of track.blocks) {
		if (b.kind !== "container") continue;
		containers.push({ x: b.x, y: 1.3, z: b.z, turn: b.turn, sx: b.hx * 2, sz: b.hz * 2, color: pick() });
		if (r() > 0.4) containers.push({ x: b.x, y: 3.9, z: b.z, turn: b.turn + 0.03, sx: b.hx * 2, sz: b.hz * 2, color: pick() });
	}

	const offset = ROAD_WIDTH / 2 + 9;
	const sheds = [];
	const masts = [];
	const boards = [];
	const clear = (x, z, room) => track.distanceToRoad(x, z) > room;
	for (let i = 0; i < track.count; i += 6) {
		const p = track.samples[i];
		const out = track.outer;
		const roll = r();
		if (i % 42 === 0) {
			const x = p.x + p.rx * out * (offset + 2.5);
			const z = p.z + p.rz * out * (offset + 2.5);
			if (clear(x, z, offset)) masts.push({ x, z });
		}
		if (roll < 0.34) {
			// A stack of containers past the wall, turned to follow the road.
			const dist = offset + 9 + r() * 12;
			const x = p.x + p.rx * out * dist;
			const z = p.z + p.rz * out * dist;
			if (!clear(x, z, offset + 6)) continue;
			const turn = Math.atan2(-p.tz, p.tx) + (r() - 0.5) * 0.3;
			for (let level = 0; level < 1 + Math.floor(r() * 3); level++) {
				containers.push({ x, y: 1.3 + level * 2.6, z, turn: turn + (r() - 0.5) * 0.06, sx: 12.2, sz: 2.6, color: pick() });
			}
		} else if (roll < 0.46) {
			const dist = offset + 40 + r() * 40;
			const x = p.x + p.rx * out * dist;
			const z = p.z + p.rz * out * dist;
			if (clear(x, z, offset + 30) && sheds.every((s) => Math.hypot(s.x - x, s.z - z) > 60)) {
				sheds.push({ x, z, turn: Math.atan2(-p.tz, p.tx), w: 36 + r() * 30, d: 22 + r() * 16, h: 10 + r() * 9 });
			}
		} else if (roll < 0.53 && boards.length < 10) {
			const dist = offset + 5;
			const x = p.x + p.rx * out * dist;
			const z = p.z + p.rz * out * dist;
			if (clear(x, z, offset + 1)) boards.push({ x, z, turn: Math.atan2(p.rx * -out, p.rz * -out) });
		}
	}
	scene.add(instanced(new THREE.BoxGeometry(1, 2.6, 1), containerMaterial(), containers, (c) => c));

	const shedWall = canvasTexture(256, 128, (g, w, h) => {
		g.fillStyle = "#6a6470";
		g.fillRect(0, 0, w, h);
		for (let x = 0; x < w; x += 10) {
			g.fillStyle = "rgba(0,0,0,0.16)";
			g.fillRect(x, 0, 2, h);
		}
		for (let x = 16; x < w; x += 58) {
			g.fillStyle = "#ffb060";
			g.fillRect(x, 26, 34, 18);
		}
	}, [2, 1]);
	scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: shedWall, roughness: 0.9 }), sheds, (s) => ({
		x: s.x, y: s.h / 2, z: s.z, turn: s.turn, sx: s.w, sy: s.h, sz: s.d,
	})));
	scene.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 3).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.8 }), sheds, (s) => ({
		x: s.x, y: s.h + 1.5, z: s.z, turn: s.turn, sx: s.w, sy: 3, sz: s.d * 1.5,
	})));

	const steel = new THREE.MeshStandardMaterial({ color: 0x4a4a54, metalness: 0.6, roughness: 0.5 });
	scene.add(instanced(new THREE.CylinderGeometry(0.16, 0.26, 16, 8), steel, masts, (m) => ({ x: m.x, y: 8, z: m.z })));
	scene.add(instanced(new THREE.BoxGeometry(3.2, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe2b8, toneMapped: false }), masts, (m) => ({ x: m.x, y: 16, z: m.z })));
	const halo = canvasTexture(64, 64, (g, w, h) => {
		const grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
		grad.addColorStop(0, "rgba(255,226,184,0.9)");
		grad.addColorStop(1, "rgba(255,200,140,0)");
		g.fillStyle = grad;
		g.fillRect(0, 0, w, h);
	});
	const haloMaterial = new THREE.SpriteMaterial({ map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
	for (const m of masts) {
		const s = new THREE.Sprite(haloMaterial);
		s.position.set(m.x, 16, m.z);
		s.scale.setScalar(13);
		scene.add(s);
	}

	const words = ["SMOKE CULT", "BURN CLEAN", "RUSTLINE YARD", "GRITWORKS OIL", "NO BRAKES CLUB", "TIRE GRAVE"];
	const tones = ["#ff2aa0", "#20e0ff", "#ffb020", "#a0ff20", "#ff2aa0", "#20e0ff"];
	const textures = words.map((w, i) => sign(w, { color: tones[i] }));
	boards.forEach((b, i) => {
		const group = new THREE.Group();
		const face = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25), new THREE.MeshBasicMaterial({ map: textures[i % words.length], toneMapped: false }));
		face.position.y = 6.2;
		group.add(face);
		for (const side of [-1, 1]) {
			const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), steel);
			post.position.set(side * 5, 3, -0.15);
			group.add(post);
		}
		group.position.set(b.x, 0, b.z);
		group.rotation.y = b.turn;
		scene.add(group);
	});
}

function buildGantry(scene, track) {
	const s = track.samples[0];
	const group = new THREE.Group();
	const steel = new THREE.MeshStandardMaterial({ color: 0x24242c, metalness: 0.6, roughness: 0.4 });
	const half = ROAD_WIDTH / 2 + 1.4;
	for (const side of [-1, 1]) {
		const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8.6, 0.5), steel);
		post.position.set(side * half, 4.3, 0);
		post.castShadow = true;
		group.add(post);
	}
	const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.5, 2.2, 0.4), steel);
	beam.position.y = 7.9;
	group.add(beam);
	const banner = sign("SMOKE CULT", { width: 1024, height: 128, font: "900 96px 'Arial Black', Impact, sans-serif" });
	for (const [z, turn] of [[0.22, 0], [-0.22, Math.PI]]) {
		const face = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 2), new THREE.MeshBasicMaterial({ map: banner, toneMapped: false }));
		face.position.set(0, 7.9, z);
		face.rotation.y = turn;
		group.add(face);
	}
	group.position.set(s.x, 0, s.z);
	group.rotation.y = Math.atan2(-s.tx, -s.tz);
	scene.add(group);
}

function buildGarage(scene) {
	const group = new THREE.Group();
	const { x, z, halfX, halfZ } = GARAGE;
	const height = 6.4;
	const wall = new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.85 });
	const add = (w, h, d, px, py, pz, material = wall) => {
		const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
		m.position.set(px, py, pz);
		m.receiveShadow = true;
		m.castShadow = true;
		group.add(m);
		return m;
	};
	add(0.4, height, halfZ * 2, -halfX, height / 2, 0); // back wall; the open side faces the track
	add(halfX * 2, height, 0.4, 0, height / 2, -halfZ);
	add(halfX * 2, height, 0.4, 0, height / 2, halfZ);
	add(halfX * 2 + 0.6, 0.35, halfZ * 2 + 0.6, 0, height + 0.15, 0);
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(halfX * 2, halfZ * 2).rotateX(-Math.PI / 2),
		flat({
			map: canvasTexture(256, 256, (g, w, h) => {
				for (let i = 0; i < 8; i++) {
					for (let j = 0; j < 8; j++) {
						g.fillStyle = (i + j) % 2 ? "#26222c" : "#34303a";
						g.fillRect((i * w) / 8, (j * h) / 8, w / 8, h / 8);
					}
				}
			}, [3, 3]),
			roughness: 0.7,
			metalness: 0.05,
		}, 4),
	);
	floor.position.y = 0.02;
	floor.receiveShadow = true;
	group.add(floor);

	const neon = new THREE.MeshBasicMaterial({ color: PINK, toneMapped: false });
	const cyan = new THREE.MeshBasicMaterial({ color: 0x20e0ff, toneMapped: false });
	const white = new THREE.MeshBasicMaterial({ color: 0xfff0e0, toneMapped: false });
	for (const pz of [-halfZ + 0.3, halfZ - 0.3]) add(halfX * 1.9, 0.09, 0.09, 0, 2.7, pz, neon);
	add(0.09, 0.09, halfZ * 1.85, -halfX + 0.3, 2.7, 0, cyan);
	for (const px of [-7, 0, 7]) add(0.28, 0.06, halfZ * 1.3, px, height - 0.1, 0, white);

	const ring = new THREE.Mesh(new THREE.RingGeometry(3.45, 3.6, 64).rotateX(-Math.PI / 2), neon);
	ring.position.y = 0.04;
	group.add(ring);

	// Tool chests and a rack of spare tires along the back.
	const red = new THREE.MeshStandardMaterial({ color: 0x8a1830, metalness: 0.5, roughness: 0.35 });
	for (const pz of [-8.4, -6.3]) {
		add(0.9, 1.3, 1.9, -halfX + 0.9, 0.65, pz, red);
		add(0.92, 0.04, 1.92, -halfX + 0.9, 0.9, pz, wall);
	}
	const tire = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.9 });
	for (let i = 0; i < 5; i++) {
		for (let level = 0; level < 2; level++) {
			const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.13, 8, 18).rotateY(Math.PI / 2), tire);
			t.position.set(-halfX + 0.55, 0.47 + level * 0.92, 5 + i * 0.5);
			group.add(t);
		}
	}
	const banner = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25), new THREE.MeshBasicMaterial({ map: sign("SMOKE CULT GARAGE"), toneMapped: false }));
	banner.position.set(-halfX + 0.25, 4.5, 0);
	banner.rotation.y = Math.PI / 2;
	group.add(banner);
	const outside = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.4), new THREE.MeshBasicMaterial({ map: sign("GARAGE", { color: "#20e0ff" }), toneMapped: false }));
	outside.position.set(halfX + 0.05, height - 0.5, 0);
	outside.rotation.y = Math.PI / 2;
	group.add(outside);

	const lamps = [[-3, 5.2, 0, 0xfff0e0, 34], [5, 3.5, 7, 0xff2aa0, 24], [5, 3.5, -7, 0x20e0ff, 24]].map(([px, py, pz, color, power]) => {
		const lamp = new THREE.PointLight(color, power, 26, 1.7);
		lamp.position.set(px, py, pz);
		lamp.visible = false;
		group.add(lamp);
		return lamp;
	});
	group.position.set(x, 0, z);
	scene.add(group);
	return { setLit: (on) => lamps.forEach((l) => (l.visible = on)) };
}

export function buildYard(scene, renderer, track) {
	buildSky(scene, renderer);
	buildGround(scene, track);
	buildBarriers(scene, track);
	buildScenery(scene, track);
	buildGantry(scene, track);
	return { garage: buildGarage(scene) };
}
