// Leitura de arquivos escolhidos pelo usuário: tipo, validação e metadados (duração/dimensões).
// Usa elementos HTML nativos; nada é enviado para fora do navegador.

export const MAX_INPUT_BYTES = 200 * 1024 * 1024; // ffmpeg.wasm roda em memória do navegador (README R4)

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif|avif)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i;

/** @returns {'video'|'image'|null} */
export function classifyVisual(file) {
  if (file.type.startsWith('video/') || (!file.type && VIDEO_EXT.test(file.name))) return 'video';
  if (file.type.startsWith('image/') || (!file.type && IMAGE_EXT.test(file.name))) return 'image';
  return null;
}

export function isAudio(file) {
  return file.type.startsWith('audio/') || (!file.type && AUDIO_EXT.test(file.name));
}

export function checkSize(file) {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`"${file.name}" tem ${(file.size / 1048576).toFixed(0)} MB; o limite é ${MAX_INPUT_BYTES / 1048576} MB.`);
  }
}

function waitFor(el, okEvent, what) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tempo esgotado ao ler ${what}.`)), 15000);
    el.addEventListener(okEvent, () => { clearTimeout(timer); resolve(); }, { once: true });
    el.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`O navegador não conseguiu ler ${what}.`)); }, { once: true });
  });
}

/**
 * Valida o arquivo e lê metadados.
 * @returns {Promise<{kind:'video'|'image', url:string, duration:number|null, width:number, height:number}>}
 */
export async function loadVisual(file) {
  const kind = classifyVisual(file);
  if (!kind) throw new Error('Escolha um vídeo ou uma imagem.');
  checkSize(file);
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'image') {
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => { throw new Error('O navegador não conseguiu ler a imagem.'); });
      return { kind, url, duration: null, width: img.naturalWidth, height: img.naturalHeight };
    }
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = url;
    await waitFor(v, 'loadedmetadata', 'o vídeo');
    if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error('Não foi possível descobrir a duração do vídeo.');
    return { kind, url, duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** @returns {Promise<{url:string, duration:number}>} */
export async function loadAudio(file) {
  if (!isAudio(file)) throw new Error('Escolha um arquivo de áudio.');
  checkSize(file);
  const url = URL.createObjectURL(file);
  try {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.src = url;
    await waitFor(a, 'loadedmetadata', 'o áudio');
    if (!Number.isFinite(a.duration) || a.duration <= 0) throw new Error('Não foi possível descobrir a duração do áudio.');
    return { url, duration: a.duration };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
