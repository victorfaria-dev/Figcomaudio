// Roda o ffmpeg DO SISTEMA com os mesmos argumentos do app e valida a saída com ffprobe.
// Valida filtros/codecs/mapeamento; a execução em wasm é coberta por test:e2e.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildMp4Args } from '../../js/export/mp4-args.js';

const dir = resolve('test/.tmp/integration');
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const opts = { skip: !hasFfmpeg && 'ffmpeg não encontrado no PATH' };

const run = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
const probe = (file) =>
  JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString(),
  );

before(() => {
  if (!hasFfmpeg) return;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // vídeo retangular 640x360 de 8 s (com áudio próprio, que deve ser ignorado)
  run(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=8',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', join(dir, 'in.mp4')]);
  // vídeo vertical 360x640
  run(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=25:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', join(dir, 'tall.mp4')]);
  // áudio de 12 s
  run(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=12', '-y', join(dir, 'in.mp3')]);
  // PNG 100% transparente cuja cor "escondida" é vermelha (caso típico de figurinha)
  run(['-f', 'lavfi', '-i', 'color=c=red@0.0:s=300x200,format=rgba', '-frames:v', '1', '-y', join(dir, 'transp.png')]);
  // imagem retangular
  run(['-f', 'lavfi', '-i', 'testsrc=size=500x333:rate=1:duration=1', '-frames:v', '1', '-y', join(dir, 'in.png')]);
});
after(() => rmSync(dir, { recursive: true, force: true }));

function exportWith(visualKind, visualFile, clip, out) {
  const args = buildMp4Args({
    visualKind,
    visualName: join(dir, visualFile),
    audioName: join(dir, 'in.mp3'),
    outputName: join(dir, out),
    clip,
  });
  run(args);
  return probe(join(dir, out));
}

function assertSquareWithAudio(info, expectedDuration) {
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  assert.ok(v && a, 'deve ter vídeo e áudio');
  assert.equal(v.width, 512);
  assert.equal(v.height, 512);
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(a.codec_name, 'aac');
  assert.equal(info.streams.filter((s) => s.codec_type === 'audio').length, 1, 'só um áudio (o do vídeo é ignorado)');
  const dur = Number(info.format.duration);
  assert.ok(Math.abs(dur - expectedDuration) < 0.25, `duração ${dur} ≈ ${expectedDuration}`);
}

test('vídeo horizontal → 512x512 com áudio, 5 s', opts, () => {
  assertSquareWithAudio(exportWith('video', 'in.mp4', { visualStart: 1, audioStart: 3, duration: 5 }, 'a.mp4'), 5);
});

test('vídeo vertical → 512x512 com áudio, 3 s', opts, () => {
  assertSquareWithAudio(exportWith('video', 'tall.mp4', { visualStart: 0, audioStart: 0, duration: 3 }, 'b.mp4'), 3);
});

test('imagem estática → 512x512 com áudio, 2.5 s', opts, () => {
  assertSquareWithAudio(exportWith('image', 'in.png', { visualStart: 0, audioStart: 4, duration: 2.5 }, 'c.mp4'), 2.5);
});

test('o áudio vem do arquivo de áudio (880 Hz), não do vídeo (220 Hz)', opts, () => {
  exportWith('video', 'in.mp4', { visualStart: 0, audioStart: 0, duration: 2 }, 'd.mp4');
  // extrai PCM e estima a frequência por cruzamentos de zero
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', join(dir, 'd.mp4'), '-f', 's16le', '-ac', '1', '-ar', '44100', '-'], { maxBuffer: 1 << 26 });
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 !== samples[i] < 0) crossings++;
  const hz = crossings / 2 / (samples.length / 44100);
  assert.ok(Math.abs(hz - 880) < 40, `frequência estimada ${hz.toFixed(0)} Hz ≈ 880`);
});

test('PNG transparente vira fundo branco (não a cor escondida nos pixels transparentes)', opts, () => {
  exportWith('image', 'transp.png', { visualStart: 0, audioStart: 0, duration: 1 }, 'f.mp4');
  const px = execFileSync('ffmpeg', ['-v', 'error', '-i', join(dir, 'f.mp4'), '-frames:v', '1',
    '-vf', 'crop=w=2:h=2:x=255:y=255,format=rgb24', '-f', 'rawvideo', '-']);
  const [r, g, b] = px;
  assert.ok(r > 235 && g > 235 && b > 235, `pixel central deveria ser branco, veio rgb(${r},${g},${b})`);
});

test('tamanho do arquivo é razoável (< 1 MB para 5 s)', opts, () => {
  exportWith('video', 'in.mp4', { visualStart: 0, audioStart: 0, duration: 5 }, 'e.mp4');
  const kb = statSync(join(dir, 'e.mp4')).size / 1024;
  console.log(`  (info) mp4 de 5 s com testsrc: ${kb.toFixed(0)} KB`);
  assert.ok(kb < 1024);
});
