// Cinder Pass scenery, built from the same grade, road and walls as the driving world.
import * as THREE from "three";

function random(seed) {
	return () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}

function texture(width, height, draw) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	draw(canvas.getContext("2d"), width, height);
	const map = new THREE.CanvasTexture(canvas);
	map.colorSpace = THREE.SRGBColorSpace;
	return map;
}

function surface(positions, indices, material, { uv, colors } = {}) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	if (uv) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
	if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return new THREE.Mesh(geometry, material);
}

function strip(course, left, right, material, lift, tileLength) {
	const positions = [];
	const indices = [];
	const uv = [];
	for (const [i, sample] of course.samples.entries()) {
		for (const offset of [left, right]) {
			const x = sample.x + sample.rx * offset;
			const z = sample.z + sample.rz * offset;
			positions.push(x, course.groundHeight(x, z) + lift, z);
		}
		uv.push(0, sample.s / tileLength, 1, sample.s / tileLength);
		if (i < course.samples.length - 1) {
			const a = i * 2;
			indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
	}
	const mesh = surface(positions, indices, material, { uv });
	mesh.receiveShadow = true;
	return mesh;
}

function road(course, group) {
	const map = texture(256, 256, (context, width, height) => {
		const noise = random(89);
		context.fillStyle = "#373b46";
		context.fillRect(0, 0, width, height);
		for (let i = 0; i < 4500; i++) {
			context.fillStyle = i % 2 ? "#d1ddf01c" : "#12132133";
			context.fillRect(noise() * width, noise() * height, 1 + noise() * 2, 1 + noise() * 3);
		}
		context.fillStyle = "#d5e2e7";
		context.fillRect(8, 0, 3, height);
		context.fillRect(width - 11, 0, 3, height);
		context.fillStyle = "#e7b665";
		context.fillRect(width / 2 - 1.5, height * 0.2, 3, height * 0.6);
	});
	map.wrapT = THREE.RepeatWrapping;
	map.anisotropy = 4;
	const asphalt = new THREE.MeshStandardMaterial({ map, roughness: 0.94 });
	const gravel = new THREE.MeshStandardMaterial({ color: 0x66616b, roughness: 1 });
	group.add(
		strip(course, -course.halfWidth, course.halfWidth, asphalt, 0.004, 14),
		strip(course, -course.railOffset - 0.75, -course.halfWidth, gravel, 0, 14),
		strip(course, course.halfWidth, course.railOffset + 0.75, gravel, 0, 14),
	);
}

function landscape(course, group) {
	const first = course.samples[0];
	let minX = first.x, maxX = first.x, minZ = first.z, maxZ = first.z;
	for (const { x, z } of course.samples) {
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minZ = Math.min(minZ, z);
		maxZ = Math.max(maxZ, z);
	}
	const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
	const radius = Math.max(310, Math.hypot(maxX - minX, maxZ - minZ) / 2 + 150);
	const base = [], triangles = [], colors = [];
	const stone = new THREE.Color(0x606476);
	const moss = new THREE.Color(0x3e6057);
	const shade = new THREE.Color();
	const size = 64;
	const reach = radius + 200;
	for (let row = 0; row <= size; row++) {
		for (let col = 0; col <= size; col++) {
			const x = cx + (2 * col / size - 1) * reach;
			const z = cz + (2 * row / size - 1) * reach;
			base.push(x, course.groundHeight(x, z) - 0.08, z);
			const pattern = 0.5 + 0.22 * Math.sin(x * 0.075) + 0.24 * Math.cos(z * 0.058 + x * 0.037);
			shade.copy(stone).lerp(moss, pattern);
			colors.push(shade.r, shade.g, shade.b);
			if (row < size && col < size) {
				const a = row * (size + 1) + col;
				triangles.push(a, a + size + 1, a + 1, a + 1, a + size + 1, a + size + 2);
			}
		}
	}
	const terrain = surface(base, triangles, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { colors });
	terrain.receiveShadow = true;
	group.add(terrain);

	const skyMap = texture(16, 256, (context, width, height) => {
		const gradient = context.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, "#101d3b");
		gradient.addColorStop(0.3, "#374d74");
		gradient.addColorStop(0.44, "#77869f");
		gradient.addColorStop(0.53, "#a69baa");
		gradient.addColorStop(0.62, "#53657a");
		gradient.addColorStop(1, "#232e41");
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);
	});
	const sky = new THREE.Mesh(new THREE.SphereGeometry(1080, 28, 16), new THREE.MeshBasicMaterial({
		map: skyMap, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
	}));
	sky.position.set(cx, 15, cz);
	sky.renderOrder = -10;
	group.add(sky);

	// Offset ridge bands layer the skyline without drawing distant terrain at road detail.
	const noise = random(34);
	for (const [distance, rise, color, phase] of [[radius * 2.34, 246, 0x687993, 2.5], [radius * 1.7, 155, 0x50637e, 1.4], [radius, 84, 0x394e65, 0.2]]) {
		const ridge = [], indices = [];
		const steps = 72;
		const heights = Array.from({ length: steps }, () => noise() * 0.24);
		for (let i = 0; i <= steps; i++) {
			const angle = i * Math.PI * 2 / steps;
			const ux = Math.cos(angle), uz = Math.sin(angle);
			const x = cx + ux * distance, z = cz + uz * distance;
			const height = rise * (0.75 + Math.sin(angle * 5 + phase) * 0.23 + Math.sin(angle * 9 - phase) * 0.16 + heights[i % steps]);
			const footX = cx + ux * distance * 0.74, footZ = cz + uz * distance * 0.74;
			ridge.push(footX, course.groundHeight(footX, footZ) - 3, footZ, x, Math.max(12, course.groundHeight(x, z)) + height, z);
			if (i < steps) {
				const a = i * 2;
				indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
			}
		}
		group.add(surface(ridge, indices, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false, toneMapped: false })));
	}
}

