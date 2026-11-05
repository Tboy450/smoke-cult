import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createSandboxServer } from '../server.mjs';

test('server serves game modules and rejects private files and malformed paths', async () => {
  const server = createSandboxServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SMOKE CULT/);
    const script = await fetch(`${url}/src/input.js`);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.match(await script.text(), /createInput/);
    for (const path of ['/CODEX-HANDOFF.md', '/package.json', '/src/..%5c..%5cemberwake/package.json', '/assets/car.glb']) {
      assert.equal((await fetch(url + path)).status, 404, path);
    }
    assert.equal((await fetch(url + '/%E0%A4')).status, 400);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    assert.equal(await (await fetch(url, { method: 'HEAD' })).text(), '');
  } finally {
    await new Promise((done) => server.close(done));
  }
});
