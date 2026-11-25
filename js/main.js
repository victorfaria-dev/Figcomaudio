// Orquestração da UI. Regras de trecho: clip.js · leitura do vídeo: media.js ·
// ffmpeg: ffmpeg-engine.js · formato de saída: export/ (trocável).
import { MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, formatTime, maxDuration, normalizeClip } from './clip.js';
import { loadVideo } from './media.js';
import { EngineCancelledError, FfmpegEngine } from './ffmpeg-engine.js';
import { defaultExporter } from './export/index.js';

const $ = (id) => document.getElementById(id);
const el = {
  alert: $('alert'),
  videoInput: $('video-input'), videoBox: $('video-box'), videoInfo: $('video-info'),
  clipSection: $('clip-section'), genSection: $('gen-section'),
  start: $('start'), startOut: $('start-out'),
  duration: $('duration'), durationOut: $('duration-out'),
  previewBtn: $('preview-btn'), generateBtn: $('generate-btn'), cancelBtn: $('cancel-btn'),
  progress: $('progress'), status: $('status'),
  resultSection: $('result-section'), resultVideo: $('result-video'),
  resultInfo: $('result-info'), downloadLink: $('download-link'), shareBtn: $('share-btn'),
};

const engine = new FfmpegEngine();
const state = {
  video: null, // { file, url, duration, width, height }
  clip: null,  // { start, duration, valid }
  busy: false,
  resultUrl: null,
  resultFile: null,
};

// ---------- mensagens ----------
function showError(message) {
  el.alert.textContent = message;
  el.alert.hidden = false;
}
const clearError = () => { el.alert.hidden = true; el.alert.textContent = ''; };

// ---------- carregar o vídeo ----------
// O estado SEMPRE reflete o que o campo mostra:
//  - "a última escolha vence" (um carregamento atrasado de uma escolha antiga é descartado);
//  - escolha inválida ou cancelada limpa o estado (nada de arquivo "fantasma").
const VIDEO_HINT = el.videoInfo.textContent;
const VIDEO_PLACEHOLDER = el.videoBox.innerHTML;
let videoReq = 0;

function clearVideo() {
  if (state.video) URL.revokeObjectURL(state.video.url);
  state.video = null;
  el.videoBox.innerHTML = VIDEO_PLACEHOLDER;
  el.videoInfo.textContent = VIDEO_HINT;
}

el.videoInput.addEventListener('change', async () => {
  const req = ++videoReq;
  const file = el.videoInput.files[0];
  clearError();
  stopPreview();
  if (!file) { clearVideo(); return refresh(); }
  try {
    const media = await loadVideo(file);
    if (req !== videoReq) return URL.revokeObjectURL(media.url); // chegou uma escolha mais nova
    clearVideo();
    state.video = { file, ...media };
    renderVideo();
  } catch (e) {
    if (req !== videoReq) return;
    clearVideo();
    el.videoInput.value = '';
    showError(e.message);
  }
  refresh();
});

function renderVideo() {
  const { url, file, duration, width, height } = state.video;
  const v = document.createElement('video');
  v.id = 'video-preview';
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  el.videoBox.replaceChildren(v);
  el.videoInfo.textContent = `${file.name} · ${width}×${height} · ${formatTime(duration)}`;
}

// ---------- trecho ----------
function syncClip() {
  if (!state.video) return;
  const total = state.video.duration;
  const clip = normalizeClip({ videoDuration: total, start: Number(el.start.value), duration: Number(el.duration.value) });
  state.clip = clip;

  el.start.max = Math.max(0, total - MIN_CLIP_SECONDS).toFixed(2);
  el.start.value = clip.start;
  el.startOut.textContent = formatTime(clip.start);

  const max = maxDuration({ videoDuration: total, start: clip.start });
  el.duration.max = String(Math.min(MAX_CLIP_SECONDS, max));
  el.duration.min = String(Math.min(MIN_CLIP_SECONDS, max));
  el.duration.value = clip.duration;
  el.durationOut.textContent = `${clip.duration.toFixed(1)} s`;
}