function instances(group, geometry, material, placements) {
	if (!placements.length) return;
	const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
	const object = new THREE.Object3D();
	const axis = new THREE.Vector3(1, 0, 0);
	const direction = new THREE.Vector3();
	const tint = new THREE.Color();
	for (const [index, item] of placements.entries()) {
		object.position.set(item.x, item.y, item.z);
		object.rotation.set(0, item.yaw ?? 0, 0);
		if (item.direction) object.quaternion.setFromUnitVectors(axis, direction.fromArray(item.direction).normalize());
		object.scale.set(item.sx, item.sy, item.sz);
		object.updateMatrix();
		mesh.setMatrixAt(index, object.matrix);
		if (item.color !== undefined) mesh.setColorAt(index, tint.setHex(item.color));
	}
	group.add(mesh);
}

function barriers(course, group) {
	const beams = [], posts = [], reflectors = [];
	for (const [index, wall] of course.walls.entries()) {
		const ay = course.groundHeight(wall.ax, wall.az);
		const by = course.groundHeight(wall.bx, wall.bz);
		// Keep the face that the player can hit aligned with the collision line.
		const x = (wall.ax + wall.bx) / 2 - wall.nx * 0.12;
		const z = (wall.az + wall.bz) / 2 - wall.nz * 0.12;
		const y = (ay + by) / 2;
		const direction = [wall.bx - wall.ax, by - ay, wall.bz - wall.az];
		const length = Math.hypot(wall.length, by - ay);
		beams.push({ x, y: y + 0.85, z, direction, sx: length + 0.045, sy: 0.27, sz: 0.24 });
		if (index % 2 === 0) posts.push({ x, y: y + 0.49, z, sx: 0.2, sy: 1.03, sz: 0.2 });
		if (index % 5 === 0) {
			reflectors.push({ x: x + wall.nx * 0.135, y: y + 0.88, z: z + wall.nz * 0.135,
				direction, sx: 0.4, sy: 0.11, sz: 0.04 });
		}
	}
	const box = new THREE.BoxGeometry(1, 1, 1);
	instances(group, box, new THREE.MeshStandardMaterial({ color: 0xb5c4ca, metalness: 0.45, roughness: 0.65 }), beams);
	instances(group, box, new THREE.MeshStandardMaterial({ color: 0x56606f, roughness: 0.85 }), posts);
	instances(group, box, new THREE.MeshBasicMaterial({ color: 0xffb46a, toneMapped: false }), reflectors);
}

