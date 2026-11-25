// Orquestração da UI. Regras de trecho: clip.js · leitura de mídia: media.js ·
// ffmpeg: ffmpeg-engine.js · formato de saída: export/ (trocável).
import { MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, formatTime, maxDuration, normalizeClip } from './clip.js';
import { loadAudio, loadVisual } from './media.js';
import { FfmpegEngine } from './ffmpeg-engine.js';
import { defaultExporter } from './export/index.js';

const $ = (id) => document.getElementById(id);
const el = {
  alert: $('alert'),
  visualInput: $('visual-input'), audioInput: $('audio-input'),
  visualBox: $('visual-box'), visualInfo: $('visual-info'),
  audioPlayer: $('audio-player'), audioInfo: $('audio-info'),
  clipSection: $('clip-section'), genSection: $('gen-section'),
  visualStartRow: $('visual-start-row'),
  visualStart: $('visual-start'), visualStartOut: $('visual-start-out'),
  audioStart: $('audio-start'), audioStartOut: $('audio-start-out'),
  duration: $('duration'), durationOut: $('duration-out'),
  previewBtn: $('preview-btn'), generateBtn: $('generate-btn'),
  progress: $('progress'), status: $('status'),
  resultSection: $('result-section'), resultVideo: $('result-video'),
  resultInfo: $('result-info'), downloadLink: $('download-link'),
};

const engine = new FfmpegEngine();
const state = {
  visual: null, // { file, kind, url, duration, width, height }
  audio: null,  // { file, url, duration }
  clip: null,   // { visualStart, audioStart, duration, valid }
  busy: false,
  resultUrl: null,
};

// ---------- mensagens ----------
function showError(message) {
  el.alert.textContent = message;
  el.alert.hidden = false;
}
const clearError = () => { el.alert.hidden = true; el.alert.textContent = ''; };

// ---------- carregar arquivos ----------
el.visualInput.addEventListener('change', async () => {
  const file = el.visualInput.files[0];
  if (!file) return;
  clearError();
  stopPreview();
  try {
    const media = await loadVisual(file);
    if (state.visual) URL.revokeObjectURL(state.visual.url);
    state.visual = { file, ...media };
    renderVisual();
  } catch (e) {
    el.visualInput.value = '';
    showError(e.message);
  }
  refresh();
});

el.audioInput.addEventListener('change', async () => {
  const file = el.audioInput.files[0];
  if (!file) return;
  clearError();
  stopPreview();
  try {
    const media = await loadAudio(file);
    if (state.audio) URL.revokeObjectURL(state.audio.url);
    state.audio = { file, ...media };
    el.audioPlayer.src = state.audio.url;
    el.audioPlayer.hidden = false;
    el.audioInfo.textContent = `${file.name} · ${formatTime(media.duration)}`;
  } catch (e) {
    el.audioInput.value = '';
    showError(e.message);
  }
  refresh();
});

function renderVisual() {
  const { kind, url, file, duration, width, height } = state.visual;
  el.visualBox.replaceChildren();
  let node;
  if (kind === 'image') {
    node = new Image();
    node.alt = 'Pré-visualização da imagem';
  } else {
    node = document.createElement('video');
    node.muted = true;
    node.playsInline = true;
    node.preload = 'auto';
  }
  node.src = url;
  node.id = 'visual-preview';
  el.visualBox.append(node);
  el.visualInfo.textContent =
    `${file.name} · ${width}×${height}` + (kind === 'video' ? ` · ${formatTime(duration)}` : ' · imagem');
}

// ---------- trecho ----------
function readSliders() {
  return {
    visualStart: Number(el.visualStart.value),
    audioStart: Number(el.audioStart.value),
    duration: Number(el.duration.value),
  };
}

/** Normaliza os sliders contra as durações reais e atualiza limites/rótulos. */
function syncClip() {
  if (!state.audio) return;
  const vDur = state.visual?.kind === 'video' ? state.visual.duration : null;
  const clip = normalizeClip({ visualDuration: vDur, audioDuration: state.audio.duration, ...readSliders() });
  state.clip = clip;

  const aMax = Math.max(0, state.audio.duration - MIN_CLIP_SECONDS);
  el.audioStart.max = aMax.toFixed(2);
  el.audioStart.value = clip.audioStart;
  el.audioStartOut.textContent = formatTime(clip.audioStart);

  const isVideo = vDur !== null;
  el.visualStartRow.hidden = !isVideo;
  if (isVideo) {
    el.visualStart.max = Math.max(0, vDur - MIN_CLIP_SECONDS).toFixed(2);
    el.visualStart.value = clip.visualStart;
    el.visualStartOut.textContent = formatTime(clip.visualStart);
  }

  const max = maxDuration({ visualDuration: vDur, visualStart: clip.visualStart, audioDuration: state.audio.duration, audioStart: clip.audioStart });
  el.duration.max = String(Math.min(MAX_CLIP_SECONDS, max));
  el.duration.min = String(Math.min(MIN_CLIP_SECONDS, max));
  el.duration.value = clip.duration;
  el.durationOut.textContent = `${clip.duration.toFixed(1)} s`;
}

