// Motor ffmpeg.wasm: carrega uma vez, executa jobs (arquivos in → argumentos → arquivo out).
// Não conhece nada de figurinha/mp4/UI: é só um wrapper.

const LIB_URL = new URL('../vendor/ffmpeg/index.js', import.meta.url).href;
const CORE_URL = new URL('../vendor/ffmpeg-core/ffmpeg-core.js', import.meta.url).href;
const WASM_URL = new URL('../vendor/ffmpeg-core/ffmpeg-core.wasm', import.meta.url).href;

const INPUT_DIR = '/input';
export const DEFAULT_TIMEOUT_MS = 180_000; // celulares lentos; o usuário também pode cancelar

export class EngineCancelledError extends Error {
  constructor(message = 'Geração cancelada.') {
    super(message);
    this.name = 'EngineCancelledError';
  }
}

export class FfmpegEngine {
  #ffmpeg = null;
  #loading = null;
  #logTail = [];
  #progressCb = null;
  #cancelled = false;

  get loaded() {
    return this.#ffmpeg !== null;
  }

  /** Caminho, dentro do ffmpeg, de uma entrada passada em run({ inputs }). */
  inputPath(name) {
    return `${INPUT_DIR}/${name}`;
  }

  /** Carrega o núcleo (≈31 MB, vem do próprio site). Idempotente. */
  load() {
    this.#loading ??= this.#doLoad().catch((e) => {
      this.#loading = null; // permite tentar de novo
      throw new Error(`Não foi possível carregar o ffmpeg.wasm (${e.message}). Está servindo por http(s)?`);
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
   * As entradas são montadas com WORKERFS: o ffmpeg lê direto do File/Blob, sem copiar o
   * arquivo inteiro para a memória do wasm (importante para vídeos grandes no celular).
   *
   * @param {object} job
   * @param {Record<string, Blob>} job.inputs   nome → File/Blob (use inputPath(nome) nos args)
   * @param {string[]} job.args
   * @param {string} job.outputName              arquivo gerado (na raiz do FS virtual)
   * @param {(p:number)=>void} [job.onProgress]  0..1
   * @param {number} [job.timeoutMs]
   * @returns {Promise<Uint8Array>}
   */
  async run({ inputs, args, outputName, onProgress, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    await this.load();
    const ff = this.#ffmpeg;
    this.#logTail = [];
    this.#progressCb = onProgress ?? null;
    this.#cancelled = false;
    let mounted = false;
    let timedOut = false;
    try {
      await ff.createDir(INPUT_DIR).catch(() => {}); // pode já existir de um job anterior
      const blobs = Object.entries(inputs).map(([name, data]) => {
        if (!(data instanceof Blob)) throw new TypeError(`entrada "${name}" deve ser File/Blob`);
        return { name, data };
      });
      await ff.mount('WORKERFS', { blobs }, INPUT_DIR);
      mounted = true;

      const t0 = Date.now();
      const code = await ff.exec(args, timeoutMs);
      timedOut = code !== 0 && Date.now() - t0 >= timeoutMs;
      if (timedOut) throw new Error(`Tempo esgotado (${Math.round(timeoutMs / 1000)} s). Tente um trecho menor ou um arquivo mais leve.`);
      if (code !== 0) throw new Error(`ffmpeg terminou com código ${code}.\n${this.#logTail.slice(-8).join('\n')}`);

      const out = await ff.readFile(outputName);
      if (!(out instanceof Uint8Array) || out.length === 0) throw new Error('ffmpeg não gerou saída.');
      return out;
    } catch (e) {
      if (this.#cancelled) throw new EngineCancelledError();
      throw e;
    } finally {
      this.#progressCb = null;
      if (this.#ffmpeg === ff && !timedOut) {
        await ff.deleteFile(outputName).catch(() => {});
        if (mounted) await ff.unmount(INPUT_DIR).catch(() => {});
      }
      // Depois de um timeout o estado interno do wasm não é confiável: descarta e recarrega na próxima.
      if (timedOut) this.dispose();
    }
  }

  /** Interrompe o job em andamento (encerra o worker; o próximo run recarrega o núcleo). */
  cancel() {
    if (!this.#ffmpeg) return;
    this.#cancelled = true;
    this.dispose();
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
