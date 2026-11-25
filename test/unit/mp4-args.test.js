import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMp4Args, safeExt, isMissingAudioError } from '../../js/export/mp4-args.js';

const base = { inputName: 'in.mp4', outputName: 'out.mp4', clip: { start: 1.5, duration: 4 } };
const after = (args, flag) => args[args.indexOf(flag) + 1];

test('uma única entrada, com -ss/-t antes do -i', () => {
  const a = buildMp4Args(base);
  assert.deepEqual(a.slice(0, 6), ['-ss', '1.5', '-t', '4', '-i', 'in.mp4']);
  assert.equal(a.filter((x) => x === '-i').length, 1);
});

test('vídeo e som vêm do mesmo arquivo (som obrigatório)', () => {
  const a = buildMp4Args(base);
  const maps = a.flatMap((x, i) => (x === '-map' ? [a[i + 1]] : []));
  assert.deepEqual(maps, ['[v]', '0:a:0']);
  assert.ok(!maps.some((m) => m.endsWith('?')), 'som não pode ser opcional');
});

test('saída 512x512, 30 fps, yuv420p, H.264 + AAC', () => {
  const a = buildMp4Args(base);
  const g = after(a, '-filter_complex');
  assert.match(g, /scale=512:512/);
  assert.match(g, /fps=30/);
  assert.match(g, /format=yuv420p/);
  assert.equal(after(a, '-c:v'), 'libx264');
  assert.equal(after(a, '-c:a'), 'aac');
  assert.equal(a.at(-1), 'out.mp4');
});

test('fundo sólido atrás do vídeo (transparência não vaza)', () => {
  assert.match(after(buildMp4Args(base), '-filter_complex'), /color=c=white:s=512x512.*overlay/);
  assert.match(after(buildMp4Args({ ...base, background: 'black' }), '-filter_complex'), /color=c=black/);
});

test('duração de saída limitada ao trecho', () => {
  const a = buildMp4Args(base);
  assert.equal(after(a.slice(a.indexOf('-movflags')), '-t'), '4');
});

test('rejeita duração não positiva', () => {
  assert.throws(() => buildMp4Args({ ...base, clip: { start: 0, duration: 0 } }));
});

test('isMissingAudioError reconhece o erro do ffmpeg', () => {
  assert.equal(isMissingAudioError("Stream map '0:a:0' matches no streams."), true);
  assert.equal(isMissingAudioError('Conversion failed!'), false);
});

test('safeExt', () => {
  assert.equal(safeExt('Video.MOV'), 'mov');
  assert.equal(safeExt('sem-extensao'), 'bin');
  assert.equal(safeExt('x.../..\\evil.mp4;rm'), 'bin');
});
