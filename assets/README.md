# Assets (from Blender / Houdini)

Drop exported `.glb` files here and reload the sandbox. Missing files just keep the placeholder.

| File | What | Export notes |
|---|---|---|
| `car.glb` | Car body | glTF 2.0 (.glb), "+Y Up". Nose toward **+Y** in Blender, origin at the centre of mass, 1 unit = 1 m, about 1.8 m wide × 4.3 m long. Name wheel objects `FL`, `FR`, `RL`, `RR` (each with its origin at the wheel centre) so they steer and spin. |
| `driver.glb` | Driver with helmet | Same export settings. Origin at the helmet centre; it's placed in the left seat. |

Only our own models or ones whose license allows reuse. Log each in `../SOURCES.md`.
Roblox later: the same models export as `.fbx` for Studio's 3D Importer.
