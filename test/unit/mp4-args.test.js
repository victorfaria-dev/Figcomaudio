import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMp4Args, safeExt } from '../../js/export/mp4-args.js';

const clip = { visualStart: 1.5, audioStart: 10, duration: 4 };
const base = { visualName: 'visual.mp4', audioName: 'audio.mp3', outputName: 'out.mp4', clip };

const after = (args, flag) => args[args.indexOf(flag) + 1];

test('vídeo: -ss/-t antes de cada -i, com os inícios corretos', () => {
  const a = buildMp4Args({ ...base, visualKind: 'video' });
  const i1 = a.indexOf('visual.mp4');
  const i2 = a.indexOf('audio.mp3');
  assert.deepEqual(a.slice(i1 - 5, i1 + 1), ['-ss', '1.5', '-t', '4', '-i', 'visual.mp4']);
  assert.deepEqual(a.slice(i2 - 5, i2 + 1), ['-ss', '10', '-t', '4', '-i', 'audio.mp3']);
});

test('imagem: usa -loop 1 e não usa -ss na entrada visual', () => {
  const a = buildMp4Args({ ...base, visualName: 'visual.png', visualKind: 'image' });
  const idx = a.indexOf('visual.png');
  assert.deepEqual(a.slice(idx - 7, idx + 1), ['-loop', '1', '-framerate', '30', '-t', '4', '-i', 'visual.png']);
  assert.ok(!a.slice(0, idx).includes('-ss'));
});

test('mapeia vídeo só da entrada 0 e áudio só da entrada 1 (ignora áudio do vídeo)', () => {
  const a = buildMp4Args({ ...base, visualKind: 'video' });
  const maps = a.flatMap((x, i) => (x === '-map' ? [a[i + 1]] : []));
  assert.deepEqual(maps, ['0:v:0', '1:a:0']);
});

test('saída 512x512, 30 fps, yuv420p, H.264 + AAC', () => {
  const a = buildMp4Args({ ...base, visualKind: 'video' });
  const vf = after(a, '-vf');
  assert.match(vf, /scale=512:512/);
  assert.match(vf, /fps=30/);
  assert.match(vf, /format=yuv420p/);
  assert.equal(after(a, '-c:v'), 'libx264');
  assert.equal(after(a, '-c:a'), 'aac');
  assert.equal(a.at(-1), 'out.mp4');
});

test('duração de saída limitada ao trecho', () => {
  const a = buildMp4Args({ ...base, visualKind: 'video' });
  assert.equal(after(a.slice(a.indexOf('-movflags')), '-t'), '4');
});

test('rejeita tipo inválido e duração não positiva', () => {
  assert.throws(() => buildMp4Args({ ...base, visualKind: 'gif' }));
  assert.throws(() => buildMp4Args({ ...base, visualKind: 'video', clip: { ...clip, duration: 0 } }));
});

test('safeExt', () => {
  assert.equal(safeExt('Foto.JPG'), 'jpg');
  assert.equal(safeExt('sem-extensao'), 'bin');
  assert.equal(safeExt('x.../..\\evil.mp4;rm'), 'bin');
  assert.equal(safeExt('a.webm'), 'webm');
});
