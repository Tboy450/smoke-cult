import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';

test('controls release on focus/capture loss and survive controller reconnect', () => {
  const win = new EventTarget();
  const doc = new EventTarget();
  const elements = new Map();
  for (const id of ['touch-steer', 'touch-gas', 'touch-brake', 'touch-hb', 'touch-preset', 'touch-reset', 'touch-cam', 'touch-tune']) {
    const element = new EventTarget();
    element.setPointerCapture = () => {};
    elements.set(id, element);
  }
  doc.getElementById = (id) => elements.get(id);
  doc.hidden = false;
  const oldDocument = globalThis.document;
  const oldAdd = globalThis.addEventListener;
  const oldPads = navigator.getGamepads;
  let pads = [];
  globalThis.document = doc;
  globalThis.addEventListener = win.addEventListener.bind(win);
  navigator.getGamepads = () => pads;
  const emit = (target, type, values = {}) => target.dispatchEvent(Object.assign(new Event(type), values));
  let blocked = false;
  let tunes = 0;
  try {
    const input = createInput({ onPreset() {}, onReset() {}, onCamera() {}, onMute() {}, onTune() { tunes++; }, isDrivingBlocked: () => blocked });
    emit(win, 'keydown', { code: 'KeyW' });
    input.update(); assert.equal(input.controls.throttle, 1);
    emit(win, 'blur'); input.update(); assert.equal(input.controls.throttle, 0);
    emit(win, 'focus'); input.update(); assert.equal(input.controls.throttle, 0);
    const gas = elements.get('touch-gas');
    emit(gas, 'pointerdown', { pointerId: 1 });
    emit(gas, 'pointerdown', { pointerId: 2 });
    emit(gas, 'pointerup', { pointerId: 1 });
    input.update(); assert.equal(input.controls.throttle, 1, 'second finger still held');
    emit(gas, 'lostpointercapture', { pointerId: 2 });
    input.update(); assert.equal(input.controls.throttle, 0);
    const steer = elements.get('touch-steer');
    emit(steer, 'pointerdown', { pointerId: 3, clientX: 100 });
    emit(steer, 'pointermove', { pointerId: 3, clientX: 190 });
    input.update(); assert.equal(input.controls.steer, 1);
    doc.hidden = true; emit(doc, 'visibilitychange'); input.update();
    assert.equal(input.controls.steer, 0);
    doc.hidden = false;
    emit(elements.get('touch-tune'), 'click'); assert.equal(tunes, 1);
    const pad = { index: 0, id: 'test', mapping: 'standard', axes: [0.7], buttons: Array.from({ length: 16 }, () => ({ value: 0, pressed: false })) };
    pad.buttons[7] = { value: 0.75, pressed: true };
    pad.buttons[9] = { value: 1, pressed: true };
    pads = [pad]; input.update();
    assert.equal(input.controls.throttle, 0.75); assert.equal(tunes, 2);
    input.update(); assert.equal(tunes, 2, 'held Menu fires once');
    pads = []; input.update(); assert.equal(input.controls.throttle, 0);
    pads = [pad]; input.update(); assert.equal(tunes, 3, 'reconnected Menu works');
    blocked = true; input.update();
    assert.deepEqual(input.controls, { throttle: 0, brake: 0, steer: 0, handbrake: false });
  } finally {
    globalThis.document = oldDocument;
    globalThis.addEventListener = oldAdd;
    if (oldPads) navigator.getGamepads = oldPads;
    else delete navigator.getGamepads;
  }
});
