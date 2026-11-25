// E2E em navegador real: sobe o servidor estático, usa a UI de verdade e valida o mp4 baixado.
// Requer: Playwright disponível (require('playwright')) e ffmpeg/ffprobe no PATH para criar/inspecionar mídia.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from '../../scripts/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const dir = resolve('test/.tmp/e2e');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
// Chromium de teste não decodifica H.264/AAC: entradas em VP8/Opus/WebM e PNG.
ff('-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=8', '-c:v', 'libvpx', '-b:v', '300k', join(dir, 'clip.webm'));
ff('-f', 'lavfi', '-i', 'sine=frequency=660:duration=10', '-c:a', 'libopus', join(dir, 'tone.ogg'));
ff('-f', 'lavfi', '-i', 'testsrc=size=500x333:rate=1:duration=1', '-frames:v', '1', join(dir, 'pic.png'));
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());

const server = await startServer({ port: 0 });
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // celular
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

let failed = false;
async function scenario(name, fn) {
  try { await fn(); console.log(`ok   - ${name}`); }
  catch (e) { failed = true; console.error(`FAIL - ${name}\n${e.stack}`); }
}

async function generateAndDownload(outName) {
  await page.click('#generate-btn');
  await page.waitForSelector('#result-section:not([hidden])', { timeout: 180000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download-link')]);
  const out = join(dir, outName);
  await dl.saveAs(out);
  return { out, info: probe(out), text: await page.textContent('#result-info') };
}

function checkSquareWithAudio(info, seconds) {
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  assert.ok(v && a, 'vídeo e áudio presentes');
  assert.equal(`${v.width}x${v.height}`, '512x512');
  assert.equal(v.codec_name, 'h264');
  assert.equal(a.codec_name, 'aac');
  assert.ok(Math.abs(Number(info.format.duration) - seconds) < 0.3, `duração ${info.format.duration} ≈ ${seconds}`);
}

await page.goto(base);

await scenario('estado inicial: gerar desabilitado, trecho bloqueado', async () => {
  assert.equal(await page.isDisabled('#generate-btn'), true);
  assert.match(await page.getAttribute('#clip-section', 'class'), /disabled/);
});

await scenario('rejeita arquivo que não é áudio no campo de áudio', async () => {
  await page.setInputFiles('#audio-input', join(dir, 'pic.png'));
  await page.waitForSelector('#alert:not([hidden])');
  assert.match(await page.textContent('#alert'), /áudio/i);
});

await scenario('vídeo + áudio: sliders refletem limites e duração máx. 5 s', async () => {
  await page.setInputFiles('#visual-input', join(dir, 'clip.webm'));
  await page.setInputFiles('#audio-input', join(dir, 'tone.ogg'));
  await page.waitForFunction(() => !document.querySelector('#generate-btn').disabled);
  assert.equal(await page.inputValue('#duration'), '5');
  // mover o início do áudio para perto do fim reduz a duração possível
  await page.$eval('#audio-start', (e) => { e.value = '8.5'; e.dispatchEvent(new Event('input')); });
  assert.equal(await page.inputValue('#duration'), '1.5');
  await page.$eval('#audio-start', (e) => { e.value = '2'; e.dispatchEvent(new Event('input')); });
  await page.$eval('#duration', (e) => { e.value = '3'; e.dispatchEvent(new Event('input')); });
  await page.$eval('#visual-start', (e) => { e.value = '1'; e.dispatchEvent(new Event('input')); });
  assert.equal(await page.inputValue('#duration'), '3');
});

await scenario('gera mp4 512x512 de 3 s com áudio a partir de vídeo (ffmpeg.wasm real)', async () => {
  const { info, text } = await generateAndDownload('video.mp4');
  checkSquareWithAudio(info, 3);
  console.log(`       resultado: ${text}`);
});

await scenario('imagem + áudio → mp4 512x512 de 2 s', async () => {
  await page.setInputFiles('#visual-input', join(dir, 'pic.png'));
  await page.waitForFunction(() => document.querySelector('#visual-start-row').hidden);
  await page.$eval('#duration', (e) => { e.value = '2'; e.dispatchEvent(new Event('input')); });
  const { info } = await generateAndDownload('image.mp4');
  checkSquareWithAudio(info, 2);
});

await scenario('cancelar no meio da geração para e permite gerar de novo', async () => {
  await page.$eval('#duration', (e) => { e.value = '5'; e.dispatchEvent(new Event('input')); });
  await page.click('#generate-btn');
  await page.waitForSelector('#cancel-btn:not([hidden])', { timeout: 60000 });
  await page.click('#cancel-btn');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Cancelado.', null, { timeout: 15000 });
  assert.equal(await page.isHidden('#alert'), true, 'cancelar não é erro');
  assert.equal(await page.isDisabled('#generate-btn'), false);
  // o motor foi descartado; a próxima geração recarrega e funciona
  await page.$eval('#duration', (e) => { e.value = '1'; e.dispatchEvent(new Event('input')); });
  const { info } = await generateAndDownload('after-cancel.mp4');
  checkSquareWithAudio(info, 1);
});

await scenario('timeout do motor gera erro claro e descarta a instância', async () => {
  const r = await page.evaluate(async () => {
    const { FfmpegEngine } = await import('/js/ffmpeg-engine.js');
    const eng = new FfmpegEngine();
    const pic = await (await fetch('/test/.tmp/e2e/pic.png')).blob();
    const tone = await (await fetch('/test/.tmp/e2e/tone.ogg')).blob();
    const args = ['-loop', '1', '-t', '5', '-i', eng.inputPath('v.png'), '-i', eng.inputPath('a.ogg'),
      '-c:v', 'libx264', '-shortest', '-y', 'o.mp4'];
    try {
      await eng.run({ inputs: { 'v.png': pic, 'a.ogg': tone }, args, outputName: 'o.mp4', timeoutMs: 50 });
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e.message, loaded: eng.loaded };
    } finally {
      eng.dispose();
    }
  });
  assert.equal(r.ok, false);
  assert.match(r.msg, /Tempo esgotado/);
  assert.equal(r.loaded, false);
});

await scenario('corrida: vídeo (lento) e logo depois imagem (rápida) → vence a última escolha', async () => {
  await page.evaluate(() => {
    // dispara as duas escolhas sem esperar a primeira terminar de carregar
    window.__pick = (input, files) => {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    };
  });
  const toFile = async (path, name, type) => {
    const b64 = (await import('node:fs')).readFileSync(path).toString('base64');
    return { b64, name, type };
  };
  const vid = await toFile(join(dir, 'clip.webm'), 'clip.webm', 'video/webm');
  const pic = await toFile(join(dir, 'pic.png'), 'pic.png', 'image/png');
  await page.evaluate(([v, p]) => {
    const mk = (o) => new File([Uint8Array.from(atob(o.b64), (c) => c.charCodeAt(0))], o.name, { type: o.type });
    const input = document.getElementById('visual-input');
    window.__pick(input, [mk(v)]);
    window.__pick(input, [mk(p)]);
  }, [vid, pic]);
  await page.waitForTimeout(2500); // tempo de sobra para o vídeo (mais lento) terminar de carregar
  assert.match(await page.textContent('#visual-info'), /pic\.png/);
  assert.equal(await page.$eval('#visual-preview', (e) => e.tagName), 'IMG');
  assert.equal(await page.isHidden('#visual-start-row'), true);
});

await scenario('escolha inválida limpa o estado (sem arquivo "fantasma")', async () => {
  await page.setInputFiles('#visual-input', join(dir, 'tone.ogg')); // áudio no campo de imagem
  await page.waitForSelector('#alert:not([hidden])');
  assert.equal(await page.$('#visual-preview'), null, 'prévia antiga deve sumir');
  assert.doesNotMatch(await page.textContent('#visual-info'), /pic\.png/);
  assert.equal(await page.isDisabled('#generate-btn'), true);
});

await page.screenshot({ path: join(dir, 'final.png'), fullPage: true });
if (problems.length) {
  failed = true;
  console.error('FAIL - erros de página/console inesperados:\n  ' + problems.join('\n  '));
}
await browser.close();
server.close();
if (failed) process.exit(1);
console.log('E2E concluído.');
