// The car you see, built in code from each car's side profile in cars.js: a real body with cut wheel arches, a glass
// cabin, a helmeted driver, and the paint, rims and underglow picked in the garage.
// A car with glb set in cars.js loads that Blender/Houdini model instead (export rules in assets/README.md).

import * as THREE from "three";
import { mergeGeometries, mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const DARK = new THREE.MeshStandardMaterial({ color: 0x0d0d11, roughness: 0.8 });
const TRIM = new THREE.MeshStandardMaterial({ color: 0x17171c, metalness: 0.4, roughness: 0.45 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x18222e, metalness: 0.75, roughness: 0.08, transparent: true, opacity: 0.86 });
const HEAD = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 3 });
const TAIL = new THREE.MeshStandardMaterial({ color: 0xff1030, emissive: 0xff1030, emissiveIntensity: 3 });
const TIRE = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.92 });

function box(w, h, d, material, x, y, z) {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	return mesh;
}

// Extrude a side profile across the car's width. Shape x is -z, so after turning, the nose ends up toward -Z.
function extrudeAcross(shape, halfWidth, bevel, curveSegments = 18) {
	const depth = Math.max(0.02, halfWidth * 2 - bevel * 2);
	const g = new THREE.ExtrudeGeometry(shape, {
		depth, steps: 1, curveSegments, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3,
	});
	g.translate(0, 0, -depth / 2);
	g.rotateY(Math.PI / 2);
	return g;
}

// Narrow the shape by a function of (y, z), then smooth it, keeping hard edges where surfaces really turn.
function shapeAndSmooth(g, scaleAt) {
	const p = g.getAttribute("position");
	for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * scaleAt(p.getY(i), p.getZ(i)));
	g.deleteAttribute("normal");
	g.deleteAttribute("uv");
	return toCreasedNormals(mergeVertices(g, 1e-3), 0.65);
}

function bodyGeometry(def, archRadius, wheelY) {
	const nose = def.upper[0];
	const tail = def.upper[def.upper.length - 1];
	const s = new THREE.Shape();
	s.moveTo(-nose[0], def.floor);
	s.lineTo(-nose[0], nose[1]);
	s.splineThru(def.upper.slice(1).map(([z, y]) => new THREE.Vector2(-z, y)));
	s.lineTo(-tail[0], def.floor);
	// Along the floor from tail to nose, cutting an arch over each axle.
	const a = Math.asin(Math.max(-1, Math.min(1, (def.floor - wheelY) / archRadius)));
	const half = def.wheelbase / 2;
	for (const cx of [-half, half]) {
		s.lineTo(cx - archRadius * Math.cos(a), def.floor);
		s.absarc(cx, wheelY, archRadius, Math.PI - a, a, true);
	}
	s.lineTo(-nose[0], def.floor);

	const [front, rear] = def.taper;
	const noseZ = nose[0];
	const tailZ = tail[0];
	return shapeAndSmooth(extrudeAcross(s, def.width, 0.07), (y, z) => {
		const end = z < 0 ? Math.min(1, Math.max(0, (z - noseZ * 0.62) / (noseZ * 0.38))) : Math.min(1, Math.max(0, (z - tailZ * 0.66) / (tailZ * 0.34)));
		const plan = 1 - (1 - (z < 0 ? front : rear)) * end * end;
		const shoulder = 1 - 0.09 * Math.max(0, (y - 0.02) / 0.28); // sides lean in toward the top
		return plan * shoulder;
	});
}

function glassGeometry(def) {
	const g0 = def.glass[0];
	const last = def.glass[def.glass.length - 1];
	const baseY = Math.min(g0[1], last[1]) - 0.03;
	const topY = Math.max(...def.glass.map((p) => p[1]));
	const s = new THREE.Shape();
	s.moveTo(-g0[0], baseY);
	s.lineTo(-g0[0], g0[1]);
	s.splineThru(def.glass.slice(1).map(([z, y]) => new THREE.Vector2(-z, y)));
	s.lineTo(-last[0], baseY);
	s.lineTo(-g0[0], baseY);
	return shapeAndSmooth(extrudeAcross(s, def.width * 0.86, 0.05, 14), (y) => 1 - 0.2 * Math.max(0, (y - baseY) / (topY - baseY)));
}

