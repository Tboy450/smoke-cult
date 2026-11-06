import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTuningExport } from '../src/tuningExport.js';

async function withExport(clipboard, check, { failDownload = false } = {}) {
  const previous = globalThis.document;
  const elements = {};
  for (const id of ['tune-export', 'tune-export-text', 'tune-export-status', 'tune-copy', 'tune-download', 'tune-show', 'tune-select', 'tune-hide']) elements['#' + id] = new EventTarget();
  const field = elements['#tune-export-text'];
  elements['#tune-export'].hidden = true;
  field.focus = () => { document.activeElement = field; };
  field.select = () => { field.selected = true; };
  field.blur = () => { document.activeElement = null; };
  const links = [], blobs = [], revoked = [], scheduled = [];
  globalThis.document = { body: { appendChild() {} }, createElement() {
    const link = { click() { if (failDownload) throw new Error('Unavailable'); this.clicked = true; }, remove() { this.removed = true; } };
    links.push(link); return link;
  } };
  const tuning = { TopSpeed: 60, EngineAccel: 6.123456789, Mass: 1113.27 };
  const ui = createTuningExport({ querySelector: (selector) => elements[selector] }, () => tuning, {
    clipboard,
    urls: { createObjectURL(blob) { blobs.push(blob); return 'blob:export'; }, revokeObjectURL(url) { revoked.push(url); } },
    schedule(fn) { scheduled.push(fn); }, filename: () => 'smoke-cult-cinder-tuning.json',
  });
  try { await check({ ui, field, tuning, elements, links, blobs, revoked, scheduled }); }
  finally { globalThis.document = previous; }
}

test('clipboard receives exact current numbers without changing the handling or opening the fallback', async () => {
  let copied;
  await withExport({ async writeText(text) { copied = text; } }, async ({ ui, tuning, elements }) => {
    const before = structuredClone(tuning);
    await ui.copy();
    assert.deepEqual(JSON.parse(copied), before);
    assert.deepEqual(tuning, before);
    assert.equal(elements['#tune-export'].hidden, true);
    assert.equal(elements['#tune-export-status'].textContent, 'Tuning copied.');
  });
});

test('missing or denied clipboard exposes selected text and remains usable for another export', async () => {
  for (const clipboard of [{}, { async writeText() { throw new Error('Denied'); } }]) {
    await withExport(clipboard, async ({ ui, field, tuning, elements }) => {
      await ui.copy();
      assert.equal(elements['#tune-export'].hidden, false);
      assert.deepEqual(JSON.parse(field.value), tuning);
      assert.equal(document.activeElement, field); assert.ok(field.selected);
      tuning.TopSpeed = 67.321;
      await ui.copy(); assert.equal(JSON.parse(field.value).TopSpeed, 67.321);
      elements['#tune-hide'].dispatchEvent(new Event('click'));
      assert.equal(elements['#tune-export'].hidden, true);
      assert.equal(document.activeElement, null);
      elements['#tune-show'].dispatchEvent(new Event('click'));
      assert.equal(elements['#tune-export'].hidden, false);
    });
  }
});

test('download contains exact tuning, uses the car filename and releases its temporary resources', async () => {
  await withExport({}, async ({ ui, tuning, blobs, links, scheduled, revoked }) => {
    ui.download();
    assert.deepEqual(JSON.parse(await blobs[0].text()), tuning);
    assert.equal(blobs[0].type, 'application/json');
    assert.equal(links[0].download, 'smoke-cult-cinder-tuning.json');
    assert.ok(links[0].clicked); assert.ok(links[0].removed);
    assert.equal(revoked.length, 0, 'URL must remain alive while browser starts download');
    scheduled[0](); assert.deepEqual(revoked, ['blob:export']);
  });
});

test('failed downloads also fall back to selected text without losing the snapshot', async () => {
  await withExport({}, async ({ ui, tuning, field, elements, links }) => {
    ui.download();
    assert.equal(elements['#tune-export'].hidden, false);
    assert.deepEqual(JSON.parse(field.value), tuning);
    assert.ok(field.selected); assert.ok(links[0].removed);
  }, { failDownload: true });
});

test('a delayed refusal from an older copy cannot replace a newer successful export', async () => {
  let rejectFirst, calls = 0;
  await withExport({ writeText() {
    calls++;
    return calls === 1 ? new Promise((_, reject) => { rejectFirst = reject; }) : Promise.resolve();
  } }, async ({ ui, tuning, elements }) => {
    const first = ui.copy();
    tuning.Mass = 1200;
    await ui.copy();
    rejectFirst(new Error('Delayed refusal'));
    await first;
    assert.equal(elements['#tune-export'].hidden, true);
    assert.equal(elements['#tune-export-status'].textContent, 'Tuning copied.');
  });
});
