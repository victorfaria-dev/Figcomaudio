// Regras puras do trecho (sem DOM, sem ffmpeg): testáveis em Node.
// Uma única mídia: o vídeo, com o próprio som.

export const MAX_CLIP_SECONDS = 5;
export const MIN_CLIP_SECONDS = 0.5;

const round3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/** Maior duração possível começando em `start`. */
export function maxDuration({ videoDuration, start = 0 }) {
  return Math.max(0, round3(Math.min(MAX_CLIP_SECONDS, videoDuration - start)));
}

/**
 * Ajusta valores arbitrários (vindos de sliders) para um trecho válido.
 * Retorna { start, duration, valid }.
 */
export function normalizeClip({ videoDuration, start = 0, duration = MAX_CLIP_SECONDS }) {
  const total = Number.isFinite(videoDuration) ? Math.max(0, videoDuration) : 0;
  // O início não pode deixar menos que MIN_CLIP_SECONDS (se o vídeo for tão curto, fica em 0).
  const s = round3(clamp(Number.isFinite(start) ? start : 0, 0, Math.max(0, total - MIN_CLIP_SECONDS)));
  const max = maxDuration({ videoDuration: total, start: s });
  const wanted = Number.isFinite(duration) ? duration : MAX_CLIP_SECONDS;
  const d = round3(clamp(wanted, Math.min(MIN_CLIP_SECONDS, max), max));
  return { start: s, duration: d, valid: max > 0 && d > 0 };
}

/** Formata segundos como "m:ss.d" para exibir na UI. */
export function formatTime(seconds) {
  // Arredonda para décimos ANTES de separar minutos (senão 59.96 vira "0:60.0").
  const s = Math.round(Math.max(0, seconds) * 10) / 10;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${rest}`;
}