// The painted roof: a thin skin over the top of the cabin, between the pillars.
function roofGeometry(def) {
	const top = def.glass.slice(1, -1);
	const baseY = Math.min(def.glass[0][1], def.glass[def.glass.length - 1][1]) - 0.03;
	const topY = Math.max(...def.glass.map((p) => p[1]));
	const s = new THREE.Shape();
	s.moveTo(-top[0][0], top[0][1] - 0.035);
	s.lineTo(-top[0][0], top[0][1] + 0.015);
	s.splineThru(top.slice(1).map(([z, y]) => new THREE.Vector2(-z, y + 0.015)));
	s.lineTo(-top[top.length - 1][0], top[top.length - 1][1] - 0.035);
	return shapeAndSmooth(extrudeAcross(s, def.width * 0.87, 0.02, 12), (y) => 1 - 0.2 * Math.max(0, (y - baseY) / (topY - baseY)));
}

// One wheel's shapes, merged by material. Three draw calls per wheel instead of seventeen, which phones feel.
function wheelGeometry(radius, style) {
	const width = 0.27;
	const dishes = [];
	const metal = [];
	const spokes = (x, count, length, thick, turn = 0, at = 0.36) => {
		for (let i = 0; i < count; i++) {
			const angle = (i / count) * Math.PI * 2;
			const g = new THREE.BoxGeometry(0.022, length, thick).rotateY(turn).rotateX(-angle);
			metal.push(g.translate(x, Math.cos(angle) * radius * at, Math.sin(angle) * radius * at));
		}
	};
	const ring = (x, at, tube) => metal.push(new THREE.TorusGeometry(radius * at, radius * tube, 8, 28).rotateY(Math.PI / 2).translate(x, 0, 0));
	for (const side of [-1, 1]) {
		const face = side * (width / 2);
		dishes.push(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, 0.012, 24).rotateZ(Math.PI / 2).translate(face + side * 0.002, 0, 0));
		metal.push(new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, 0.03, 12).rotateZ(Math.PI / 2).translate(face + side * 0.012, 0, 0));
		if (style === "dish") {
			ring(face + side * 0.006, 0.76, 0.085);
			spokes(face - side * 0.03, 5, radius * 0.4, radius * 0.11, 0, 0.24);
		} else {
			ring(face + side * 0.004, 0.68, 0.055);
		}
		if (style === "five") spokes(face + side * 0.01, 5, radius * 0.6, radius * 0.13);
		if (style === "mesh") {
			spokes(face + side * 0.01, 10, radius * 0.62, radius * 0.045);
			ring(face + side * 0.01, 0.42, 0.024);
		}
		if (style === "steel") {
			metal.push(new THREE.CylinderGeometry(radius * 0.63, radius * 0.63, 0.02, 24).rotateZ(Math.PI / 2).translate(face + side * 0.006, 0, 0));
			ring(face + side * 0.018, 0.34, 0.03);
		}
		if (style === "turbine") spokes(face + side * 0.01, 12, radius * 0.56, radius * 0.1, 0.7);
	}
	return {
		tire: new THREE.CylinderGeometry(radius, radius, width, 28).rotateZ(Math.PI / 2),
		dish: mergeGeometries(dishes),
		metal: mergeGeometries(metal),
	};
}

function makeWheel(parts, rimMaterial) {
	const group = new THREE.Group();
	const tire = new THREE.Mesh(parts.tire, TIRE);
	tire.castShadow = true;
	group.add(tire, new THREE.Mesh(parts.dish, DARK), new THREE.Mesh(parts.metal, rimMaterial));
	return group;
}

