import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, mkdir, copyFile } from 'node:fs/promises';

const mime = {
  '/': 'text/html; charset=utf-8', '/app.js': 'text/javascript; charset=utf-8',
  '/styles.css': 'text/css; charset=utf-8', '/sw.js': 'text/javascript; charset=utf-8',
  '/manifest.webmanifest': 'application/manifest+json; charset=utf-8',
  '/icon-192.png': 'image/png', '/icon-512.png': 'image/png',
};
const js = (await build({
  entryPoints: ['web/app.js'], bundle: true, format: 'iife', minify: true, write: false,
  target: ['chrome105', 'safari16'],
})).outputFiles[0].contents;
const assets = {};
for (const [path, type] of Object.entries(mime)) {
  const filename = path === '/' ? 'index.html' : path.slice(1);
  const value = path === '/app.js' ? js : await readFile('web/' + filename);
  assets[path] = [type, Buffer.from(value).toString('base64')];
}
const revision = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16);
assets['/sw.js'][1] = Buffer.from(
  Buffer.from(assets['/sw.js'][1], 'base64').toString().replace('__BUILD__', revision),
).toString('base64');
await build({
  entryPoints: ['worker/index.js'], bundle: true, platform: 'browser', format: 'esm',
  define: { SERVED_ASSETS: JSON.stringify(assets) }, outfile: 'dist/server/index.js',
});
await mkdir('dist/.openai', { recursive: true });
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
