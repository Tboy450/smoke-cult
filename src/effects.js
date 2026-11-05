// Tire smoke (sprites) and skid marks (instanced dark strips on the ground).

import * as THREE from "three";

function smokeTexture() {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 64;
	const g = canvas.getContext("2d");
	const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
	grad.addColorStop(0, "rgba(255,255,255,0.9)");
	grad.addColorStop(0.5, "rgba(235,235,240,0.35)");
	grad.addColorStop(1, "rgba(230,230,235,0)");
	g.fillStyle = grad;
	g.fillRect(0, 0, 64, 64);
	return new THREE.CanvasTexture(canvas);
}

export function createEffects(scene) {
	const texture = smokeTexture();
	const puffs = [];
	for (let i = 0; i < 260; i++) {
		const sprite = new THREE.Sprite(
			new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }),
		);
		sprite.visible = false;
		scene.add(sprite);
		puffs.push({ sprite, life: 0, maxLife: 1, vel: new THREE.Vector3() });
	}
	let nextPuff = 0;

	const SKIDS = 6000;
	const skidMesh = new THREE.InstancedMesh(
		new THREE.PlaneGeometry(0.24, 1).rotateX(-Math.PI / 2),
		new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false }),
		SKIDS,
	);
	skidMesh.count = 0;
	skidMesh.frustumCulled = false;
	scene.add(skidMesh);
	let nextSkid = 0;
	const lastMark = {};
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();

	return {
		update(car, dt) {
			for (const w of car.wheels) {
				const name = w.def.name;
				if (!w.contact || w.slip < 3) {
					lastMark[name] = null;
					continue;
				}
				const p = new THREE.Vector3(w.contact[0], 0.012, w.contact[2]);
				// Smoke, more the harder the tire slides.
				const spawn = !w.def.front && Math.random() < Math.min(1, (w.slip - 2) / 6) * dt * 60;
				if (spawn) {
					const puff = puffs[nextPuff];
					nextPuff = (nextPuff + 1) % puffs.length;
					puff.life = puff.maxLife = 1.4 + Math.random() * 1.2;
					puff.sprite.position.set(p.x, 0.35, p.z);
					puff.vel.set((Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
					puff.sprite.visible = true;
				}
				// Skid mark segment from the last mark to here.
				const last = lastMark[name];
				if (!last) {
					lastMark[name] = p;
				} else if (last.distanceTo(p) > 0.3) {
					const dir = p.clone().sub(last);
					const len = dir.length();
					q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
					m.compose(last.clone().add(p).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, len));
					skidMesh.setMatrixAt(nextSkid, m);
					nextSkid = (nextSkid + 1) % SKIDS;
					skidMesh.count = Math.max(skidMesh.count, nextSkid === 0 ? SKIDS : nextSkid);
					skidMesh.instanceMatrix.needsUpdate = true;
					lastMark[name] = p;
				}
			}
			for (const puff of puffs) {
				if (puff.life <= 0) continue;
				puff.life -= dt;
				const t = 1 - puff.life / puff.maxLife;
				puff.sprite.position.addScaledVector(puff.vel, dt);
				puff.vel.multiplyScalar(1 - dt * 0.8);
				puff.sprite.scale.setScalar(0.8 + t * 5);
				puff.sprite.material.opacity = 0.55 * (1 - t);
				if (puff.life <= 0) puff.sprite.visible = false;
			}
		},
		clearSkids() {
			skidMesh.count = 0;
			nextSkid = 0;
		},
	};
}
