import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTuningPanel } from '../src/tuningPanel.js';

test('keyboard tuning retains focus; pointer completion and closing return focus to driving', () => {
  const previousDocument = globalThis.document;
  const panel = new EventTarget();
  const closeButton = new EventTarget();
  const classes = new Set();
  panel.classList = { contains: (name) => classes.has(name), add: (name) => classes.add(name), remove: (name) => classes.delete(name) };
  let blurs = 0;
  const slider = { blur() { blurs++; globalThis.document.activeElement = null; } };
  const outside = { blur() { throw new Error('Unrelated page control must keep focus'); } };
  panel.contains = (element) => element === slider;
  globalThis.document = { activeElement: slider };
  const click = (detail) => panel.dispatchEvent(Object.assign(new Event('click'), { detail }));
  try {
    const tuning = createTuningPanel(panel, closeButton);
    tuning.toggle();
    assert.ok(classes.has('open'));
    // Range inputs fire change after each keyboard step. Repeated steps must keep editing the range.
    panel.dispatchEvent(new Event('change'));
    panel.dispatchEvent(new Event('change'));
    click(0); // keyboard activation of a tuning button
    assert.equal(blurs, 0);
    assert.equal(document.activeElement, slider);
    click(1); // pointer click completion
    assert.equal(blurs, 1);
    document.activeElement = slider;
    tuning.toggle(); // Tab / controller Menu closes the panel
    assert.ok(!classes.has('open'));
    assert.equal(blurs, 2);
    tuning.toggle();
    document.activeElement = slider;
    closeButton.dispatchEvent(new Event('click'));
    assert.ok(!classes.has('open'));
    assert.equal(blurs, 3);
    slider.matches = () => true; // Read-only tuning text also lives in this panel.
    document.activeElement = slider;
    click(1);
    assert.equal(blurs, 3, 'pointer selection of exported text must not lose focus');
    closeButton.dispatchEvent(new Event('click'));
    assert.equal(blurs, 4, 'closing still releases text focus');
    document.activeElement = outside;
    click(1);
    tuning.toggle(); tuning.toggle();
    assert.equal(document.activeElement, outside);
  } finally {
    globalThis.document = previousDocument;
  }
});