for (const input of [el.start, el.duration]) {
  input.addEventListener('input', () => { stopPreview(); syncClip(); });
}

// ---------- ver e ouvir o trecho (com o som do vídeo) ----------
let previewRaf = 0;
const isPreviewing = () => previewRaf !== 0;

function stopPreview() {
  cancelAnimationFrame(previewRaf);
  previewRaf = 0;
  $('video-preview')?.pause();
  el.previewBtn.textContent = '▶ Ver e ouvir o trecho';
}

function startPreview() {
  const c = state.clip;
  const v = $('video-preview');
  if (!c?.valid || !v) return;
  v.muted = false;
  v.currentTime = c.start;
  v.play().catch((e) => { stopPreview(); showError(`Não foi possível tocar a pré-visualização: ${e.message}`); });
  el.previewBtn.textContent = '■ Parar';
  const end = c.start + c.duration;
  const tick = () => {
    if (v.currentTime >= end || v.ended) return stopPreview();
    previewRaf = requestAnimationFrame(tick);
  };
  previewRaf = requestAnimationFrame(tick);
}

el.previewBtn.addEventListener('click', () => (isPreviewing() ? stopPreview() : startPreview()));

// ---------- gerar ----------
function setBusy(busy) {
  state.busy = busy;
  el.videoInput.disabled = busy;
  refresh();
}

function refresh() {
  const ready = Boolean(state.video);
  el.clipSection.classList.toggle('disabled', !ready || state.busy);
  el.genSection.classList.toggle('disabled', !ready);
  if (ready) syncClip();
  else state.clip = null;
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
      el.status.textContent = 'Carregando o gerador (≈31 MB, só na primeira vez)…';
      el.progress.removeAttribute('value'); // indeterminado
      await engine.load();
      el.progress.value = 0;
    }
    el.status.textContent = 'Gerando a figurinha… (pode levar alguns segundos)';
    el.cancelBtn.hidden = false;
    const t0 = performance.now();
    const out = await exporter.export({
      engine,
      video: { file: state.video.file },
      clip,
      onProgress: (p) => { el.progress.value = p; },
    });
    showResult(out, clip, (performance.now() - t0) / 1000);
  } catch (e) {
    if (e instanceof EngineCancelledError) {
      el.status.textContent = 'Cancelado.';
    } else {
      showError(e.name === 'MissingAudioError' ? e.message : `Falha ao gerar: ${e.message}`);
      el.status.textContent = '';
    }
  } finally {
    el.cancelBtn.hidden = true;
    el.progress.hidden = true;
    setBusy(false);
  }
});

el.cancelBtn.addEventListener('click', () => engine.cancel());

el.shareBtn.addEventListener('click', async () => {
  if (!state.resultFile) return;
  try {
    await navigator.share({ files: [state.resultFile], title: 'Figurinha' });
  } catch (e) {
    if (e.name !== 'AbortError') showError(`Não foi possível compartilhar: ${e.message}. Use “Baixar”.`);
  }
});

function showResult({ blob, filename }, clip, seconds) {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);
  el.resultVideo.src = state.resultUrl;
  el.downloadLink.href = state.resultUrl;
  el.downloadLink.download = filename;
  // Web Share com arquivos: no celular abre a folha de compartilhar ("Salvar vídeo", WhatsApp...).
  state.resultFile = new File([blob], filename, { type: blob.type || 'video/mp4' });
  el.shareBtn.hidden = !(navigator.canShare?.({ files: [state.resultFile] }));
  const kb = blob.size / 1024;
  el.resultInfo.textContent =
    `512×512 · ${clip.duration.toFixed(1)} s · ${kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(0) + ' KB'} · gerado em ${seconds.toFixed(1)} s`;
  el.status.textContent = 'Pronto.';
  el.resultSection.hidden = false;
  el.resultSection.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

refresh();
