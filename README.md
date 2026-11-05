# SMOKE CULT

Standalone drift test pad. Double-click **Start-Sandbox.bat** to play on this PC.
For phone testing, use **Start-Phone.bat** and follow the printed Wi-Fi address.
Requires Node.js; the 3D library loads from the internet. Close the server window to stop.

Computer and phone use the same site. The layout adapts to screen size and touch input.
Do not open `index.html` directly: browser security can block its JavaScript modules over `file://`.
Use a launcher, `node server.mjs`, or the hosted GitHub Pages site instead.

Controls: W/S gas and brake, A/D steering, Space handbrake, T assist, R reset, C camera,
Tab tuning (keyboard and controller keep driving while it is open, so you can feel changes live). Controllers: RT/LT gas/brake, left stick steer, A/X handbrake,
D-pad Up assist, D-pad Down reset, Y camera, Menu/View tuning. Phones: drag left to steer,
use pedals on the right and TUNE for settings.

Drift scoring starts at 12° and 29 km/h. Angle and speed earn points; sustained drifts build a multiplier
up to ×3. Link another drift within 1.5 seconds to keep the combo. Clean side changes earn a bonus.
Straightening or slowing down banks your points after that grace period. Spinouts, cone hits, resets,
and assist changes lose the pending combo. Banked totals and best combo last for the current page session.

Tests: `node --test tests/*.test.mjs` then `node tests/physics-check.mjs`.
No real controller or phone has been tested yet. This is an early sandbox with placeholder models;
maps and further scoring features (proximity and tandem) are still in development.
