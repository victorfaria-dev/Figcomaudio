import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CLIP_SECONDS, maxDuration, normalizeClip, formatTime } from '../../js/clip.js';

test('maxDuration: nunca passa de 5 s', () => {
  assert.equal(maxDuration({ videoDuration: 60 }), MAX_CLIP_SECONDS);
});

test('maxDuration: limitado pelo que resta do vídeo', () => {
  assert.equal(maxDuration({ videoDuration: 4, start: 1 }), 3);
});

test('maxDuration: nunca negativo', () => {
  assert.equal(maxDuration({ videoDuration: 2, start: 5 }), 0);
});

test('normalizeClip: duração acima de 5 vira 5', () => {
  const c = normalizeClip({ videoDuration: 30, duration: 9 });
  assert.equal(c.duration, 5);
  assert.equal(c.valid, true);
});

test('normalizeClip: início negativo ou NaN vira 0', () => {
  assert.equal(normalizeClip({ videoDuration: 30, start: -3 }).start, 0);
  assert.equal(normalizeClip({ videoDuration: 30, start: NaN }).start, 0);
});

test('normalizeClip: início perto do fim recua para deixar tempo mínimo', () => {
  const c = normalizeClip({ videoDuration: 10, start: 10 });
  assert.equal(c.start, 9.5);
  assert.equal(c.duration, 0.5);
});

test('normalizeClip: duração acompanha o que sobra após mover o início', () => {
  assert.equal(normalizeClip({ videoDuration: 10, start: 8, duration: 5 }).duration, 2);
});

test('normalizeClip: vídeo mais curto que o mínimo continua utilizável', () => {
  const c = normalizeClip({ videoDuration: 0.3 });
  assert.equal(c.start, 0);
  assert.equal(c.duration, 0.3);
  assert.equal(c.valid, true);
});

test('normalizeClip: vídeo de duração zero ou inválida é inválido', () => {
  assert.equal(normalizeClip({ videoDuration: 0 }).valid, false);
  assert.equal(normalizeClip({ videoDuration: NaN }).valid, false);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(65.25), '1:05.3');
  assert.equal(formatTime(-1), '0:00.0');
  assert.equal(formatTime(59.96), '1:00.0');
  assert.equal(formatTime(119.97), '2:00.0');
  assert.equal(formatTime(9.99), '0:10.0');
});
