import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultExporter, getExporter, listAvailableExporters, ExportNotSupportedError, MissingAudioError } from '../../js/export/index.js';

const fakeEngine = (runImpl) => {
  const calls = [];
  return {
    calls,
    lastLog: '',
    inputPath: (name) => `/input/${name}`,
    async run(job) {
      calls.push(job);
      if (runImpl) return runImpl(job);
      return new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    },
  };
};

const video = { file: new File([new Uint8Array(10)], 'Meu Vídeo.MOV') };
const clip = { start: 0, duration: 3 };

test('exportador padrão é o mp4 quadrado e todo disponível respeita o contrato', () => {
  assert.equal(defaultExporter().id, 'mp4-square');
  for (const e of listAvailableExporters()) {
    assert.equal(typeof e.id, 'string');
    assert.equal(typeof e.export, 'function');
  }
});

test('mp4-square: passa só o vídeo (sem copiar bytes) e devolve {blob, filename, mime}', async () => {
  const engine = fakeEngine();
  const out = await getExporter('mp4-square').export({ engine, video, clip });
  const [job] = engine.calls;
  assert.deepEqual(Object.keys(job.inputs), ['video.mov']);
  assert.equal(job.inputs['video.mov'], video.file);
  assert.ok(job.args.includes('/input/video.mov'));
  assert.equal(out.mime, 'video/mp4');
  assert.equal(out.filename, 'figurinha.mp4');
  assert.equal(out.blob.size, 8);
});

test('mp4-square: vídeo sem som vira MissingAudioError (mensagem clara)', async () => {
  const engine = fakeEngine(() => { throw new Error("ffmpeg terminou com código 1.\nStream map '0:a:0' matches no streams."); });
  await assert.rejects(() => getExporter('mp4-square').export({ engine, video, clip }), MissingAudioError);
});

test('mp4-square: outros erros passam adiante sem disfarce', async () => {
  const engine = fakeEngine(() => { throw new Error('boom'); });
  await assert.rejects(() => getExporter('mp4-square').export({ engine, video, clip }), /boom/);
});

test('sticker-pack: indisponível e recusa explicitamente', async () => {
  const e = getExporter('sticker-pack');
  assert.equal(e.available, false);
  await assert.rejects(() => e.export({}), ExportNotSupportedError);
});

test('getExporter com id desconhecido falha', () => {
  assert.throws(() => getExporter('nope'));
});