function makeDriver(def) {
	const group = new THREE.Group();
	const suit = new THREE.MeshStandardMaterial({ color: 0x221a2c, roughness: 0.7 });
	const shell = new THREE.MeshStandardMaterial({ color: 0xf0ece4, metalness: 0.2, roughness: 0.28 });
	const visor = new THREE.MeshStandardMaterial({ color: 0x24001a, metalness: 1, roughness: 0.06 });
	const stripe = new THREE.MeshStandardMaterial({ color: 0xff2aa0, emissive: 0xff2aa0, emissiveIntensity: 1.2 });
	group.add(box(0.36, 0.34, 0.24, suit, 0, -0.26, 0.02));
	const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 14), shell);
	const face = new THREE.Mesh(new THREE.SphereGeometry(0.157, 20, 12, Math.PI * 0.68, Math.PI * 0.64, Math.PI * 0.33, Math.PI * 0.27), visor);
	const band = new THREE.Mesh(new THREE.TorusGeometry(0.157, 0.012, 6, 28, Math.PI).rotateY(Math.PI / 2), stripe);
	group.add(helmet, face, band);
	group.position.set(-def.width * 0.4, def.seatY, def.seatZ);
	return group;
}

function glowTexture() {
	const c = document.createElement("canvas");
	c.width = c.height = 128;
	const g = c.getContext("2d");
	const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
	grad.addColorStop(0, "rgba(255,255,255,0.85)");
	grad.addColorStop(0.55, "rgba(255,255,255,0.3)");
	grad.addColorStop(1, "rgba(255,255,255,0)");
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	return new THREE.CanvasTexture(c);
}

