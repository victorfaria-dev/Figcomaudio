import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CLIP_SECONDS, maxDuration, normalizeClip, formatTime } from '../../js/clip.js';

test('maxDuration: nunca passa de 5 s', () => {
  assert.equal(maxDuration({ visualDuration: 60, audioDuration: 60 }), MAX_CLIP_SECONDS);
});

test('maxDuration: limitado pelo que resta do áudio', () => {
  assert.equal(maxDuration({ visualDuration: 60, audioDuration: 10, audioStart: 8 }), 2);
});

test('maxDuration: limitado pelo que resta do vídeo', () => {
  assert.equal(maxDuration({ visualDuration: 4, visualStart: 1, audioDuration: 60 }), 3);
});

test('maxDuration: imagem (visualDuration=null) só depende do áudio', () => {
  assert.equal(maxDuration({ visualDuration: null, audioDuration: 3 }), 3);
});

test('maxDuration: nunca negativo', () => {
  assert.equal(maxDuration({ visualDuration: 2, visualStart: 5, audioDuration: 60 }), 0);
});

test('normalizeClip: duração acima de 5 vira 5', () => {
  const c = normalizeClip({ visualDuration: 30, audioDuration: 30, duration: 9 });
  assert.equal(c.duration, 5);
  assert.equal(c.valid, true);
});

test('normalizeClip: início negativo ou NaN vira 0', () => {
  const c = normalizeClip({ visualDuration: 30, audioDuration: 30, visualStart: -3, audioStart: NaN });
  assert.equal(c.visualStart, 0);
  assert.equal(c.audioStart, 0);
});

test('normalizeClip: início perto do fim recua para deixar tempo mínimo', () => {
  const c = normalizeClip({ visualDuration: 30, audioDuration: 10, audioStart: 10 });
  assert.equal(c.audioStart, 9.5);
  assert.equal(c.duration, 0.5);
});

test('normalizeClip: duração acompanha o que sobra após mover o início', () => {
  const c = normalizeClip({ visualDuration: 30, audioDuration: 10, audioStart: 8, duration: 5 });
  assert.equal(c.duration, 2);
});

test('normalizeClip: imagem ignora visualStart', () => {
  const c = normalizeClip({ visualDuration: null, audioDuration: 20, visualStart: 7 });
  assert.equal(c.visualStart, 0);
});

test('normalizeClip: mídia mais curta que o mínimo continua utilizável', () => {
  const c = normalizeClip({ visualDuration: null, audioDuration: 0.3 });
  assert.equal(c.audioStart, 0);
  assert.equal(c.duration, 0.3);
  assert.equal(c.valid, true);
});

test('normalizeClip: áudio de duração zero é inválido', () => {
  assert.equal(normalizeClip({ visualDuration: null, audioDuration: 0 }).valid, false);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(65.25), '1:05.3');
  assert.equal(formatTime(-1), '0:00.0');
  // bordas de arredondamento: nunca "60" nos segundos
  assert.equal(formatTime(59.96), '1:00.0');
  assert.equal(formatTime(119.97), '2:00.0');
  assert.equal(formatTime(9.99), '0:10.0');
});
