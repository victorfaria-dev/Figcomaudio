// Regras puras do trecho (sem DOM, sem ffmpeg): testáveis em Node.

export const MAX_CLIP_SECONDS = 5;
export const MIN_CLIP_SECONDS = 0.5;

const round3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/**
 * Maior duração possível dado onde o trecho começa em cada mídia.
 * visualDuration = null para imagem (sem limite de tempo).
 */
export function maxDuration({ visualDuration = null, visualStart = 0, audioDuration, audioStart = 0 }) {
  const limits = [MAX_CLIP_SECONDS, audioDuration - audioStart];
  if (visualDuration !== null) limits.push(visualDuration - visualStart);
  return Math.max(0, round3(Math.min(...limits)));
}

/**
 * Ajusta valores arbitrários (vindos de sliders/inputs) para um trecho válido.
 * Retorna { visualStart, audioStart, duration, valid }.
 * valid=false quando não há nem MIN_CLIP_SECONDS disponíveis em alguma mídia.
 */
export function normalizeClip({ visualDuration = null, audioDuration, visualStart = 0, audioStart = 0, duration = MAX_CLIP_SECONDS }) {
  const num = (v) => (Number.isFinite(v) ? v : 0);

  // O início não pode deixar menos que MIN_CLIP_SECONDS na mídia (se ela for tão curta, fica em 0).
  const startCap = (total) => Math.max(0, total - MIN_CLIP_SECONDS);
  const aStart = round3(clamp(num(audioStart), 0, startCap(audioDuration)));
  const vStart = visualDuration === null ? 0 : round3(clamp(num(visualStart), 0, startCap(visualDuration)));

  const max = maxDuration({ visualDuration, visualStart: vStart, audioDuration, audioStart: aStart });
  const wanted = Number.isFinite(duration) ? duration : MAX_CLIP_SECONDS;
  const d = round3(clamp(wanted, Math.min(MIN_CLIP_SECONDS, max), max));

  return { visualStart: vStart, audioStart: aStart, duration: d, valid: max > 0 && d > 0 };
}

/** Formata segundos como "m:ss.d" para exibir na UI. */
export function formatTime(seconds) {
  // Arredonda para décimos ANTES de separar minutos (senão 59.96 vira "0:60.0").
  const s = Math.round(Math.max(0, seconds) * 10) / 10;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${rest}`;
}
