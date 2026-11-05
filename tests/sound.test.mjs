import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSound } from '../src/sound.js';

// Behaves like a strict phone browser: audio only starts while a real gesture is happening.
function fakeBrowser() {
  const browser = { gesture: false, contexts: [] };
  const node = (extra = {}) => ({ connect: (next) => next, gain: { value: 1, setTargetAtTime() {} }, frequency: { value: 0, setTargetAtTime() {} }, Q: { value: 0 }, start() { this.started = true; }, ...extra });
  browser.AudioContextClass = class {
    constructor() {
      this.state = 'suspended';
      this.sampleRate = 8;
      this.currentTime = 0;
      this.destination = node();
      this.resumes = 0;
      browser.contexts.push(this);
    }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBiquadFilter() { return node(); }
    createBufferSource() { return node(); }
    createBuffer(_, length) { return { getChannelData: () => new Float32Array(length) }; }
    resume() { this.resumes++; if (browser.gesture) this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  };
  browser.events = new EventTarget();
  browser.doc = new EventTarget();
  browser.doc.hidden = false;
  browser.fire = (type, gesture) => {
    browser.gesture = gesture;
    browser.events.dispatchEvent(new Event(type));
    browser.gesture = false;
  };
  return browser;
}

const make = (b) => createSound({ AudioContextClass: b.AudioContextClass, events: b.events, doc: b.doc });

test('a phone tap starts sound when the finger lifts, even though the touch start was refused', () => {
  const b = fakeBrowser();
  const sound = make(b);
  assert.equal(sound.state, 'not started');
  b.fire('pointerdown', false);
  b.fire('pointerup', true);
  assert.equal(sound.state, 'running');
});

test('refused attempts keep retrying on later gestures', () => {
  const b = fakeBrowser();
  const sound = make(b);
  b.fire('pointerup', false); // this browser refused that one
  assert.equal(sound.state, 'suspended');
  b.fire('touchend', false);
  assert.equal(sound.state, 'suspended');
  b.fire('click', true);
  assert.equal(sound.state, 'running');
  assert.equal(b.contexts.length, 1, 'one audio context, reused');
});

test('sound that gets suspended later comes back on the next tap', () => {
  const b = fakeBrowser();
  const sound = make(b);
  b.fire('click', true);
  b.contexts[0].state = 'interrupted'; // a phone call, or the phone was locked
  b.fire('touchend', true);
  assert.equal(sound.state, 'running');
});

test('sound is on by default; off stays off through taps and back on with one gesture', () => {
  const b = fakeBrowser();
  const sound = make(b);
  assert.equal(sound.enabled, true);
  b.fire('click', true);
  sound.setEnabled(false);
  assert.equal(sound.state, 'suspended');
  b.fire('click', true);
  assert.equal(sound.state, 'suspended', 'tapping around does not unmute');
  b.gesture = true;
  sound.setEnabled(true);
  b.gesture = false;
  assert.equal(sound.state, 'running');
});

test('nothing starts on page load, before any gesture', () => {
  const b = fakeBrowser();
  const sound = make(b);
  assert.equal(b.contexts.length, 0);
  assert.equal(sound.state, 'not started');
});

test('starting muted creates no audio until it is switched on', () => {
  const b = fakeBrowser();
  const sound = createSound({ AudioContextClass: b.AudioContextClass, events: b.events, doc: b.doc, enabled: false });
  assert.equal(sound.enabled, false);
  b.fire('click', true);
  assert.equal(b.contexts.length, 0);
  b.gesture = true;
  sound.setEnabled(true);
  assert.equal(sound.state, 'running');
});

test('a hidden tab goes quiet and returns when shown again', () => {
  const b = fakeBrowser();
  const sound = make(b);
  b.fire('click', true);
  b.doc.hidden = true;
  b.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(sound.state, 'suspended');
  b.doc.hidden = false;
  b.gesture = true;
  b.doc.dispatchEvent(new Event('visibilitychange'));
  b.gesture = false;
  assert.equal(sound.state, 'running');
});

test('a browser with no audio support does not crash the game', () => {
  const b = fakeBrowser();
  const sound = createSound({ AudioContextClass: undefined, events: b.events, doc: b.doc });
  b.fire('click', true);
  sound.idle();
  sound.update({ forwardSpeed: 10, wheels: [] }, { throttle: 1 });
  assert.equal(sound.state, 'not started');
});
