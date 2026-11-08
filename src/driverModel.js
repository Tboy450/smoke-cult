import * as THREE from "three";
import { JOG_SPEED, WALK_SPEED } from "./onFoot.js";

const suit = new THREE.MeshStandardMaterial({ color: 0x352940, roughness: 0.8 });
const seatSuit = new THREE.MeshStandardMaterial({ color: 0x221a2c, roughness: 0.7 });
const panels = new THREE.MeshStandardMaterial({ color: 0x171520, roughness: 0.88 });
const shell = new THREE.MeshStandardMaterial({ color: 0xf0ece4, metalness: 0.2, roughness: 0.28 });
const visor = new THREE.MeshStandardMaterial({ color: 0x24001a, metalness: 1, roughness: 0.06 });
const stripe = new THREE.MeshStandardMaterial({ color: 0xff2aa0, emissive: 0xff2aa0, emissiveIntensity: 0.65 });

function piece(parent, name, geometry, material, x, y, z) {
	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	parent.add(mesh);
	return mesh;
}

function box(parent, name, material, w, h, d, x, y, z) {
	return piece(parent, name, new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

function joint(parent, name, x, y, z) {
	const group = new THREE.Group();
	group.name = name;
	group.position.set(x, y, z);
	parent.add(group);
	return group;
}

function helmet(parent, height) {
	const head = joint(parent, "Helmet", 0, height, 0);
	piece(head, "Shell", new THREE.SphereGeometry(0.155, 20, 14), shell, 0, 0, 0);
	piece(head, "Visor", new THREE.SphereGeometry(0.157, 20, 12, Math.PI * 1.18, Math.PI * 0.64, Math.PI * 0.33, Math.PI * 0.27), visor, 0, 0, 0);
	piece(head, "Stripe", new THREE.TorusGeometry(0.157, 0.012, 6, 28, Math.PI).rotateY(Math.PI / 2), stripe, 0, 0, 0);
	return head;
}

export function makeSeatedDriver(def) {
	const driver = new THREE.Group();
	box(driver, "Seated torso", seatSuit, 0.36, 0.34, 0.24, 0, -0.26, 0.02);
	helmet(driver, 0);
	driver.position.set(-def.width * 0.4, def.seatY, def.seatZ);
	return driver;
}

export function createDriverModel(scene) {
	const root = new THREE.Group();
	root.name = "On-foot driver";
	root.visible = false;
	scene.add(root);
	const hips = joint(root, "Hips", 0, 0.86, 0);
	box(hips, "Waist", panels, 0.31, 0.17, 0.225, 0, 0.06, 0);
	const chest = joint(hips, "Chest", 0, 0.13, 0);
	piece(chest, "Racing suit", new THREE.CylinderGeometry(0.22, 0.155, 0.41, 8).scale(1, 1, 0.66), suit, 0, 0.205, 0);
	box(chest, "Harness", stripe, 0.235, 0.032, 0.015, 0, 0.32, -0.136);
	box(chest, "Back patch", stripe, 0.19, 0.055, 0.018, 0, 0.29, 0.126);
	const head = helmet(chest, 0.59);
	const limbs = [-1, 1].map((side) => {
		const name = side < 0 ? "Left" : "Right";
		const arm = joint(chest, `${name} shoulder`, side * 0.218, 0.347, 0);
		arm.rotation.z = side * 0.14;
		piece(arm, "Sleeve", new THREE.CapsuleGeometry(0.064, 0.16, 3, 8), suit, 0, -0.117, 0);
		box(arm, "Shoulder stripe", stripe, 0.13, 0.037, 0.12, 0, -0.04, 0);
		const elbow = joint(arm, `${name} elbow`, 0, -0.238, 0);
		piece(elbow, "Forearm", new THREE.CapsuleGeometry(0.052, 0.13, 3, 8), panels, 0, -0.097, 0);
		piece(elbow, "Glove", new THREE.SphereGeometry(0.061, 8, 6).scale(0.83, 1.18, 0.95), panels, 0, -0.21, 0);
		const leg = joint(hips, `${name} hip`, side * 0.095, 0, 0);
		piece(leg, "Thigh", new THREE.CapsuleGeometry(0.086, 0.25, 3, 8), suit, 0, -0.185, 0);
		const knee = joint(leg, `${name} knee`, 0, -0.4, 0);
		piece(knee, "Shin", new THREE.CapsuleGeometry(0.067, 0.25, 3, 8), suit, 0, -0.17, 0);
		box(knee, "Boot", panels, 0.15, 0.12, 0.255, 0, -0.4, -0.046);
		return { side, arm, elbow, leg, knee };
	});
	let breathing = 0;
	return {
		root,
		update(walker, crouch, dt = 0) {
			const moving = Math.min(1, walker.pace / WALK_SPEED);
			const jogging = THREE.MathUtils.clamp((walker.pace - WALK_SPEED) / (JOG_SPEED - WALK_SPEED), 0, 1);
			const swing = Math.sin(walker.phase) * moving;
			root.position.set(walker.x, walker.y, walker.z);
			root.rotation.y = walker.yaw;
			hips.position.y = 0.86 + Math.abs(swing) * (0.022 + 0.045 * jogging) - crouch * 0.24;
			breathing = (breathing + dt * 2.6) % (Math.PI * 2);
			chest.position.y = 0.13 + Math.sin(breathing) * 0.011 * (1 - moving) * (1 - crouch);
			chest.rotation.x = -0.18 * jogging - 0.36 * crouch;
			chest.rotation.y = swing * 0.11;
			head.rotation.x = -chest.rotation.x * 0.65;
			for (const { side, arm, elbow, leg, knee } of limbs) {
				const stride = side * swing;
				leg.rotation.x = stride * (0.56 + 0.3 * jogging) + crouch * 0.65;
				knee.rotation.x = -Math.max(0, stride) * (0.52 + 0.65 * jogging) - crouch * 1.03;
				arm.rotation.x = -stride * (0.36 + 0.36 * jogging) + crouch * 0.18;
				elbow.rotation.x = -0.14 - 0.74 * jogging - Math.max(0, stride) * 0.27;
			}
		},
	};
}
