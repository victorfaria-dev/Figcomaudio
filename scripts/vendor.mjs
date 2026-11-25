// Copia o ffmpeg.wasm de node_modules para vendor/ (servido como arquivo estático).
import { cpSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const nm = (p) => resolve(root, 'node_modules', p);
const out = resolve(root, 'vendor');

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'ffmpeg'), { recursive: true });
mkdirSync(resolve(out, 'ffmpeg-core'), { recursive: true });

// Biblioteca (wrapper + worker), só os .js
const libDir = nm('@ffmpeg/ffmpeg/dist/esm');
for (const f of readdirSync(libDir).filter((f) => f.endsWith('.js'))) {
  cpSync(resolve(libDir, f), resolve(out, 'ffmpeg', f));
}

// Núcleo single-thread (não precisa de SharedArrayBuffer nem de cabeçalhos COOP/COEP)
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  cpSync(nm(`@ffmpeg/core/dist/esm/${f}`), resolve(out, 'ffmpeg-core', f));
}
console.log('vendor/ atualizado.');
