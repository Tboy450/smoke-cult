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

function aggregate(context, width, height, base, strength, seed, wear = null) {
	const noise = random(seed);
	const pixels = context.createImageData(width, height);
	for (let y = 0; y < height; y++) {
		const along = 1 + 0.15 * Math.cos(y * Math.PI * 2 / height);
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const fleck = noise();
			const grain = (noise() + noise() - 1) * strength;
			const chip = fleck > 0.98 ? 9 : fleck < 0.02 ? -7 : 0;
			const shift = grain + chip - (wear?.[x] ?? 0) * along;
			for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = base[channel] + shift;
			pixels.data[i + 3] = 255;
		}
	}
	context.putImageData(pixels, 0, 0);
}

function road(course, group) {
	const map = texture(256, 256, (context, width, height) => {
		const wheelPaths = [0.18, 0.32, 0.68, 0.82];
		const wear = Array.from({ length: width }, (_, x) => wheelPaths.reduce((sum, path) => {
			const distance = (x / width - path) / 0.033;
			return sum + 2.8 * Math.exp(-distance * distance);
		}, 0));
		aggregate(context, width, height, [55, 59, 70], 12, 89, wear);
		context.fillStyle = "#d5e2e7";
		context.fillRect(8, 0, 3, height);
		context.fillRect(width - 11, 0, 3, height);
		context.fillStyle = "#e7b665";
		context.fillRect(width / 2 - 1.5, height * 0.2, 3, height * 0.6);
	});
	map.wrapT = THREE.RepeatWrapping;
	map.anisotropy = 4;
	const asphalt = new THREE.MeshStandardMaterial({ map, roughness: 0.94 });
	const gravelMap = texture(64, 128, (context, width, height) => {
		aggregate(context, width, height, [102, 97, 107], 18, 27);
		const noise = random(45);
		for (let i = 0; i < 280; i++) {
			const x = noise() * (width - 3), y = noise() * (height - 3);
			const size = 0.8 + noise() * 1.6;
			context.fillStyle = "#2f293d38";
			context.fillRect(x + 0.55, y + 0.55, size, size * 0.7);
			context.fillStyle = i % 3 ? "#bdb1bd44" : "#47405260";
			context.beginPath();
			context.moveTo(x, y + size * 0.36);
			context.lineTo(x + size * 0.49, y);
			context.lineTo(x + size, y + size * 0.4);
			context.lineTo(x + size * 0.64, y + size * 0.77);
			context.closePath();
			context.fill();
		}
	});
	gravelMap.wrapT = THREE.RepeatWrapping;
	gravelMap.anisotropy = 4;
	const gravel = new THREE.MeshStandardMaterial({ map: gravelMap, roughness: 1 });
	group.add(
		strip(course, -course.halfWidth, course.halfWidth, asphalt, 0.004, 14),
		strip(course, -course.railOffset - 0.75, -course.halfWidth, gravel, 0, 3.5),
		strip(course, course.halfWidth, course.railOffset + 0.75, gravel, 0, 3.5),
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

	// Keep the two distant silhouettes simple and give the near ridge a shaped slope.
	const noise = random(34);
	for (const [distance, rise, color, phase] of [[radius * 2.34, 246, 0x687993, 2.5], [radius * 1.7, 155, 0x50637e, 1.4], [radius, 84, 0x394e65, 0.2]]) {
		const steps = 72;
		const heights = Array.from({ length: steps }, () => noise() * 0.24);
		const profile = [];
		for (let i = 0; i <= steps; i++) {
			const angle = i * Math.PI * 2 / steps;
			const ux = Math.cos(angle), uz = Math.sin(angle);
			const x = cx + ux * distance, z = cz + uz * distance;
			const height = rise * (0.75 + Math.sin(angle * 5 + phase) * 0.23 + Math.sin(angle * 9 - phase) * 0.16 + heights[i % steps]);
			const footX = cx + ux * distance * 0.74, footZ = cz + uz * distance * 0.74;
			profile.push({
				foot: new THREE.Vector3(footX, course.groundHeight(footX, footZ) - 3, footZ),
				crest: new THREE.Vector3(x, Math.max(12, course.groundHeight(x, z)) + height, z),
			});
		}
		if (distance === radius) {
			nearRidge(group, profile, color);
			continue;
		}
		const ridge = [], indices = [];
		for (const [i, { foot, crest }] of profile.entries()) {
			ridge.push(foot.x, foot.y, foot.z, crest.x, crest.y, crest.z);
			if (i === steps) break;
			const a = i * 2;
			indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
		group.add(surface(ridge, indices, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false, toneMapped: false })));
	}
}