// Decals live on a copy of the body, wrapped on like a sticker sheet. The lower half of the sheet is the car's side and the
// upper half is the top, so shapes need to read well mirrored on both sides.
function addDecalUv(g, def) {
	const position = g.getAttribute("position");
	const normal = g.getAttribute("normal");
	const zMin = def.upper[0][0];
	const zLength = def.upper[def.upper.length - 1][0] - zMin;
	const clamp = (n) => Math.min(1, Math.max(0, n));
	const uv = new Float32Array(position.count * 2);
	for (let t = 0; t < position.count; t += 3) {
		const nx = Math.abs(normal.getX(t) + normal.getX(t + 1) + normal.getX(t + 2));
		const ny = Math.abs(normal.getY(t) + normal.getY(t + 1) + normal.getY(t + 2));
		const nz = Math.abs(normal.getZ(t) + normal.getZ(t + 1) + normal.getZ(t + 2));
		for (let i = t; i < t + 3; i++) {
			if (nz > nx && nz > ny) continue; // nose and tail stay clean: a blank corner of the sheet
			uv[i * 2] = clamp((position.getZ(i) - zMin) / zLength);
			uv[i * 2 + 1] = nx > ny
				? 0.5 * clamp((position.getY(i) - def.floor) / (0.4 - def.floor))
				: 0.5 + 0.5 * clamp((position.getX(i) + def.width) / (def.width * 2));
		}
	}
	g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function drawDecal(g, style, W) {
	const X = (u) => u * W;
	const side = (y) => W - (y * W) / 2;
	const top = (x) => W / 2 - (x * W) / 2;
	g.fillStyle = g.strokeStyle = "#fff";
	const flames = (at) => {
		g.beginPath();
		g.moveTo(X(0.03), at(0.16));
		[0.42, 0.3, 0.5, 0.34].forEach((tip, i) => {
			const a = 0.16 + i * 0.17;
			g.quadraticCurveTo(X(tip * 0.6), at(a), X(tip), at(a + 0.085));
			g.quadraticCurveTo(X(tip * 0.6), at(a + 0.17), X(0.12), at(a + 0.17));
		});
		g.lineTo(X(0.03), at(0.84));
		g.closePath();
		g.fill();
	};
	if (style === "stripes") {
		g.fillRect(X(0.015), top(0.65), W, top(0.54) - top(0.65));
		g.fillRect(X(0.015), top(0.46), W, top(0.35) - top(0.46));
	} else if (style === "slash") {
		for (const [u, wide] of [[0.34, 0.11], [0.48, 0.04]]) {
			g.beginPath();
			g.moveTo(X(u), side(0.12));
			g.lineTo(X(u + wide), side(0.12));
			g.lineTo(X(u + wide + 0.16), side(0.82));
			g.lineTo(X(u + 0.16), side(0.82));
			g.closePath();
			g.fill();
		}
	} else if (style === "flames") {
		flames(side);
		flames(top);
	} else if (style === "checker") {
		const cell = 0.032;
		for (let col = 0; col < 16; col++) {
			for (let row = 0; row < 7; row++) {
				if ((col + row) % 2 || (col * 7 + row * 3) % 16 > col) continue;
				g.fillRect(X(0.46 + col * cell), side(0.14 + (row + 1) * 0.1), X(cell), side(0) - side(0.1));
			}
		}
	} else if (style === "ring") {
		g.lineWidth = 15;
		for (const [x, y, ry] of [[X(0.2), top(0.5), 70], [X(0.5), side(0.48), 130]]) {
			g.beginPath();
			g.ellipse(x, y, 58, ry, 0, 0, Math.PI * 2);
			g.moveTo(x, y + ry * 0.62);
			g.bezierCurveTo(x + 50, y + ry * 0.25, x - 50, y - ry * 0.25, x, y - ry * 0.62);
			g.stroke();
		}
	}
}

const decalTextures = new Map();
function decalTexture(style) {
	if (!decalTextures.has(style)) {
		const c = document.createElement("canvas");
		c.width = c.height = 1024;
		drawDecal(c.getContext("2d"), style, 1024);
		const t = new THREE.CanvasTexture(c);
		t.colorSpace = THREE.SRGBColorSpace;
		t.anisotropy = 4;
		decalTextures.set(style, t);
	}
	return decalTextures.get(style);
}

function addDetails(group, def, paint, kit, archRadius, wheelY) {
	const w = def.width;
	const [noseZ, noseY] = def.upper[0];
	const tailZ = def.upper[def.upper.length - 1][0];
	// Nose: grille, splitter, lights.
	group.add(box(w * 1.15, 0.13, 0.05, DARK, 0, noseY + 0.04, noseZ + 0.02));
	group.add(box(w * 2.04, 0.05, 0.42, TRIM, 0, def.floor - 0.015, noseZ + 0.17));
	for (const side of [-1, 1]) {
		group.add(box(w * 0.5, 0.055, 0.1, HEAD, side * w * 0.56, noseY + 0.24, noseZ + 0.14));
		group.add(box(w * 0.58, 0.07, 0.04, TAIL, side * w * 0.52, 0.12, tailZ + 0.0));
		group.add(box(0.04, 0.07, 1.7, TRIM, side * (w - 0.015), def.floor + 0.03, 0)); // side skirt
		group.add(box(0.09, 0.055, 0.15, paint, side * (w * 0.92), def.glass[0][1] + 0.05, def.glass[0][0] + 0.32)); // mirror
	}
	// Tail: bumper trim and twin exhausts.
	group.add(box(w * 1.7, 0.1, 0.05, DARK, 0, def.floor + 0.12, tailZ + 0.01));
	for (const x of [-w * 0.42, -w * 0.28]) {
		const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.16, 12).rotateX(Math.PI / 2), TRIM);
		tip.position.set(x, def.floor + 0.05, tailZ - 0.03);
		group.add(tip);
	}
	const deckY = def.upper[def.upper.length - 2][1];
	const deckZ = def.upper[def.upper.length - 2][0];
	const wing = kit === "track" ? "gt" : def.wing;
	if (wing === "gt") {
		group.add(box(w * 1.95, 0.035, 0.34, TRIM, 0, deckY + 0.3, deckZ - 0.02));
		for (const side of [-1, 1]) {
			group.add(box(0.035, 0.32, 0.16, TRIM, side * w * 0.6, deckY + 0.14, deckZ));
			group.add(box(0.025, 0.13, 0.36, paint, side * w * 0.97, deckY + 0.3, deckZ - 0.02));
		}
	} else if (wing === "duck") {
		const lip = box(w * 1.6, 0.05, 0.3, paint, 0, deckY + 0.05, deckZ);
		lip.rotation.x = 0.28;
		group.add(lip);
	}
	if (kit === "street" || kit === "track") {
		group.add(box(w * 2.1, 0.04, 0.52, paint, 0, def.floor - 0.035, noseZ + 0.2)); // deeper front lip
		for (const side of [-1, 1]) group.add(box(0.07, 0.11, def.wheelbase - 1.05, paint, side * (w + 0.01), def.floor + 0.04, 0));
	}
	if (kit === "track") {
		for (const side of [-1, 1]) {
			const canard = box(0.24, 0.02, 0.17, TRIM, side * w * 0.9, noseY + 0.1, noseZ + 0.34);
			canard.rotation.z = side * 0.28;
			group.add(canard);
		}
		const top = Math.max(...def.glass.map((p) => p[1]));
		group.add(box(0.02, 0.09, 0.9, paint, 0, top + 0.05, 0.75)); // roof fin
	}
	if (kit === "wide") {
		for (const z of [-def.wheelbase / 2, def.wheelbase / 2]) {
			for (const side of [-1, 1]) {
				const flare = new THREE.Mesh(new THREE.TorusGeometry(archRadius + 0.02, 0.06, 8, 20, Math.PI).rotateY(Math.PI / 2), paint);
				flare.position.set(side * (w - 0.01), wheelY, z);
				flare.scale.x = 1.7;
				flare.castShadow = true;
				group.add(flare);
			}
		}
	}
	if (def.scoop) group.add(box(0.5, 0.09, 0.8, DARK, 0, 0.24, -1.15));
	if (def.rack) {
		const top = Math.max(...def.glass.map((p) => p[1]));
		for (const z of [-0.1, 0.8, 1.6]) group.add(box(w * 1.3, 0.025, 0.04, TRIM, 0, top + 0.07, z));
		for (const side of [-1, 1]) group.add(box(0.03, 0.03, 2.0, TRIM, side * w * 0.62, top + 0.09, 0.75));
	}
}

