// Roda o ffmpeg DO SISTEMA com os mesmos argumentos da página e valida a saída com ffprobe.
// Valida filtros/codecs/mapeamento; a execução em wasm é coberta por test:e2e.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildMp4Args, isMissingAudioError } from '../../js/export/mp4-args.js';

const dir = resolve('test/.tmp/integration');
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const opts = { skip: !hasFfmpeg && 'ffmpeg não encontrado no PATH' };

const run = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
const probe = (file) =>
  JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());

before(() => {
  if (!hasFfmpeg) return;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // vídeo horizontal 640x360, 8 s, som de 440 Hz
  run(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', join(dir, 'wide.mp4')]);
  // vídeo vertical 360x640 com som
  run(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=25:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', join(dir, 'tall.mp4')]);
  // vídeo SEM som
  run(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', join(dir, 'mute.mp4')]);
  // vídeo transparente (cor escondida vermelha) com som, em .mov/png (preserva alfa)
  run(['-f', 'lavfi', '-i', 'color=c=red@0.0:s=300x200:r=10:d=2,format=rgba', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'png', '-c:a', 'aac', '-shortest', '-y', join(dir, 'transp.mov')]);
});
after(() => rmSync(dir, { recursive: true, force: true }));

const exportWith = (file, clip, out) => {
  run(buildMp4Args({ inputName: join(dir, file), outputName: join(dir, out), clip }));
  return probe(join(dir, out));
};

function assertSquareWithAudio(info, expectedDuration) {
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  assert.ok(v && a, 'deve ter vídeo e som');
  assert.equal(`${v.width}x${v.height}`, '512x512');
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(a.codec_name, 'aac');
  const dur = Number(info.format.duration);
  assert.ok(Math.abs(dur - expectedDuration) < 0.25, `duração ${dur} ≈ ${expectedDuration}`);
}

test('vídeo horizontal → 512x512 com som, 5 s', opts, () => {
  assertSquareWithAudio(exportWith('wide.mp4', { start: 1, duration: 5 }, 'a.mp4'), 5);
});

test('vídeo vertical → 512x512 com som, 3 s', opts, () => {
  assertSquareWithAudio(exportWith('tall.mp4', { start: 0, duration: 3 }, 'b.mp4'), 3);
});

test('o som de saída é o do próprio vídeo (440 Hz)', opts, () => {
  exportWith('wide.mp4', { start: 0, duration: 2 }, 'c.mp4');
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', join(dir, 'c.mp4'), '-f', 's16le', '-ac', '1', '-ar', '44100', '-'], { maxBuffer: 1 << 26 });
  const s = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  let crossings = 0;
  for (let i = 1; i < s.length; i++) if (s[i - 1] < 0 !== s[i] < 0) crossings++;
  const hz = crossings / 2 / (s.length / 44100);
  assert.ok(Math.abs(hz - 440) < 30, `frequência estimada ${hz.toFixed(0)} Hz ≈ 440`);
});

test('vídeo sem som falha com erro reconhecível (som é obrigatório)', opts, () => {
  const r = spawnSync('ffmpeg', ['-hide_banner', ...buildMp4Args({ inputName: join(dir, 'mute.mp4'), outputName: join(dir, 'd.mp4'), clip: { start: 0, duration: 2 } })]);
  assert.notEqual(r.status, 0);
  assert.equal(isMissingAudioError(r.stderr.toString()), true, r.stderr.toString().slice(-400));
});

test('transparência vira fundo branco (não a cor escondida)', opts, () => {
  exportWith('transp.mov', { start: 0, duration: 1 }, 'e.mp4');
  const [r, g, b] = execFileSync('ffmpeg', ['-v', 'error', '-i', join(dir, 'e.mp4'), '-frames:v', '1',
    '-vf', 'crop=w=2:h=2:x=255:y=255,format=rgb24', '-f', 'rawvideo', '-']);
  assert.ok(r > 235 && g > 235 && b > 235, `pixel central deveria ser branco, veio rgb(${r},${g},${b})`);
});

test('tamanho do arquivo é razoável (< 1 MB para 5 s)', opts, () => {
  exportWith('wide.mp4', { start: 0, duration: 5 }, 'f.mp4');
  const kb = statSync(join(dir, 'f.mp4')).size / 1024;
  console.log(`  (info) mp4 de 5 s com testsrc: ${kb.toFixed(0)} KB`);
  assert.ok(kb < 1024);
});
