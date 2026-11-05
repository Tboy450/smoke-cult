// Drift handling numbers, in metres / seconds / kg. Same names as the Roblox prototype's Tuning.luau,
// so whatever feels good here can be copied across later (1 m is about 3.57 studs).
// Press Tab in the sandbox to change these live with sliders.

export const CAR = {
	// Steering
	MaxSteerDeg: 42, // full lock, also used while counter-steering
	SteerSpeed: 7, // how fast the wheels turn toward the stick/key (higher = twitchier)
	HighSpeedSteerScale: 0.5, // lock left at top speed when NOT drifting (keeps pads/phones stable)

	// Body
	Mass: 1250,

	// Suspension
	SpringLength: 0.35,
	WheelRadius: 0.33,
	StaticSag: 0.4, // how much the springs sit compressed at rest (0-1)
	Damping: 0.45, // 1 = no bounce, lower = bouncier

	// Tires
	FrontGrip: 1.3,
	RearGrip: 1.05,
	FrontSlide: 0.9, // grip left once the front tires are sliding (fraction of peak)
	PeakSlipDeg: 8, // tire slip angle with the most grip
	SlideSlipDeg: 25, // slip angle where grip has dropped to its slide value
	HandbrakeGrip: 0.35, // rear grip multiplier while the handbrake is held

	// Engine and brakes (m/s^2 and m/s; 1 m/s = 3.6 km/h)
	EngineAccel: 6,
	TopSpeed: 60,
	ReverseSpeed: 12,
	BrakeAccel: 9,

	// Weight feel
	Downforce: 0.0008, // extra push into the ground that grows with speed
	ForceHeight: 0.6, // 0 = tire forces at the road (more body roll), 1 = at the axle (flatter)
};

// Slider ranges for the tuning panel: [min, max, step].
export const RANGES = {
	MaxSteerDeg: [20, 70, 1],
	SteerSpeed: [2, 20, 0.5],
	HighSpeedSteerScale: [0.2, 1, 0.05],
	Mass: [800, 2000, 25],
	SpringLength: [0.15, 0.6, 0.01],
	StaticSag: [0.1, 0.8, 0.05],
	Damping: [0.1, 1.2, 0.05],
	FrontGrip: [0.5, 2, 0.05],
	RearGrip: [0.4, 2, 0.05],
	FrontSlide: [0.4, 1, 0.02],
	PeakSlipDeg: [3, 20, 0.5],
	SlideSlipDeg: [10, 60, 1],
	HandbrakeGrip: [0.05, 1, 0.05],
	EngineAccel: [1, 15, 0.25],
	TopSpeed: [20, 100, 1],
	BrakeAccel: [3, 20, 0.5],
	Downforce: [0, 0.003, 0.0001],
	ForceHeight: [0, 1, 0.05],
};

// Counter-steer assist presets. Assist steers the front wheels toward where the car is travelling;
// SpinGuard slows the spin when the car passes SpinGuardDeg of drift angle.
export const PRESETS = {
	Arcade: { Assist: 0.75, RearSlide: 0.85, SpinGuardDeg: 40, SpinGuard: 4 },
	Balanced: { Assist: 0.65, RearSlide: 0.8, SpinGuardDeg: 45, SpinGuard: 3.5 },
	Off: { Assist: 0, RearSlide: 0.7, SpinGuardDeg: 180, SpinGuard: 0 },
};
export const PRESET_ORDER = ["Arcade", "Balanced", "Off"];
export const DEFAULT_PRESET = "Balanced";

// Suspension mount points in car space (metres from the centre of mass). The nose points toward -Z.
export const WHEELS = [
	{ name: "FL", mount: [-0.78, -0.2, -1.3], front: true },
	{ name: "FR", mount: [0.78, -0.2, -1.3], front: true },
	{ name: "RL", mount: [-0.78, -0.2, 1.3], front: false },
	{ name: "RR", mount: [0.78, -0.2, 1.3], front: false },
];

// Body box used for inertia and for scraping the ground if the car rolls over.
export const BODY_SIZE = [1.8, 1.0, 4.4];
