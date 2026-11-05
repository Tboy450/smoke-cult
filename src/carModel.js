// The car you see, built in code from each car's side profile in cars.js: a real body with cut wheel arches, a glass
// cabin, a helmeted driver, and the paint, rims and underglow picked in the garage.
// A car with glb set in cars.js loads that Blender/Houdini model instead (export rules in assets/README.md).

import * as THREE from "three";
import { mergeGeometries, mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const DARK = new THREE.MeshStandardMaterial({ color: 0x0d0d11, roughness: 0.8 });
const TRIM = new THREE.MeshStandardMaterial({ color: 0x17171c, metalness: 0.4, roughness: 0.45 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x090c14, metalness: 0.7, roughness: 0.08, transparent: true, opacity: 0.62 });
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
function wheelGeometry(radius) {
	const width = 0.27;
	const dishes = [];
	const metal = [];
	for (const side of [-1, 1]) {
		dishes.push(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, 0.012, 24).rotateZ(Math.PI / 2).translate(side * (width / 2 + 0.002), 0, 0));
		metal.push(new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, 0.03, 12).rotateZ(Math.PI / 2).translate(side * (width / 2 + 0.012), 0, 0));
		metal.push(new THREE.TorusGeometry(radius * 0.68, radius * 0.055, 8, 28).rotateY(Math.PI / 2).translate(side * (width / 2 + 0.004), 0, 0));
		for (let i = 0; i < 5; i++) {
			const angle = (i / 5) * Math.PI * 2;
			const spoke = new THREE.BoxGeometry(0.022, radius * 0.6, radius * 0.13).rotateX(-angle);
			metal.push(spoke.translate(side * (width / 2 + 0.01), Math.cos(angle) * radius * 0.36, Math.sin(angle) * radius * 0.36));
		}
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

function addDetails(group, def, paint) {
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
	if (def.wing === "gt") {
		group.add(box(w * 1.95, 0.035, 0.34, TRIM, 0, deckY + 0.3, deckZ - 0.02));
		for (const side of [-1, 1]) {
			group.add(box(0.035, 0.32, 0.16, TRIM, side * w * 0.6, deckY + 0.14, deckZ));
			group.add(box(0.025, 0.13, 0.36, paint, side * w * 0.97, deckY + 0.3, deckZ - 0.02));
		}
	} else if (def.wing === "duck") {
		const lip = box(w * 1.6, 0.05, 0.3, paint, 0, deckY + 0.05, deckZ);
		lip.rotation.x = 0.28;
		group.add(lip);
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
		setCar(def) {
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
			// Dark wheel wells, so you see shadow rather than paint behind the wheels.
			for (const z of [-def.wheelbase / 2, def.wheelbase / 2]) {
				const well = new THREE.Mesh(new THREE.CylinderGeometry(archRadius - 0.012, archRadius - 0.012, def.width * 2 - 0.05, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), DARK);
				well.position.set(0, wheelY, z);
				shell.add(well);
			}
			addDetails(shell, def, paint);
			root.add(shell, makeDriver(def));
			glow.scale.set(def.width * 3.4, 1, def.length * 1.35);
			glow.position.y = -(tuning.WheelRadius + tuning.SpringLength * (1 - tuning.StaticSag) + 0.2) + 0.03;
			root.add(glow);
			const wheelParts = wheelGeometry(tuning.WheelRadius);
			for (const wheelDef of def.wheels) {
				const pivot = new THREE.Group(); // moves with suspension + steering
				const spinner = makeWheel(wheelParts, rimMaterial); // spins
				pivot.add(spinner);
				root.add(pivot);
				wheelViews[wheelDef.name] = { pivot, spinner };
			}
			if (def.glb) useGlb(def, token);
		},
		setLook({ paint: paintColor, rims, glow: glowColor }) {
			paint.color.setHex(paintColor);
			rimMaterial.color.setHex(rims);
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
