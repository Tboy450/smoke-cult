# SMOKE CULT — update checklist

Updated November 6, 2026. Current update: compact mobile score/lap panel and color-picker control fixes.
Prior recovered garage update: `ff2879e`.

This is the shared checklist for continuing SMOKE CULT. Update it whenever a feature is completed,
tested, published or deferred. A completed implementation is not proof that it feels good on a real device.

## Implemented and published

- [x] Standalone browser game, public GitHub repo and GitHub Pages site.
- [x] One responsive site for desktop, phone portrait and phone landscape.
- [x] Keyboard, controller and touch input; Arcade, Balanced and Off assists.
- [x] Tire smoke, skid marks, cones, engine/tire sound and three cameras.
- [x] Rustline Yard circuit, test pad, solid walls, gravel and minimap.
- [x] Lap timing, wrong-way detection and drift clipping zones.
- [x] Angle/speed scoring, linked combos, multipliers, transition bonuses and clear banking/loss feedback.
- [x] Five original code-built cars with different handling.
- [x] Smokehouse garage, drive-in bay and track/test-pad spawn choices.
- [x] Garage tabs with keyboard, controller and touch navigation.
- [x] Body kits and five wheel styles.
- [x] Decals: twin stripes, side slash, flames, checker fade and Cult Ring.
- [x] Custom color wheel and brightness for body, wheels and decals.
- [x] Underglow and tire-smoke color options.
- [x] Banked-point upgrade shop: engine, tires, steering angle and weight; per-car stages.
- [x] Browser saving for garage selections, custom colors, upgrade bank and purchased parts.
- [x] Compact combo HUD and low-graphics option.
- [x] Larger touch minimize/expand button for the whole score/lap panel; short collapsed strip and saved preference.
- [x] New mobile sessions default to a compact score/lap panel without overriding existing saved choices.
- [x] Color-wheel brightness through Q/E or controller LB/RB, native keyboard slider input and percentage display.
- [x] Color wheel tracks one finger and stops on release, lost pointer capture, cancellation or picker closure.
- [x] Live tuning with keyboard/controller driving while adjusting settings.
- [x] Assist-dependent gravel behavior, including grip, drag and braking.
- [x] Recovered Claude's uncommitted update, backed it up, committed all required modules and published it.

## Verification completed

- [x] All 65 Node tests passed for the recovered update, including the HTTP test with localhost access enabled.
- [x] New automated regressions cover pointer ownership, drag cancellation, brightness controls, custom-color saving and compact-HUD defaults/persistence.
- [x] All 69 Node tests and scripted physics checks passed after the HUD and picker fixes.
- [x] Headless physics checks passed for Arcade, Balanced and Off.
- [x] All source JavaScript files passed syntax checks.
- [x] AI lap, upgraded-car handling, gravel, color math, save-state and purchase checks passed.
- [x] Earlier scoring update was test-driven in a browser, including earning and banking points.
- [x] Earlier scoring HUD was visually checked at desktop, 390×844 and 844×390.
- [x] GitHub Pages build and public availability of recovered color-wheel markup, decals and upgrade code verified.

The browser checker timed out during recovery and again during this follow-up. The earlier visual checks do **not**
cover the recovered garage or current HUD/control changes. New interaction checks use drawing stubs, not visual rendering.

## Next: verify the recovered update

- [ ] Visually check every decal on all five cars, including roof/side placement and color changes.
- [ ] Try the color wheel, brightness, body kits and wheel styles on desktop and phone.
- [ ] Reload after customizing and buying upgrades; confirm saved choices, bank and purchases survive correctly.
- [ ] Test a physical controller: triggers, stick, handbrake, garage tabs, color picker, upgrades and reconnect.
- [ ] Test a real phone in portrait and landscape: steering plus pedals, garage scrolling, picker and tuning.
- [ ] Verify audible sound starts on real-phone gestures and with controller-first play.
- [ ] Measure real-device frame rate and input responsiveness on both graphics settings.
- [ ] Human playtest stock and upgraded cars; check drift feel, gravel difficulty and upgrade prices.

## Improvements still open

- [ ] Friendly Simple and Advanced tuning tabs instead of only raw sliders.
- [ ] Improve non-standard controller mapping; current fallback guesses the layout.
- [ ] Make tuning export usable when clipboard access is blocked on LAN HTTP.
- [ ] Review keyboard focus, screen sizes, contrast and control accessibility in the recovered garage.
- [ ] Original Blender/Houdini car and helmeted driver models; code-built models are still placeholders.
- [ ] More original maps, starting with a mountain touge if that remains the chosen direction.
- [ ] Proximity and additional smoke/style scoring.
- [ ] Decide whether best combos and lap records should persist beyond the page session.
- [ ] Further progression, unlocks and economy balancing after play feedback.

## Later

- [ ] Multiplayer with a separate realtime server; GitHub Pages hosts the static client only.
- [ ] Passenger features and tandem/chasing gameplay.
- [ ] Sim mode.
- [ ] Roblox import after the standalone experience is ready.

## For every update

1. Confirm you are in the `Tboy450/smoke-cult` repository; leave other projects alone.
2. Check local changes before editing. Preserve unfinished work and include newly required modules.
3. Run checks appropriate to the change. Full checks: `node --test tests/*.test.mjs` and `node tests/physics-check.mjs`.
4. Record what was actually tested, particularly physical-device and visual verification limits.
5. Commit and push completed authorized updates to `codex/github-pages`; verify Pages built the matching commit.
6. Update this checklist. Do not mark a feature verified merely because its files were published.

Use original or appropriately licensed assets and record outside sources in `SOURCES.md`.
Never use or suggest the built-in image generator, including for editing.
