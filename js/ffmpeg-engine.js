// Motor ffmpeg.wasm: carrega uma vez, executa jobs (arquivos in → argumentos → arquivo out).
// Não conhece nada de figurinha/mp4/UI: é só um wrapper.

const LIB_URL = new URL('../vendor/ffmpeg/index.js', import.meta.url).href;
const CORE_URL = new URL('../vendor/ffmpeg-core/ffmpeg-core.js', import.meta.url).href;
const WASM_URL = new URL('../vendor/ffmpeg-core/ffmpeg-core.wasm', import.meta.url).href;

export class FfmpegEngine {
  #ffmpeg = null;
  #loading = null;
  #logTail = [];
  #progressCb = null;

  get loaded() {
    return this.#ffmpeg !== null;
  }

  /** Carrega o núcleo (≈31 MB, vem do próprio site). Idempotente. */
  load() {
    this.#loading ??= this.#doLoad().catch((e) => {
      this.#loading = null; // permite tentar de novo
      throw new Error(`Não foi possível carregar o ffmpeg.wasm (${e.message}). Rodou "npm run vendor"? Está servindo por http(s)?`);
    });
    return this.#loading;
  }

  async #doLoad() {
    const { FFmpeg } = await import(LIB_URL);
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => {
      this.#logTail.push(message);
      if (this.#logTail.length > 40) this.#logTail.shift();
    });
    ff.on('progress', ({ progress }) => {
      if (this.#progressCb && Number.isFinite(progress)) this.#progressCb(Math.min(1, Math.max(0, progress)));
    });
    await ff.load({ coreURL: CORE_URL, wasmURL: WASM_URL });
    this.#ffmpeg = ff;
  }

  /**
   * @param {object} job
   * @param {Record<string, Uint8Array>} job.inputs  nome no FS virtual → bytes
   * @param {string[]} job.args                      argumentos do ffmpeg
   * @param {string} job.outputName                  arquivo gerado
   * @param {(p:number)=>void} [job.onProgress]      0..1
   * @returns {Promise<Uint8Array>}
   */
  async run({ inputs, args, outputName, onProgress }) {
    await this.load();
    const ff = this.#ffmpeg;
    this.#logTail = [];
    this.#progressCb = onProgress ?? null;
    const written = [];
    try {
      for (const [name, data] of Object.entries(inputs)) {
        await ff.writeFile(name, data);
        written.push(name);
      }
      const code = await ff.exec(args);
      if (code !== 0) {
        throw new Error(`ffmpeg terminou com código ${code}.\n${this.#logTail.slice(-8).join('\n')}`);
      }
      const out = await ff.readFile(outputName);
      written.push(outputName);
      if (!(out instanceof Uint8Array) || out.length === 0) throw new Error('ffmpeg não gerou saída.');
      return out;
    } finally {
      this.#progressCb = null;
      for (const name of written) await ff.deleteFile(name).catch(() => {});
    }
  }

  get lastLog() {
    return this.#logTail.join('\n');
  }

  dispose() {
    this.#ffmpeg?.terminate();
    this.#ffmpeg = null;
    this.#loading = null;
  }
}
