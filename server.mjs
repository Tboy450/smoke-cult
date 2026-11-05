import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };

export function createSandboxServer() {
  return createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const name = pathname === '/' ? 'index.html' : pathname.slice(1);
      const path = resolve(root, name);
      // Serve the game only, never project notes, tooling or files outside this folder.
      if (!path.startsWith(root.endsWith(sep) ? root : root + sep) ||
          !(name === 'index.html' || /^(src|assets)\//.test(name)) || !types[extname(path)]) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const content = await readFile(path);
      res.writeHead(200, { 'Content-Type': types[extname(path)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404); res.end('Not found');
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const lan = process.argv.includes('--lan');
  const server = createSandboxServer();
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Port 8642 is already in use. Close the other sandbox window, then try again.'
      : `Could not start sandbox: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(8642, lan ? '0.0.0.0' : '127.0.0.1', () => {
    const url = 'http://127.0.0.1:8642/';
    console.log(`SMOKE CULT is ready: ${url}\nLeave this window open. Close it to stop.`);
    if (lan) {
      console.log('Phone test: use the same Wi-Fi and open one of these addresses:');
      for (const addresses of Object.values(networkInterfaces())) {
        for (const addr of addresses ?? []) {
          if (addr.family === 'IPv4' && !addr.internal) console.log(`  http://${addr.address}:8642/`);
        }
      }
      console.log('If Windows asks, allow Node on your private network. Stop this server after testing.');
    }
    if (process.platform === 'win32' && !process.argv.includes('--no-open')) {
      const browser = spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' });
      browser.on('error', () => console.log(`Open ${url} in your browser.`));
    }
  });
}
