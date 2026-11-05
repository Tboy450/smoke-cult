// The car you see. A placeholder punk car built from boxes, swapped for assets\car.glb (from Blender/Houdini)
// when that file exists. Same for the driver: a helmet placeholder, or assets\driver.glb.
//
// Blender export rules for car.glb: File > Export > glTF 2.0 (.glb) with the default "+Y Up" option.
// In Blender, point the car's nose toward +Y (it arrives here facing -Z), put the origin at the centre of mass,
// and model at 1 Blender unit = 1 m.
// Name the four wheel objects FL, FR, RL, RR to have them steer and spin; otherwise the placeholder wheels stay.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WHEELS } from "./tuning.js";

const PINK = 0xff2aa0;

function box(w, h, d, material, x, y, z) {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

function placeholderBody() {
	const group = new THREE.Group();
	const paint = new THREE.MeshStandardMaterial({ color: 0x4a1a5a, metalness: 0.5, roughness: 0.3 });
	const neon = new THREE.MeshStandardMaterial({ color: PINK, emissive: PINK, emissiveIntensity: 2 });
	const glass = new THREE.MeshStandardMaterial({ color: 0x0a0a12, metalness: 0.9, roughness: 0.1 });
	const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6dd, emissiveIntensity: 3 });
	const tail = new THREE.MeshStandardMaterial({ color: 0xff1030, emissive: 0xff1030, emissiveIntensity: 3 });

	group.add(box(1.8, 0.5, 4.3, paint, 0, -0.05, 0)); // lower body
	group.add(box(1.55, 0.45, 2.0, glass, 0, 0.42, 0.25)); // cabin
	group.add(box(0.35, 0.02, 4.32, neon, 0, 0.21, 0)); // stripe
	group.add(box(1.9, 0.08, 0.3, paint, 0, -0.27, -2.2)); // splitter
	group.add(box(1.8, 0.06, 0.4, paint, 0, 0.62, 1.95)); // wing
	for (const s of [-1, 1]) {
		group.add(box(0.06, 0.35, 0.15, paint, s * 0.55, 0.42, 1.95)); // wing struts
		group.add(box(0.4, 0.1, 0.05, head, s * 0.6, 0.05, -2.16));
		group.add(box(0.45, 0.08, 0.05, tail, s * 0.6, 0.08, 2.16));
		group.add(box(0.05, 0.04, 2.6, neon, s * 0.91, -0.22, 0)); // underglow strips
	}
	const glow = new THREE.PointLight(PINK, 6, 4, 2);
	glow.position.set(0, -0.45, 0);
	group.add(glow);
	return group;
}

function placeholderDriver() {
	const group = new THREE.Group();
	const helmet = new THREE.Mesh(
		new THREE.SphereGeometry(0.17, 20, 14),
		new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.3 }),
	);
	const visor = new THREE.Mesh(
		new THREE.SphereGeometry(0.172, 20, 14, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.35, Math.PI * 0.3),
		new THREE.MeshStandardMaterial({ color: 0x220018, metalness: 1, roughness: 0.05 }),
	);
	visor.rotation.y = Math.PI;
	const stripe = new THREE.Mesh(
		new THREE.TorusGeometry(0.171, 0.012, 6, 30, Math.PI),
		new THREE.MeshStandardMaterial({ color: PINK, emissive: PINK, emissiveIntensity: 1.5 }),
	);
	stripe.rotation.y = Math.PI / 2;
	group.add(helmet, visor, stripe);
	group.position.set(-0.38, 0.5, 0.35); // left-hand drive seat
	return group;
}

function placeholderWheel(radius) {
	const group = new THREE.Group();
	const tire = new THREE.Mesh(
		new THREE.CylinderGeometry(radius, radius, 0.26, 24),
		new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
	);
	tire.rotation.z = Math.PI / 2;
	tire.castShadow = true;
	const rim = new THREE.Mesh(
		new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.27, 6),
		new THREE.MeshStandardMaterial({ color: 0xb8b8c4, metalness: 0.9, roughness: 0.25 }),
	);
	rim.rotation.z = Math.PI / 2;
	group.add(tire, rim);
	return group;
}

export function createCarModel(scene, tuning) {
	const root = new THREE.Group();
	scene.add(root);
	let body = placeholderBody();
	root.add(body);
	let driver = placeholderDriver();
	root.add(driver);

	const wheels = {};
	for (const def of WHEELS) {
		const pivot = new THREE.Group(); // moves with suspension + steering
		const spinner = placeholderWheel(tuning.WheelRadius); // spins
		pivot.add(spinner);
		root.add(pivot);
		wheels[def.name] = { pivot, spinner };
	}

	const loader = new GLTFLoader();
	const tryLoad = (url, onModel) =>
		loader.load(url, (gltf) => onModel(gltf.scene), undefined, () => {}); // missing file = keep placeholder
	tryLoad("assets/car.glb", (model) => {
		model.traverse((o) => (o.castShadow = o.receiveShadow = o.isMesh));
		root.remove(body);
		body = model;
		root.add(body);
		for (const def of WHEELS) {
			const custom = model.getObjectByName(def.name);
			if (!custom) continue;
			custom.parent.remove(custom);
			const w = wheels[def.name];
			w.pivot.remove(w.spinner);
			custom.position.set(0, 0, 0);
			w.spinner = custom;
			w.pivot.add(custom);
		}
	});
	tryLoad("assets/driver.glb", (model) => {
		root.remove(driver);
		model.position.copy(driver.position);
		driver = model;
		root.add(driver);
	});

	return {
		root,
		update(car) {
			root.position.set(car.pos[0], car.pos[1], car.pos[2]);
			root.quaternion.set(car.quat[0], car.quat[1], car.quat[2], car.quat[3]);
			for (const w of car.wheels) {
				const { pivot, spinner } = wheels[w.def.name];
				const [x, y, z] = w.def.mount;
				pivot.position.set(x, y - w.drop, z);
				pivot.rotation.y = w.def.front ? -car.steerAngle : 0;
				spinner.rotation.x = -w.spin;
			}
		},
	};
}
