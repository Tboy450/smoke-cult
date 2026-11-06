import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createColorWheel } from '../src/colorWheel.js';
import { colorOf, createGarageState, saveData, setCustomColor } from '../src/garageState.js';

function withWheel(check) {
  const previousDocument = globalThis.document;
  // Drawing is a stub; these checks exercise the real pointer, brightness and saving behavior.
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_, key) => key.startsWith('create') ? () => gradient : () => {}, set: () => true });
  const canvas = new EventTarget();
  canvas.width = canvas.height = 240;
  canvas.getContext = () => context;
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 120, height: 120 });
  const captures = new Set();
  canvas.setPointerCapture = (id) => captures.add(id);
  canvas.hasPointerCapture = (id) => captures.has(id);
  canvas.releasePointerCapture = (id) => captures.delete(id);
  const slider = new EventTarget();
  const swatch = { style: {} };
  const percent = {};
  const elements = { '#picker-wheel': canvas, '#picker-value': slider, '#picker-swatch': swatch, '#picker-percent': percent };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const saved = createGarageState();
  const colors = [];
  const wheel = createColorWheel({ querySelector: (selector) => elements[selector] }, (color) => {
    colors.push(color); setCustomColor(saved, 'paint', color);
  });
  const pointer = (type, pointerId, clientX = 127, clientY = 80) => canvas.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX, clientY, button: 0 }));
  try { check({ wheel, slider, percent, swatch, colors, saved, captures, pointer }); }
  finally { globalThis.document = previousDocument; }
}

test('color picking uses displayed canvas coordinates, updates the swatch and survives garage saving', () => withWheel(({ wheel, pointer, colors, saved, swatch }) => {
  wheel.show(0xffffff);
  assert.equal(colors.length, 0, 'opening the wheel must not change the existing choice');
  pointer('pointerdown', 1);
  assert.equal(colors.at(-1), 0xff0000);
  assert.equal(swatch.style.background, '#ff0000');
  const reloaded = createGarageState(JSON.parse(JSON.stringify(saveData(saved))));
  assert.equal(colorOf(reloaded, 'paint'), 0xff0000);
  assert.equal(colorOf(reloaded, 'rims'), colorOf(createGarageState(), 'rims'));
}));

test('only the captured finger can recolor; lost capture, cancellation and closing end the drag', () => withWheel(({ wheel, pointer, colors, captures }) => {
  wheel.show(0xff0000);
  pointer('pointerdown', 1);
  pointer('pointerdown', 2, 70, 80);
  pointer('pointermove', 2, 70, 80);
  pointer('pointerup', 2);
  assert.equal(colors.length, 1);
  pointer('pointermove', 1, 70, 80);
  assert.equal(colors.at(-1), 0xffffff, 'first finger still owns the wheel');
  for (const end of ['lostpointercapture', 'pointercancel', 'pointerup']) {
    pointer(end, 1);
    const before = colors.length;
    pointer('pointermove', 1);
    assert.equal(colors.length, before);
    pointer('pointerdown', 1);
  }
  wheel.cancel();
  assert.equal(captures.size, 0);
  const before = colors.length;
  pointer('pointermove', 1, 70, 80);
  assert.equal(colors.length, before, 'hidden picker cannot keep modifying colors');
}));

test('brightness works through the slider and controller steps, clamps safely and escapes black', () => withWheel(({ wheel, slider, percent, colors }) => {
  wheel.show(0xff0000);
  wheel.brightness(-1);
  assert.equal(percent.textContent, '95%');
  assert.equal(colors.at(-1), 0xf20000);
  slider.value = 50; slider.dispatchEvent(new Event('input'));
  assert.equal(colors.at(-1), 0x800000);
  assert.equal(percent.textContent, '50%');
  wheel.brightness(100); assert.equal(colors.at(-1), 0xff0000);
  wheel.brightness(-100); assert.equal(colors.at(-1), 0);
  wheel.show(0);
  wheel.brightness(1);
  assert.equal(colors.at(-1), 0x0d0d0d);
}));