function dressing(course, group) {
	const noise = random(331);
	const trees = [], trunks = [], rocks = [];
	for (let i = 2; i < course.samples.length; i += 4) {
		const sample = course.samples[i];
		for (const side of [-1, 1]) {
			const offset = side * (course.railOffset + 6 + noise() * 58);
			const x = sample.x + sample.rx * offset;
			const z = sample.z + sample.rz * offset;
			const clearance = course.nearest(x, z).distance - course.railOffset;
			if (clearance < 3) continue;
			const y = course.groundHeight(x, z);
			const size = 3.5 + noise() * 6.5;
			const yaw = noise() * Math.PI;
			if (noise() < 0.31) {
				if (clearance < size * 0.55 + 0.6) continue;
				const height = size * (noise() < 0.21 ? 1.1 : 0.42);
				rocks.push({ x, y: y + height * 0.12, z, sx: size * 0.55, sy: height, sz: size * 0.41, yaw, color: noise() < 0.5 ? 0x8c8795 : 0x656975 });
				continue;
			}
			trunks.push({ x, y: y + size * 0.19, z, sx: size * 0.034, sy: size * 0.4, sz: size * 0.034, yaw });
			const color = noise() < 0.5 ? 0x3d6c62 : 0x335b59;
			trees.push({ x, y: y + size * 0.47, z, sx: size * 0.25, sy: size * 0.64, sz: size * 0.25, yaw, color });
			trees.push({ x, y: y + size * 0.76, z, sx: size * 0.17, sy: size * 0.51, sz: size * 0.17, yaw, color });
		}
	}
	instances(group, new THREE.CylinderGeometry(1, 1.4, 1, 5), new THREE.MeshStandardMaterial({ color: 0x574b4d, roughness: 1 }), trunks);
	instances(group, new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), trees);
	instances(group, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), rocks);
}

function gates(course, group) {
	const steel = new THREE.MeshStandardMaterial({ color: 0x202831, metalness: 0.5, roughness: 0.65 });
	const checker = texture(128, 16, (context, width, height) => {
		for (let row = 0; row < 2; row++) {
			for (let col = 0; col < 16; col++) {
				context.fillStyle = (row + col) % 2 ? "#eaf6ff" : "#101725";
				context.fillRect(col * width / 16, row * height / 2, width / 16, height / 2);
			}
		}
	});
	for (const [number, gate] of course.gates.entries()) {
		const sample = course.samples[gate.index];
		const endpoint = number === 0 || number === course.gates.length - 1;
		const accent = number === 0 ? "#ffc071" : endpoint ? "#ff75c3" : "#70f0db";
		const top = endpoint ? 6.3 : 5.7;
		const width = course.railOffset + 0.48;
		const arch = new THREE.Group();
		arch.position.set(sample.x, sample.y, sample.z);
		arch.rotation.y = Math.atan2(-sample.tx, -sample.tz);
		const trim = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
		for (const side of [-1, 1]) {
			const x = sample.x + sample.rx * side * width;
			const z = sample.z + sample.rz * side * width;
			const bottom = course.groundHeight(x, z) - sample.y;
			const post = new THREE.Mesh(new THREE.BoxGeometry(0.38, top - bottom, 0.46), steel);
			post.position.set(side * width, (top + bottom) / 2, 0);
			arch.add(post);
			const light = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.6, 0.06), trim);
			light.position.set(side * width, top - 1.8, 0.26);
			arch.add(light);
		}
		const board = new THREE.Mesh(new THREE.BoxGeometry(width * 2 + 0.4, 1.42, 0.42), steel);
		board.position.y = top;
		arch.add(board);
		const sign = texture(512, 96, (context, w, h) => {
			context.fillStyle = "#141c30";
			context.fillRect(0, 0, w, h);
			context.fillStyle = accent;
			context.fillRect(0, 0, w, 5);
			context.fillRect(0, h - 5, w, 5);
			context.textAlign = "center";
			context.font = "bold 18px sans-serif";
			context.fillText("CINDER PASS", w / 2, 31);
			context.fillStyle = "#f7faff";
			context.font = "900 36px sans-serif";
			context.fillText(gate.label.toUpperCase(), w / 2, 72, w - 28);
		});
		const face = new THREE.Mesh(new THREE.PlaneGeometry(width * 2, 1.38), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
		face.position.set(0, top, 0.22);
		arch.add(face);
		group.add(arch);

		const positions = [];
		const depth = endpoint ? 0.85 : 0.21;
		for (const forward of [-depth, depth]) {
			for (const across of [-course.halfWidth, course.halfWidth]) {
				const x = sample.x + sample.tx * forward + sample.rx * across;
				const z = sample.z + sample.tz * forward + sample.rz * across;
				positions.push(x, course.groundHeight(x, z) + 0.022, z);
			}
		}
		const stripe = endpoint ? new THREE.MeshBasicMaterial({ map: checker, toneMapped: false }) : trim;
		group.add(surface(positions, [0, 1, 2, 1, 3, 2], stripe, { uv: [0, 0, 1, 0, 0, 1, 1, 1] }));
	}
}

export function buildTougeScenery(course) {
	const group = new THREE.Group();
	group.name = "Cinder Pass";
	landscape(course, group);
	road(course, group);
	barriers(course, group);
	dressing(course, group);
	gates(course, group);
	return group;
}
