// The SMOKE CULT car list. All original, invented for this game: names, shapes and numbers.
// Each car changes the base numbers in tuning.js. Shapes are side profiles in metres, nose toward -Z:
//   upper: the body's top line from nose to tail.  glass: the cabin, windscreen base to rear glass.
// To use a Blender or Houdini model instead, export it to assets/cars/ and set glb on that car (see assets/README.md).

function wheelsFor(track, wheelbase) {
	const z = wheelbase / 2;
	return [
		{ name: "FL", mount: [-track, -0.2, -z], front: true },
		{ name: "FR", mount: [track, -0.2, -z], front: true },
		{ name: "RL", mount: [-track, -0.2, z], front: false },
		{ name: "RR", mount: [track, -0.2, z], front: false },
	];
}

export const CARS = [
	{
		id: "cinder", name: "CINDER 2D", tag: "All-rounder coupe. The one to learn on.",
		width: 0.9, wheelbase: 2.6, track: 0.78, length: 4.36, floor: -0.47, wing: "gt", seatZ: 0.3, seatY: 0.34,
		tuning: {},
		upper: [[-2.18, -0.2], [-2.12, -0.02], [-1.9, 0.07], [-1.2, 0.16], [-0.8, 0.2], [0.3, 0.23], [1.2, 0.26], [1.95, 0.3], [2.14, 0.22], [2.18, 0.02]],
		glass: [[-0.95, 0.17], [-0.35, 0.56], [0.25, 0.62], [0.85, 0.56], [1.5, 0.28]],
		taper: [0.82, 0.86], glb: null,
	},
	{
		id: "razor", name: "RAZOR KEI", tag: "Tiny and twitchy. Flicks instantly, bites back.",
		width: 0.8, wheelbase: 2.3, track: 0.69, length: 3.42, floor: -0.46, wing: "duck", seatZ: 0.15, seatY: 0.42,
		tuning: { Mass: 880, EngineAccel: 5.6, TopSpeed: 52, MaxSteerDeg: 48, SteerSpeed: 9, RearGrip: 1.0 },
		upper: [[-1.71, -0.2], [-1.66, 0], [-1.5, 0.12], [-1.2, 0.2], [-0.95, 0.24], [0.6, 0.26], [1.6, 0.3], [1.71, 0.1]],
		glass: [[-1.05, 0.21], [-0.62, 0.72], [0.7, 0.76], [1.45, 0.7], [1.62, 0.29]],
		taper: [0.88, 0.92], glb: null,
	},
	{
		id: "mule", name: "MULE V8", tag: "Heavy, loud, huge power. Long, lazy slides.",
		width: 0.96, wheelbase: 2.85, track: 0.83, length: 4.84, floor: -0.47, wing: "duck", scoop: true, seatZ: 0.6, seatY: 0.32,
		tuning: { Mass: 1550, EngineAccel: 7.6, TopSpeed: 68, MaxSteerDeg: 40, RearGrip: 1.0, SteerSpeed: 6 },
		upper: [[-2.42, -0.18], [-2.36, 0.06], [-2.2, 0.15], [-1.2, 0.24], [-0.35, 0.27], [0.6, 0.28], [1.4, 0.32], [2.2, 0.36], [2.4, 0.26], [2.42, 0]],
		glass: [[-0.5, 0.25], [0.05, 0.58], [0.6, 0.62], [1.2, 0.54], [2.0, 0.32]],
		taper: [0.86, 0.9], glb: null,
	},
	{
		id: "soot", name: "SOOT WAGON", tag: "Long-roof sleeper. Calm, stable, easy to hold.",
		width: 0.9, wheelbase: 2.8, track: 0.78, length: 4.68, floor: -0.47, wing: "none", rack: true, seatZ: 0.2, seatY: 0.36,
		tuning: { Mass: 1400, EngineAccel: 6.2, TopSpeed: 60, MaxSteerDeg: 44, RearGrip: 1.08, SteerSpeed: 6.5 },
		upper: [[-2.34, -0.2], [-2.28, 0], [-2.05, 0.1], [-1.3, 0.18], [-0.9, 0.2], [0.6, 0.24], [2.3, 0.27], [2.34, 0.05]],
		glass: [[-1.05, 0.18], [-0.45, 0.6], [0.3, 0.66], [1.7, 0.64], [2.2, 0.5], [2.28, 0.26]],
		taper: [0.84, 0.94], glb: null,
	},
	{
		id: "hex", name: "HEX PROTOTYPE", tag: "Wide, low, ridiculous steering lock. For experts.",
		width: 1.0, wheelbase: 2.7, track: 0.87, length: 4.44, floor: -0.5, wing: "gt", seatZ: 0.3, seatY: 0.26,
		tuning: { Mass: 1120, EngineAccel: 8.4, TopSpeed: 72, MaxSteerDeg: 58, FrontGrip: 1.45, RearGrip: 1.1, SteerSpeed: 9 },
		upper: [[-2.22, -0.28], [-2.16, -0.12], [-1.6, -0.02], [-1.0, 0.1], [-0.55, 0.16], [0.7, 0.2], [1.5, 0.24], [2.1, 0.24], [2.2, 0.1]],
		glass: [[-0.85, 0.09], [-0.25, 0.5], [0.35, 0.54], [1.0, 0.42], [1.75, 0.23]],
		taper: [0.78, 0.84], glb: null,
	},
].map((car) => ({ ...car, wheels: wheelsFor(car.track, car.wheelbase), body: [car.width * 2, 1.0, car.length] }));

export const carById = (id) => CARS.find((c) => c.id === id) ?? CARS[0];