for (const input of [el.visualStart, el.audioStart, el.duration]) {
  input.addEventListener('input', () => { stopPreview(); syncClip(); });
}

// ---------- pré-ouvir o trecho (vídeo/imagem + áudio sincronizados) ----------
let previewRaf = 0;
const isPreviewing = () => previewRaf !== 0;

function stopPreview() {
  cancelAnimationFrame(previewRaf);
  previewRaf = 0;
  el.audioPlayer.pause();
  $('visual-preview')?.pause?.();
  el.previewBtn.textContent = '▶ Pré-ouvir trecho';
}

function startPreview() {
  const c = state.clip;
  if (!c?.valid) return;
  const video = state.visual?.kind === 'video' ? $('visual-preview') : null;
  el.audioPlayer.currentTime = c.audioStart;
  if (video) video.currentTime = c.visualStart;
  const plays = [el.audioPlayer.play()];
  if (video) plays.push(video.play());
  Promise.all(plays).catch((e) => { stopPreview(); showError(`Não foi possível tocar a pré-visualização: ${e.message}`); });
  el.previewBtn.textContent = '■ Parar';
  const end = c.audioStart + c.duration;
  const tick = () => {
    if (el.audioPlayer.currentTime >= end || el.audioPlayer.ended) return stopPreview();
    previewRaf = requestAnimationFrame(tick);
  };
  previewRaf = requestAnimationFrame(tick);
}

el.previewBtn.addEventListener('click', () => (isPreviewing() ? stopPreview() : startPreview()));

// ---------- gerar ----------
function setBusy(busy) {
  state.busy = busy;
  el.visualInput.disabled = el.audioInput.disabled = busy;
  refresh();
}

function refresh() {
  const ready = Boolean(state.visual && state.audio);
  el.clipSection.classList.toggle('disabled', !ready || state.busy);
  el.genSection.classList.toggle('disabled', !ready);
  if (ready) syncClip();
  el.generateBtn.disabled = !ready || state.busy || !state.clip?.valid;
}

el.generateBtn.addEventListener('click', async () => {
  if (state.busy) return;
  clearError();
  stopPreview();
  const clip = { ...state.clip }; // congela o trecho durante a geração
  el.resultSection.hidden = true; // não deixa resultado antigo à vista durante a nova geração
  el.resultVideo.pause();
  const exporter = defaultExporter();
  setBusy(true);
  el.progress.hidden = false;
  el.progress.value = 0;
  try {
    if (!engine.loaded) {
      el.status.textContent = 'Carregando o ffmpeg.wasm (≈31 MB, só na primeira vez)…';
      el.progress.removeAttribute('value'); // indeterminado
      await engine.load();
      el.progress.value = 0;
    }
    el.status.textContent = 'Gerando o mp4… (pode levar alguns segundos)';
    const t0 = performance.now();
    const out = await exporter.export({
      engine,
      visual: { kind: state.visual.kind, file: state.visual.file },
      audio: { file: state.audio.file },
      clip,
      onProgress: (p) => { el.progress.value = p; },
    });
    showResult(out, clip, (performance.now() - t0) / 1000);
  } catch (e) {
    showError(`Falha ao gerar: ${e.message}`);
    el.status.textContent = '';
  } finally {
    el.progress.hidden = true;
    setBusy(false);
  }
});

function showResult({ blob, filename }, clip, seconds) {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);
  el.resultVideo.src = state.resultUrl;
  el.downloadLink.href = state.resultUrl;
  el.downloadLink.download = filename;
  const kb = blob.size / 1024;
  el.resultInfo.textContent =
    `512×512 · ${clip.duration.toFixed(1)} s · ${kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(0) + ' KB'} · gerado em ${seconds.toFixed(1)} s`;
  el.status.textContent = 'Pronto.';
  el.resultSection.hidden = false;
  el.resultSection.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

refresh();
