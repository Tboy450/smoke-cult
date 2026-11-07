# SMOKE CULT

An original drift game that runs in the browser. Play at https://tboy450.github.io/smoke-cult/ on a computer or phone:
the same site adapts to your screen. The game opens in the garage. Pick a car, paint it, then drive.

**Development status:** [Update checklist](UPDATE-CHECKLIST.md) — implemented features, completed checks and next work.

**Where you drive:** Rustline Yard, an invented industrial yard with a 1.6 km circuit wrapped around a test pad.
Walls are solid, gravel has less grip, and hitting a wall hard ends your combo. Cross the start line to time a lap.

**Cinder Pass** is a 613 m timed descent through three mountain hairpins. In **Garage → Game → Drive At**, choose
**Cinder Pass** and drive out. Cross START, follow the three checkpoint gates in order, then cross FINISH. The minimap
highlights the next gate and the score strip shows progress. Reset returns you to the start for another run.
Hold a clean drift near a guardrail to earn 200 points before the combo multiplier. The bonus is available once per
section between gates. Rail contact interrupts the bonus. The finish banks your active combo and shows time and points.

**Cars:** Cinder 2D, Razor Kei, Mule V8, Soot Wagon and Hex Prototype. All are invented for this game, and each
has its own handling. Your car and colours are remembered in this browser.

**Customization:** body kits, wheel styles, decals, and custom color wheels for body paint, wheels and decals.
The Upgrades tab spends banked drift points on per-car engine, tires, angle-kit and weight upgrades.

| | Controller | Phone | Keyboard |
|---|---|---|---|
| Gas | RT | GAS | W |
| Brake / reverse | LT | BRAKE | S |
| Steer | Left stick | Drag on the left side | A / D |
| Handbrake | A or X | HB | Space |
| Assist preset | D-pad Up | ASSIST | T |
| Reset | D-pad Down | RESET | R |
| Camera | Y | CAM | C |
| Garage | Menu | GARAGE | G |
| Tuning | View | TUNE | Tab |
| Sound on/off | Garage row | SOUND button | M or SOUND button |

In the garage, use the D-pad or stick to choose and LB/RB to switch tabs. A buys, opens a color picker or drives,
depending on the selected row. Keyboard: arrows, Q/E for tabs and Enter to select. Touch: tap the controls.

With a color wheel open, arrows/D-pad adjust hue and saturation; Q/E or LB/RB adjust brightness.
The brightness slider also accepts normal keyboard arrow adjustments.

**Live tuning:** open TUNE (Tab on keyboard, View on controller). Simple offers acceleration, front/rear grip,
steering angle, brakes and bounce control with short explanations. Advanced includes all settings in groups,
with readable units such as km/h, kg, degrees and suspension travel in cm. Left/right arrows switch a focused
tuning tab. Reset restores the selected car including its purchased upgrades. Copy values exports the underlying
handling numbers. If clipboard access is blocked, selected tuning text appears on screen for manual copying.
Download tuning saves a JSON file named for the selected car; Show values opens the text at any time.
Manual tuning is live and is not automatically saved between visits. Exporting saves a snapshot; importing a saved
tuning file into the game is not implemented yet.

**Less HUD on phones:** tap **−** on the score/lap panel to collapse it into a short score strip; tap **+** to restore
the full panel. H does the same on keyboard. The choice is remembered; new mobile sessions start compact.

**Sound** is on by default and starts on your first tap or key press, as browsers require. On iPhones, the ring/silent
switch can also mute it.

**Scoring** starts at 12° and 29 km/h. Angle and speed earn points, and sustained drifts build a multiplier up to ×3.
Link another drift within 1.5 seconds to keep the combo. Clean side changes earn a bonus, and so do the pink clip zones
on the outside of corners (hold at least 20° through them, once per lap each). Straightening or slowing down banks your
points after that grace period. Spinouts, hard wall hits, cone hits, resets and assist changes lose the pending combo.
The upgrade bank, purchased parts and personal bests are saved in this browser. Rustline Yard lap records and Cinder
Pass descent records are separate, and each route's records are shared across cars. Expand the score panel to see them.

## Run it locally

Double-click **Start-Sandbox.bat**, or **Start-Phone.bat** for phones on the same Wi-Fi. Requires Node.js. The 3D library
loads from the internet. Don't open `index.html` directly: browsers block its JavaScript modules over `file://`.

Tests: `node --test tests/*.test.mjs` then `node tests/physics-check.mjs`.

Early build: car models are built in code, and it hasn't been tested on a real phone or controller yet.
