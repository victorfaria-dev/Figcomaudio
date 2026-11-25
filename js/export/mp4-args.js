// Monta os argumentos do ffmpeg para o mp4 quadrado. Puro: sem DOM, sem wasm.
// Os mesmos argumentos são usados no navegador (ffmpeg.wasm) e nos testes (ffmpeg do sistema).

export const OUTPUT_SIZE = 512;
export const OUTPUT_FPS = 30;
/** Cor que aparece onde o vídeo é transparente (mp4/H.264 não tem canal alfa). */
export const BACKGROUND_COLOR = 'white';

/** Extensão segura (a..z0..9, até 5 chars) para nomear arquivos no sistema de arquivos virtual. */
export function safeExt(filename, fallback = 'bin') {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : fallback;
}

const sec = (n) => String(Math.round(n * 1000) / 1000);

/**
 * Vídeo e som vêm do MESMO arquivo. Se o vídeo não tiver som, o ffmpeg falha com
 * "matches no streams" (o som é obrigatório: é o objetivo da figurinha).
 *
 * @param {object} o
 * @param {string} o.inputName    caminho do vídeo no FS virtual
 * @param {string} o.outputName   caminho de saída (.mp4)
 * @param {{start:number, duration:number}} o.clip
 */
export function buildMp4Args({ inputName, outputName, clip, size = OUTPUT_SIZE, fps = OUTPUT_FPS, background = BACKGROUND_COLOR }) {
  if (!(clip.duration > 0)) throw new Error('duração do trecho deve ser > 0');
  const d = sec(clip.duration);

  // Recorte quadrado centralizado, escala, e sobreposição a um fundo sólido (transparência não vaza).
  const fg = [
    `crop='min(iw,ih)':'min(iw,ih)'`,
    `scale=${size}:${size}:flags=lanczos`,
    'setsar=1',
    `fps=${fps}`,
    'format=rgba',
  ].join(',');
  const graph =
    `color=c=${background}:s=${size}x${size}:r=${fps}[bg];` +
    `[0:v:0]${fg}[fg];` +
    `[bg][fg]overlay=shortest=1,format=yuv420p[v]`;

  return [
    '-ss', sec(clip.start), '-t', d, '-i', inputName,
    '-filter_complex', graph,
    '-map', '[v]',
    '-map', '0:a:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-crf', '28',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
    '-t', d,
    '-y',
    outputName,
  ];
}

/**
 * O log do ffmpeg indica que o vídeo não tem faixa de som?
 * A redação muda entre versões (ffmpeg 6: "Stream map '0:a:0' matches no streams";
 * ffmpeg 8: "Stream map '' matches no streams" + "Failed to set value '0:a:0' for option 'map'"),
 * por isso olha o texto todo: "matches no streams" junto com o map de som '0:a:0'.
 */
export function isMissingAudioError(text) {
  const t = text || '';
  return /matches no streams/i.test(t) && /'0:a:0'/.test(t);
}
