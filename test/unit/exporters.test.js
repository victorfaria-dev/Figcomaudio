import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultExporter, getExporter, listAvailableExporters, ExportNotSupportedError } from '../../js/export/index.js';

const fakeEngine = () => {
  const calls = [];
  return {
    calls,
    inputPath: (name) => `/input/${name}`,
    async run(job) {
      calls.push(job);
      return new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    },
  };
};

test('exportador padrão é o mp4 quadrado e todo disponível respeita o contrato', () => {
  assert.equal(defaultExporter().id, 'mp4-square');
  for (const e of listAvailableExporters()) {
    assert.equal(typeof e.id, 'string');
    assert.equal(typeof e.label, 'string');
    assert.equal(typeof e.export, 'function');
  }
});

test('mp4-square: monta job para o motor e devolve {blob, filename, mime}', async () => {
  const engine = fakeEngine();
  const visual = { kind: 'video', file: new File([new Uint8Array(10)], 'Meu Vídeo.MOV') };
  const audio = { file: new File([new Uint8Array(5)], 'som.ogg') };
  const clip = { visualStart: 0, audioStart: 2, duration: 3 };

  const out = await getExporter('mp4-square').export({ engine, visual, audio, clip });

  const [job] = engine.calls;
  assert.deepEqual(Object.keys(job.inputs).sort(), ['audio.ogg', 'visual.mov']);
  assert.equal(job.inputs['visual.mov'], visual.file, 'passa o próprio File, sem copiar bytes');
  assert.equal(job.outputName, 'out.mp4');
  assert.ok(job.args.includes('/input/visual.mov') && job.args.includes('/input/audio.ogg'));
  assert.equal(out.mime, 'video/mp4');
  assert.equal(out.filename, 'figcomaudio.mp4');
  assert.ok(out.blob instanceof Blob && out.blob.size === 8);
});

test('sticker-pack: indisponível e recusa explicitamente', async () => {
  const e = getExporter('sticker-pack');
  assert.equal(e.available, false);
  await assert.rejects(() => e.export({}), ExportNotSupportedError);
});

test('getExporter com id desconhecido falha', () => {
  assert.throws(() => getExporter('nope'));
});
