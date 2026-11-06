import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR, RANGES } from '../src/tuning.js';
import { carTuning } from '../src/upgrades.js';
import { createTuningControls, formatTuningValue, SIMPLE_FIELDS, TUNING_FIELDS } from '../src/tuningUi.js';

class Element extends EventTarget {
  constructor(tag) {
    super(); this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {};
    const classes = new Set();
    this.classList = { toggle: (name, active) => active ? classes.add(name) : classes.delete(name) };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { this.focused = true; }
  // Simulate the rounding that previously silently changed car handling on slider synchronization.
  set value(value) {
    const step = Number(this.step || 1), min = Number(this.min || 0), max = Number(this.max || 100);
    this._value = String(Math.max(min, Math.min(max, min + Math.round((Number(value) - min) / step) * step)));
  }
  get value() { return this._value; }
}
const inputs = (element) => [element, ...element.children.flatMap(inputs)].filter((e) => e.tag === 'input');

function withControls(check) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  const root = new Element('div');
  const buttons = ['simple', 'advanced'].map((mode) => {
    const button = new Element('button'); button.dataset.mode = mode; button.id = `tune-tab-${mode}`; return button;
  });
  const tuning = carTuning(CAR, { EngineAccel: 6.123, Mass: 1113.27 }, { engine: 3, tires: 2, weight: 1 });
  try { check({ root, buttons, tuning, controls: createTuningControls(root, buttons, tuning) }); }
  finally { globalThis.document = previous; }
}

test('opening, syncing and switching tuning modes preserves exact car and upgrade values', () => withControls(({ root, buttons, tuning, controls }) => {
  const original = structuredClone(tuning);
  assert.equal(inputs(root).length, SIMPLE_FIELDS.length);
  assert.notEqual(Number(inputs(root)[0].value), tuning.EngineAccel, 'the mock range actually rounds values');
  controls.sync();
  buttons[1].dispatchEvent(new Event('click'));
  assert.equal(inputs(root).length, Object.keys(RANGES).length);
  assert.deepEqual(Object.keys(TUNING_FIELDS).sort(), Object.keys(RANGES).sort(), 'all existing settings remain available');
  buttons[0].dispatchEvent(new Event('click'));
  assert.deepEqual(tuning, original, 'display must never change handling');
}));

test('edits change only the selected field and carry between Simple and Advanced', () => withControls(({ root, buttons, tuning, controls }) => {
  const original = structuredClone(tuning);
  const acceleration = inputs(root)[0];
  acceleration.value = 7.25; acceleration.dispatchEvent(new Event('input'));
  assert.deepEqual(tuning, { ...original, EngineAccel: 7.25 });
  buttons[1].dispatchEvent(new Event('click'));
  assert.equal(inputs(root)[0].value, '7.25');
  // Reset/car changes synchronize values without reapplying rounded slider steps.
  Object.assign(tuning, original); controls.sync();
  assert.deepEqual(tuning, original);
}));

test('tuning displays useful units while leaving physics values in metric units', () => {
  assert.equal(formatTuningValue('TopSpeed', 60), '216.0 km/h');
  assert.equal(formatTuningValue('SpringLength', 0.35), '35.0 cm');
  assert.equal(formatTuningValue('Damping', 0.45), '45%');
  assert.equal(formatTuningValue('FrontGrip', 1.3), '1.30×');
  assert.equal(formatTuningValue('Mass', 1250), '1250 kg');
});

test('tuning tabs support keyboard selection, focus and accessible panel labels', () => withControls(({ root, buttons }) => {
  const press = (button, key) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key });
    button.dispatchEvent(event); assert.ok(event.defaultPrevented);
  };
  press(buttons[0], 'ArrowRight');
  assert.equal(buttons[1].attributes['aria-selected'], 'true');
  assert.equal(buttons[0].attributes['aria-selected'], 'false');
  assert.equal(root.attributes['aria-labelledby'], 'tune-tab-advanced');
  assert.ok(buttons[1].focused);
  press(buttons[1], 'Home');
  assert.equal(buttons[0].tabIndex, 0);
  assert.equal(buttons[1].tabIndex, -1);
  assert.equal(root.attributes['aria-labelledby'], 'tune-tab-simple');
}));
