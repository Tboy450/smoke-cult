# Assets (from Blender / Houdini)

The five cars and the driver are built in code for now. To replace a car with your own model:

1. Export it to `assets/cars/<name>.glb`.
2. In `src/cars.js`, set that car's `glb` to the file, for example `glb: "assets/cars/cinder.glb"`.
3. Reload. The handling doesn't change; only the looks do.

Export settings: glTF 2.0 (.glb), "+Y Up". Nose toward **+Y** in Blender, origin at the centre of mass, 1 unit = 1 m,
matching that car's size in `src/cars.js`. Name the wheel objects `FL`, `FR`, `RL`, `RR` (each with its origin at the wheel
centre) so they steer and spin. Without those names, the built-in wheels stay.

Only our own models or ones whose license allows reuse. Log each in `../SOURCES.md`.
Roblox later: the same models export as `.fbx` for Studio's 3D Importer.