export function createCarModel(scene, tuning) {
	const root = new THREE.Group();
	scene.add(root);
	const paint = new THREE.MeshPhysicalMaterial({ color: 0xff2aa0, metalness: 0.55, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.09 });
	const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c8d4, metalness: 0.95, roughness: 0.22 });
	const glowMaterial = new THREE.MeshBasicMaterial({
		map: glowTexture(), color: 0xff2aa0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
	});
	const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMaterial);
	const decalMaterial = new THREE.MeshStandardMaterial({
		transparent: true, depthWrite: false, metalness: 0.3, roughness: 0.42, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
	});
	const wheelViews = {};
	let shell = null;
	let token = 0;

	function clear() {
		for (const child of [...root.children]) {
			root.remove(child);
			child.traverse((o) => {
				if (o.geometry && o !== glow) o.geometry.dispose();
			});
		}
	}

	async function useGlb(def, loadToken) {
		const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
		new GLTFLoader().load(def.glb, (gltf) => {
			if (loadToken !== token) return;
			gltf.scene.traverse((o) => {
				o.castShadow = o.isMesh;
			});
			root.remove(shell);
			shell = gltf.scene;
			root.add(shell);
			for (const wheelDef of def.wheels) {
				const custom = gltf.scene.getObjectByName(wheelDef.name);
				if (!custom) continue;
				custom.parent.remove(custom);
				const view = wheelViews[wheelDef.name];
				view.pivot.remove(view.spinner);
				custom.position.set(0, 0, 0);
				view.spinner = custom;
				view.pivot.add(custom);
			}
		});
	}

	return {
		root,
		setCar(def, { kit = "stock", wheels = "five", decal = "none" } = {}) {
			token++;
			clear();
			const wheelY = def.wheels[0].mount[1] - tuning.SpringLength * (1 - tuning.StaticSag);
			const archRadius = tuning.WheelRadius + 0.075;
			shell = new THREE.Group();
			const body = new THREE.Mesh(bodyGeometry(def, archRadius, wheelY), paint);
			body.castShadow = true;
			const cabin = new THREE.Mesh(glassGeometry(def), GLASS);
			const roof = new THREE.Mesh(roofGeometry(def), paint);
			roof.castShadow = true;
			shell.add(body, cabin, roof);
			if (decal !== "none") {
				addDecalUv(body.geometry, def);
				addDecalUv(roof.geometry, def);
				decalMaterial.map = decalTexture(decal);
				decalMaterial.needsUpdate = true;
				shell.add(new THREE.Mesh(body.geometry, decalMaterial), new THREE.Mesh(roof.geometry, decalMaterial));
			}
			// Dark wheel wells, so you see shadow rather than paint behind the wheels.
			for (const z of [-def.wheelbase / 2, def.wheelbase / 2]) {
				const well = new THREE.Mesh(new THREE.CylinderGeometry(archRadius - 0.012, archRadius - 0.012, def.width * 2 - 0.05, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), DARK);
				well.position.set(0, wheelY, z);
				shell.add(well);
			}
			addDetails(shell, def, paint, kit, archRadius, wheelY);
			root.add(shell, makeDriver(def));
			glow.scale.set(def.width * 3.4, 1, def.length * 1.35);
			glow.position.y = -(tuning.WheelRadius + tuning.SpringLength * (1 - tuning.StaticSag) + 0.2) + 0.03;
			root.add(glow);
			const wheelParts = wheelGeometry(tuning.WheelRadius, wheels);
			for (const wheelDef of def.wheels) {
				const pivot = new THREE.Group(); // moves with suspension + steering
				const spinner = makeWheel(wheelParts, rimMaterial); // spins
				pivot.add(spinner);
				root.add(pivot);
				wheelViews[wheelDef.name] = { pivot, spinner };
			}
			if (def.glb) useGlb(def, token);
		},
		setLook({ paint: paintColor, rims, glow: glowColor, decal }) {
			paint.color.setHex(paintColor);
			rimMaterial.color.setHex(rims);
			decalMaterial.color.setHex(decal);
			glow.visible = glowColor !== null;
			if (glowColor !== null) glowMaterial.color.setHex(glowColor);
		},
		update(car) {
			root.position.set(car.pos[0], car.pos[1], car.pos[2]);
			root.quaternion.set(car.quat[0], car.quat[1], car.quat[2], car.quat[3]);
			for (const w of car.wheels) {
				const { pivot, spinner } = wheelViews[w.def.name];
				const [x, y, z] = w.def.mount;
				pivot.position.set(x, y - w.drop, z);
				pivot.rotation.y = w.def.front ? -car.steerAngle : 0;
				spinner.rotation.x = -w.spin;
			}
		},
		// Parked on the garage turntable: resting height, wheels straight.
		showParked(x, z, yaw, car) {
			root.position.set(x, tuning.WheelRadius + tuning.SpringLength * (1 - tuning.StaticSag) + 0.2, z);
			root.rotation.set(0, yaw, 0);
			for (const w of car.wheels) {
				const { pivot } = wheelViews[w.def.name];
				const [wx, wy, wz] = w.def.mount;
				pivot.position.set(wx, wy - tuning.SpringLength * (1 - tuning.StaticSag), wz);
				pivot.rotation.y = 0;
			}
		},
	};
}
