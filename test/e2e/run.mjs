// E2E em navegador real: sobe o servidor estático, usa a UI de verdade e valida o mp4 baixado.
// Requer: Playwright disponível (require('playwright')) e ffmpeg/ffprobe no PATH para criar/inspecionar mídia.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from '../../scripts/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const dir = resolve('test/.tmp/e2e');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
// Chromium de teste não decodifica H.264/AAC: entradas em VP8/Opus/WebM.
ff('-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=8',
  '-c:v', 'libvpx', '-b:v', '300k', '-c:a', 'libopus', '-shortest', join(dir, 'clip.webm'));
ff('-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=4', '-c:v', 'libvpx', '-b:v', '200k', join(dir, 'mute.webm'));
ff('-f', 'lavfi', '-i', 'testsrc=size=200x200:rate=1:duration=1', '-frames:v', '1', join(dir, 'pic.png'));
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
const setRange = (sel, v) => page.$eval(sel, (e, val) => { e.value = val; e.dispatchEvent(new Event('input')); }, String(v));

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
  assert.ok(v && a, 'vídeo e som presentes');
  assert.equal(`${v.width}x${v.height}`, '512x512');
  assert.equal(v.codec_name, 'h264');
  assert.equal(a.codec_name, 'aac');
  assert.ok(Math.abs(Number(info.format.duration) - seconds) < 0.3, `duração ${info.format.duration} ≈ ${seconds}`);
}

await page.goto(base);

await scenario('estado inicial: só um campo (vídeo), gerar desabilitado', async () => {
  assert.equal(await page.$$eval('input[type=file]', (l) => l.length), 1);
  assert.equal(await page.getAttribute('#video-input', 'accept'), 'video/*');
  assert.equal(await page.isDisabled('#generate-btn'), true);
});

await scenario('rejeita arquivo que não é vídeo', async () => {
  await page.setInputFiles('#video-input', join(dir, 'pic.png'));
  await page.waitForSelector('#alert:not([hidden])');
  assert.match(await page.textContent('#alert'), /vídeo/i);
});

await scenario('sliders: duração máx. 5 s e acompanha o início', async () => {
  await page.setInputFiles('#video-input', join(dir, 'clip.webm'));
  await page.waitForFunction(() => !document.querySelector('#generate-btn').disabled);
  assert.equal(await page.inputValue('#duration'), '5');
  await setRange('#start', 6.5);
  assert.equal(await page.inputValue('#duration'), '1.5');
  await setRange('#start', 2);
  await setRange('#duration', 3);
  assert.equal(await page.inputValue('#duration'), '3');
});

await scenario('gera mp4 512x512 de 3 s com o som do próprio vídeo (ffmpeg.wasm real)', async () => {
  const { info, text } = await generateAndDownload('video.mp4');
  checkSquareWithAudio(info, 3);
  console.log(`       resultado: ${text}`);
});

await scenario('vídeo sem som: erro claro, sem resultado', async () => {
  await page.setInputFiles('#video-input', join(dir, 'mute.webm'));
  await page.waitForFunction(() => !document.querySelector('#generate-btn').disabled);
  await page.click('#generate-btn');
  await page.waitForSelector('#alert:not([hidden])', { timeout: 60000 });
  assert.match(await page.textContent('#alert'), /não tem som/);
  assert.equal(await page.isHidden('#result-section'), true);
  await page.setInputFiles('#video-input', join(dir, 'clip.webm'));
  await page.waitForFunction(() => !document.querySelector('#generate-btn').disabled);
});

await scenario('compartilhar: oculto sem suporte; com suporte envia o mp4', async () => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async ({ files }) => { window.__shared = `${files[0].name}|${files[0].type}|${files[0].size}`; },
    });
  });
  await setRange('#duration', 1);
  await generateAndDownload('share.mp4');
  await page.click('#share-btn');
  assert.match(await page.evaluate(() => window.__shared), /^figurinha\.mp4\|video\/mp4\|[1-9]\d+$/);
});

await scenario('cancelar no meio da geração para e permite gerar de novo', async () => {
  await setRange('#duration', 5);
  await setRange('#start', 0);
  await page.click('#generate-btn');
  await page.waitForSelector('#cancel-btn:not([hidden])', { timeout: 60000 });
  await page.click('#cancel-btn');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Cancelado.', null, { timeout: 15000 });
  assert.equal(await page.isHidden('#alert'), true, 'cancelar não é erro');
  await setRange('#duration', 1);
  const { info } = await generateAndDownload('after-cancel.mp4');
  checkSquareWithAudio(info, 1);
});

await scenario('timeout do motor gera erro claro e descarta a instância', async () => {
  const r = await page.evaluate(async () => {
    const { FfmpegEngine } = await import('/js/ffmpeg-engine.js');
    const eng = new FfmpegEngine();
    const vid = await (await fetch('/test/.tmp/e2e/clip.webm')).blob();
    const args = ['-i', eng.inputPath('v.webm'), '-c:v', 'libx264', '-c:a', 'aac', '-y', 'o.mp4'];
    try {
      await eng.run({ inputs: { 'v.webm': vid }, args, outputName: 'o.mp4', timeoutMs: 50 });
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

await scenario('duas escolhas seguidas: vence a última', async () => {
  const toB64 = (p) => readFileSync(p).toString('base64');
  await page.evaluate(([a, b]) => {
    const mk = (b64, name) => new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'video/webm' });
    const input = document.getElementById('video-input');
    for (const f of [mk(a, 'clip.webm'), mk(b, 'mute.webm')]) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    }
  }, [toB64(join(dir, 'clip.webm')), toB64(join(dir, 'mute.webm'))]);
  await page.waitForTimeout(2500);
  assert.match(await page.textContent('#video-info'), /mute\.webm/);
});

await scenario('escolha inválida limpa o estado (sem arquivo "fantasma")', async () => {
  await page.setInputFiles('#video-input', join(dir, 'pic.png'));
  await page.waitForSelector('#alert:not([hidden])');
  assert.equal(await page.$('#video-preview'), null, 'prévia antiga deve sumir');
  assert.doesNotMatch(await page.textContent('#video-info'), /mute\.webm/);
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
