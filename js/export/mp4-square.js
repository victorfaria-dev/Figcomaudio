// Exportador atual: mp4 512×512 (H.264 + AAC) com o som do próprio vídeo.
import { buildMp4Args, isMissingAudioError, safeExt } from './mp4-args.js';

export class MissingAudioError extends Error {
  constructor() {
    super('Esse vídeo não tem som. Escolha um vídeo com áudio.');
    this.name = 'MissingAudioError';
  }
}

export const mp4SquareExporter = {
  id: 'mp4-square',
  label: 'MP4 quadrado 512×512 com som',
  available: true,

  /**
   * @param {object} p
   * @param {{run:Function, inputPath:Function, lastLog?:string}} p.engine  motor (ver ffmpeg-engine.js)
   * @param {{file:File}} p.video
   * @param {{start:number, duration:number}} p.clip
   * @param {(p:number)=>void} [p.onProgress]
   * @returns {Promise<{blob:Blob, filename:string, mime:string}>}
   */
  async export({ engine, video, clip, onProgress }) {
    const inputName = `video.${safeExt(video.file.name, 'mp4')}`;
    const outputName = 'out.mp4';
    const args = buildMp4Args({ inputName: engine.inputPath(inputName), outputName, clip });

    let bytes;
    try {
      // Passa o File em si (sem ler para a memória): o motor monta com WORKERFS.
      bytes = await engine.run({ inputs: { [inputName]: video.file }, args, outputName, onProgress });
    } catch (e) {
      if (isMissingAudioError(`${e.message}\n${engine.lastLog ?? ''}`)) throw new MissingAudioError();
      throw e;
    }
    return { blob: new Blob([bytes], { type: 'video/mp4' }), filename: 'figurinha.mp4', mime: 'video/mp4' };
  },
};
