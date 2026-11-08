# SMOKE CULT

An original drift game that runs in the browser. Play at https://tboy450.github.io/smoke-cult/ on a computer or phone:
the same site adapts to your screen. The game opens in the garage. Pick a car, paint it, then drive.

**Development status:** [Update checklist](UPDATE-CHECKLIST.md) — implemented features, completed checks and next work.

**Where you drive:** Rustline Yard, an invented industrial yard with a 1.6 km circuit wrapped around a test pad.
Walls are solid, gravel has less grip, and hitting a wall hard ends your combo. Cross the start line to time a lap.

Choose a **Map** and a **Spawn** in **Garage → Game**. Rustline Yard offers Out the Door, Start Line and Test Pad.
Cinder Pass offers Summit Start for timed runs and Lift Base to explore the bottom of the route.

**Cinder Pass** is a 1.23 km timed descent through six mountain hairpins. Cross START, follow the six checkpoint
gates in order, then cross FINISH. Slow down by the lift after the finish and choose **Ride Lift** for a cable ride
with your car. **↑ Summit** teleports you to the top at any point. The minimap shows the next gate and the lift line.
Hold a clean drift near a guardrail to earn 200 points before the combo multiplier. The bonus is available once per
section between gates. Rail contact interrupts the bonus. The finish banks your active combo and shows time and points.
Times and run scores for the longer route start fresh. Your best combo carries over.

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
| Exit / enter car | RB / R1 | EXIT CAR / GET IN | F |
| Assist preset | D-pad Up | ASSIST | T |
| Reset | D-pad Down | RESET | R |
| Ride lift at Cinder Pass base | B / Circle | RIDE LIFT | L |
| Camera | Y | CAM | C |
| Garage | Menu | GARAGE | G |
| Tuning | View | TUNE | Tab |
| Sound on/off | Garage row | SOUND button | M or SOUND button |

In the garage, use the D-pad or stick to choose and LB/RB to switch tabs. A buys, opens a color picker or drives,
depending on the selected row. Keyboard: arrows, Q/E for tabs and Enter to select. Touch: tap the controls.
On short screens, scroll the garage options above the Drive button.

With a color wheel open, arrows/D-pad adjust hue and saturation; Q/E or LB/RB adjust brightness.
The brightness slider also accepts normal keyboard arrow adjustments.

**On foot:** Stop on your wheels and exit the car. Walk with WASD, the left stick, or a drag on the left side of
the screen. Hold Shift, A/X, or JOG to move faster. Walk back to a door to get in. R, D-pad Down, or CAR brings you
back beside the parked car. Leaving the seat during a timed run ends that attempt.

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

**Burnouts:** from low speed, hold gas and brake together to spin the rear tires while the front brakes hold the car.
Gas with handbrake gives a rolling burnout. Hold brake/reverse and handbrake from a stop for a reverse burnout.

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

Car models are built in code. Detailed testing on real phones and controllers is still open.
