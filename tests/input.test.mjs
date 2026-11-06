import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';

test('controls release on focus/capture loss, survive reconnects and work around the tuning panel', () => {
  const win = new EventTarget();
  const doc = new EventTarget();
  const elements = new Map();
  for (const id of ['touch-steer', 'touch-gas', 'touch-brake', 'touch-hb', 'touch-preset', 'touch-reset', 'touch-cam', 'touch-tune', 'touch-garage']) {
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
  let lastController = null;
  let garages = 0;
  let cameras = 0;
  let menuOpen = false;
  const menu = [];
  try {
    const input = createInput({ onPreset() {}, onReset() {}, onCamera() { cameras++; }, onMute() {}, onTune() { tunes++; }, onGarage() { garages++; }, onMenu(dx, dy, action) { menu.push(action ?? `${dx},${dy}`); }, isMenuOpen: () => menuOpen, onController(standard) { lastController = standard; }, isTouchBlocked: () => blocked });
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
    pad.buttons[8] = { value: 1, pressed: true };
    pads = [pad]; input.update();
    assert.equal(input.controls.throttle, 0.75); assert.equal(tunes, 2);
    input.update(); assert.equal(tunes, 2, 'held View fires once');
    pads = []; input.update(); assert.equal(input.controls.throttle, 0);
    pads = [pad]; input.update(); assert.equal(tunes, 3, 'reconnected View works');

    // Tuning open: touch stops driving (the panel covers it), keyboard and controller keep driving.
    pads = []; input.update();
    emit(gas, 'pointerdown', { pointerId: 4 });
    input.update(); assert.equal(input.controls.throttle, 1);
    blocked = true; input.update();
    assert.equal(input.controls.throttle, 0, 'held touch releases when tuning opens');
    emit(gas, 'pointerdown', { pointerId: 5 }); input.update();
    assert.equal(input.controls.throttle, 0, 'touch ignored while tuning');
    emit(win, 'keydown', { code: 'KeyW' }); input.update();
    assert.equal(input.controls.throttle, 1, 'keyboard drives while tuning');
    emit(win, 'keyup', { code: 'KeyW' });
    pads = [pad]; input.update();
    assert.equal(input.controls.throttle, 0.75, 'controller drives while tuning');
    pads = []; input.update(); blocked = false;

    // Keys pressed while a slider or button still has focus.
    const slider = { closest: () => slider };
    const fromSlider = (code) => {
      const event = Object.assign(new Event('keydown'), { code, preventDefault() {} });
      Object.defineProperty(event, 'target', { value: slider });
      win.dispatchEvent(event);
    };
    const tunesBefore = tunes;
    fromSlider('Tab'); assert.equal(tunes, tunesBefore + 1, 'Tab closes the panel from a slider');
    fromSlider('KeyW'); input.update(); assert.equal(input.controls.throttle, 1, 'letter keys still drive');
    emit(win, 'keyup', { code: 'KeyW' });
    fromSlider('ArrowLeft'); fromSlider('Space'); input.update();
    assert.equal(input.controls.steer, 0, 'arrows stay with the slider');
    assert.equal(input.controls.handbrake, false, 'Space stays with the focused control');

    const exportText = { matches: (selector) => selector.includes('textarea') };
    const textEvent = (type, code) => {
      const event = Object.assign(new Event(type, { cancelable: true }), { code, ctrlKey: true });
      Object.defineProperty(event, 'target', { value: exportText });
      return event;
    };
    emit(win, 'keydown', { code: 'KeyW' }); input.update();
    assert.equal(input.controls.throttle, 1);
    doc.dispatchEvent(textEvent('focusin'));
    input.update(); assert.equal(input.controls.throttle, 0, 'focusing exported text releases held controls');
    const beforeCopyCamera = cameras, beforeCopyTune = tunes;
    for (const code of ['KeyC', 'KeyW', 'Tab', 'ArrowLeft']) {
      const event = textEvent('keydown', code); win.dispatchEvent(event);
      assert.equal(event.defaultPrevented, false, 'native copying and text navigation remain available');
    }
    input.update();
    assert.equal(input.controls.throttle, 0);
    assert.equal(input.controls.steer, 0);
    assert.equal(cameras, beforeCopyCamera, 'copying never switches cameras');
    assert.equal(tunes, beforeCopyTune, 'Tab inside text uses native focus navigation');

    // Controllers the browser does not call "standard".
    const basic = { index: 1, id: 'bluetooth', mapping: '', axes: [0, 0], buttons: Array.from({ length: 10 }, () => ({ value: 0, pressed: false })) };
    basic.buttons[7] = { value: 1, pressed: true };
    const phantom = { index: 0, id: 'not-a-pad', mapping: '', axes: [1], buttons: [] };
    pads = [null, phantom, basic]; input.update();
    assert.equal(input.controls.throttle, 1, 'non-standard pad drives');
    assert.equal(input.controls.steer, 0, 'phantom device does not steer');
    assert.equal(lastController, false, 'reported as basic mode');
    pads = [phantom]; input.update();
    assert.equal(input.controls.steer, 0, 'phantom device alone is ignored');
    pads = [pad]; input.update();
    assert.equal(lastController, true, 'standard pad reported');

    // The garage: opens from every device, and takes over the controls while it's open.
    pads = [];
    input.update();
    emit(win, 'keydown', { code: 'KeyG' }); assert.equal(garages, 1);
    emit(win, 'keyup', { code: 'KeyG' });
    emit(elements.get('touch-garage'), 'click'); assert.equal(garages, 2);
    const openPad = { index: 0, id: 'menu-pad', mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ value: 0, pressed: false })) };
    openPad.buttons[9] = { value: 1, pressed: true };
    pads = [openPad]; input.update(); assert.equal(garages, 3, 'controller Menu opens the garage');
    menuOpen = true;
    openPad.buttons[9] = { value: 0, pressed: false };
    input.update();

    emit(win, 'keydown', { code: 'KeyW', preventDefault() {} });
    emit(win, 'keydown', { code: 'ArrowRight', preventDefault() {} });
    emit(win, 'keydown', { code: 'Enter', preventDefault() {} });
    emit(win, 'keydown', { code: 'Escape', preventDefault() {} });
    emit(win, 'keydown', { code: 'KeyE', preventDefault() {} });
    assert.deepEqual(menu, ['0,-1', '1,0', 'confirm', 'back', 'tab']);
    menu.length = 0;
    const rangeArrow = Object.assign(new Event('keydown', { cancelable: true }), { code: 'ArrowRight' });
    Object.defineProperty(rangeArrow, 'target', { value: { matches: (selector) => selector === 'input[type="range"]' } });
    win.dispatchEvent(rangeArrow);
    assert.equal(rangeArrow.defaultPrevented, false, 'garage brightness slider keeps native arrow adjustments');
    assert.equal(menu.length, 0, 'slider adjustment must not move the color wheel or garage selection');
    input.update();
    assert.deepEqual(input.controls, { throttle: 0, brake: 0, steer: 0, handbrake: false }, 'keys in the garage never drive');

    openPad.buttons[15] = { value: 1, pressed: true }; input.update();
    openPad.buttons[15] = { value: 0, pressed: false }; input.update();
    openPad.axes[1] = 0.9; input.update(); input.update();
    openPad.axes[1] = 0; input.update();
    openPad.buttons[5] = { value: 1, pressed: true }; input.update();
    openPad.buttons[5] = { value: 0, pressed: false }; input.update();
    openPad.buttons[0] = { value: 1, pressed: true }; input.update();
    openPad.buttons[0] = { value: 0, pressed: false }; openPad.buttons[1] = { value: 1, pressed: true }; input.update();
    assert.deepEqual(menu, ['1,0', '0,1', 'tab', 'confirm', 'back'], 'controller moves once per press, stick included');
    openPad.buttons[7] = { value: 1, pressed: true }; input.update();
    assert.equal(input.controls.throttle, 0, 'triggers do not drive in the garage');
    menuOpen = false;
  } finally {
    globalThis.document = oldDocument;
    globalThis.addEventListener = oldAdd;
    if (oldPads) navigator.getGamepads = oldPads;
    else delete navigator.getGamepads;
  }
});
