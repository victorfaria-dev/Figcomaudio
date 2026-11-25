// Monta os argumentos do ffmpeg para o mp4 quadrado. Puro: sem DOM, sem wasm.
// Os mesmos argumentos são usados no navegador (ffmpeg.wasm) e nos testes (ffmpeg do sistema).

export const OUTPUT_SIZE = 512;
export const OUTPUT_FPS = 30;

/** Extensão segura (a..z0..9, até 5 chars) para nomear arquivos no sistema de arquivos virtual. */
export function safeExt(filename, fallback = 'bin') {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : fallback;
}

const sec = (n) => String(Math.round(n * 1000) / 1000);

/**
 * @param {object} o
 * @param {'video'|'image'} o.visualKind
 * @param {string} o.visualName   nome no FS virtual
 * @param {string} o.audioName    nome no FS virtual
 * @param {string} o.outputName   nome no FS virtual (.mp4)
 * @param {{visualStart:number, audioStart:number, duration:number}} o.clip
 */
export function buildMp4Args({ visualKind, visualName, audioName, outputName, clip, size = OUTPUT_SIZE, fps = OUTPUT_FPS }) {
  if (visualKind !== 'video' && visualKind !== 'image') throw new Error(`visualKind inválido: ${visualKind}`);
  if (!(clip.duration > 0)) throw new Error('duração do trecho deve ser > 0');

  const d = sec(clip.duration);

  const visualInput =
    visualKind === 'video'
      ? ['-ss', sec(clip.visualStart), '-t', d, '-i', visualName]
      : ['-loop', '1', '-framerate', String(fps), '-t', d, '-i', visualName];

  const audioInput = ['-ss', sec(clip.audioStart), '-t', d, '-i', audioName];

  // Cobre o quadro: recorte quadrado centralizado, depois escala. Aspas simples são
  // interpretadas pelo parser de filtros do ffmpeg (não por shell), então valem aqui.
  const vf = [
    `crop='min(iw,ih)':'min(iw,ih)'`,
    `scale=${size}:${size}:flags=lanczos`,
    'setsar=1',
    `fps=${fps}`,
    'format=yuv420p',
  ].join(',');

  return [
    ...visualInput,
    ...audioInput,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-vf', vf,
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