function nearRidge(group, profile, color) {
	const positions = [], indices = [], colors = [], uv = [], pines = [];
	const ridge = new THREE.Color(color);
	const haze = new THREE.Color(0x66768f);
	const shade = new THREE.Color(), treeShade = new THREE.Color();
	const foot = new THREE.Vector3(), crest = new THREE.Vector3(), point = new THREE.Vector3();
	const treePoint = new THREE.Vector3(), edge = new THREE.Vector3();
	const noise = random(191);
	const subdivisions = 3;
	const columns = (profile.length - 1) * subdivisions;
	const rows = 12;
	for (let col = 0; col <= columns; col++) {
		const segment = Math.min(Math.floor(col / subdivisions), profile.length - 2);
		const fraction = col / subdivisions - segment;
		const a = profile[segment], b = profile[segment + 1];
		foot.lerpVectors(a.foot, b.foot, fraction);
		crest.lerpVectors(a.crest, b.crest, fraction);
		const angle = col / columns * Math.PI * 2;
		const forest = Math.sin(angle * 7 + 1) * 0.55 + Math.cos(angle * 13 - 1) * 0.45;
		for (let row = 0; row <= rows; row++) {
			const climb = row / rows;
			const relief = Math.sin(Math.PI * climb);
			const gully = Math.sin(24 * angle + climb * 2.7) + 0.4 * Math.cos(43 * angle - climb * 4);
			point.lerpVectors(foot, crest, climb);
			const strata = Math.sin(0.34 * point.y + 9 * angle);
			point.x += Math.cos(angle) * gully * relief * 5;
			point.z += Math.sin(angle) * gully * relief * 5;
			point.y += gully * relief * 4;
			const i = col * (rows + 1) + row;
			positions.push(point.x, point.y, point.z);
			uv.push(col / 6, climb * 3);
			const mist = 0.24 * (1 - climb) ** 2;
			const shading = 1.04 + relief * (gully * 0.2 + strata * 0.07 - forest * 0.07);
			shade.copy(ridge).multiplyScalar(shading).lerp(haze, mist);
			colors.push(shade.r, shade.g, shade.b);
			if (col < columns && row < rows) {
				indices.push(i, i + 1, i + rows + 1, i + 1, i + rows + 2, i + rows + 1);
			}
			if (col > 0 && row >= 2 && row <= 6 && forest > (row - 4) * 0.24 && noise() < 0.57) {
				// Jitter within the preceding triangle so the pines stay on the slope.
				const across = noise() * 0.75;
				const down = noise() * (1 - across);
				treePoint.copy(point);
				treePoint.addScaledVector(edge.fromArray(positions, (i - rows - 1) * 3).sub(point), across);
				treePoint.addScaledVector(edge.fromArray(positions, (i - 1) * 3).sub(point), down);
				const height = 2.7 + noise() * 4.9;
				treeShade.copy(shade).multiplyScalar(0.63 + noise() * 0.16);
				pines.push({ x: treePoint.x, y: treePoint.y + height * 0.4, z: treePoint.z,
					sx: height * 0.24, sy: height, sz: height * 0.24, yaw: noise() * Math.PI, color: treeShade.getHex() });
			}
		}
	}
	const map = texture(128, 128, (context, width, height) => aggregate(context, width, height, [250, 250, 250], 13, 125));
	map.wrapS = map.wrapT = THREE.RepeatWrapping;
	const material = new THREE.MeshBasicMaterial({ map, vertexColors: true, side: THREE.DoubleSide, fog: false, toneMapped: false });
	group.add(surface(positions, indices, material, { colors, uv }));
	instances(group, new THREE.ConeGeometry(1, 1, 5), new THREE.MeshBasicMaterial({ fog: false, toneMapped: false }), pines);
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
	const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
	const positions = rockGeometry.getAttribute("position");
	const facets = random(28);
	const colors = [];
	for (let i = 0; i < positions.count; i += 3) {
		const height = (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3;
		const shade = 0.96 + facets() * 0.08 + height * 0.055;
		for (let vertex = 0; vertex < 3; vertex++) colors.push(shade, shade, shade);
	}
	rockGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
	instances(group, rockGeometry, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, vertexColors: true }), rocks);
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
