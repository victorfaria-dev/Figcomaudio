// Leitura do vídeo escolhido: tipo, tamanho e metadados (duração/dimensões).
// Usa o <video> nativo; nada é enviado para fora do navegador.

export const MAX_INPUT_BYTES = 200 * 1024 * 1024; // ffmpeg.wasm roda no navegador (README R4)

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i;

export function isVideo(file) {
  return file.type.startsWith('video/') || (!file.type && VIDEO_EXT.test(file.name));
}

export function checkSize(file) {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`"${file.name}" tem ${(file.size / 1048576).toFixed(0)} MB; o limite é ${MAX_INPUT_BYTES / 1048576} MB.`);
  }
}

/** @returns {Promise<{url:string, duration:number, width:number, height:number}>} */
export async function loadVideo(file) {
  if (!isVideo(file)) throw new Error('Escolha um vídeo (com som).');
  checkSize(file);
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = url;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tempo esgotado ao ler o vídeo.')), 15000);
      v.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(timer); reject(new Error('O navegador não conseguiu ler esse vídeo.')); }, { once: true });
    });
    if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error('Não foi possível descobrir a duração do vídeo.');
    return { url, duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
