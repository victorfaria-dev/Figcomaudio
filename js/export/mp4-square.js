// Exportador atual: mp4 512×512 (H.264 + AAC) com o áudio embutido.
import { buildMp4Args, safeExt } from './mp4-args.js';

export const mp4SquareExporter = {
  id: 'mp4-square',
  label: 'MP4 quadrado 512×512 com áudio',
  available: true,

  /**
   * @param {object} p
   * @param {{run:Function}} p.engine                  motor (ver ffmpeg-engine.js)
   * @param {{kind:'video'|'image', file:File}} p.visual
   * @param {{file:File}} p.audio
   * @param {{visualStart:number, audioStart:number, duration:number}} p.clip
   * @param {(p:number)=>void} [p.onProgress]
   * @returns {Promise<{blob:Blob, filename:string, mime:string}>}
   */
  async export({ engine, visual, audio, clip, onProgress }) {
    const visualName = `visual.${safeExt(visual.file.name, visual.kind === 'image' ? 'png' : 'mp4')}`;
    const audioName = `audio.${safeExt(audio.file.name, 'mp3')}`;
    const outputName = 'out.mp4';

    const args = buildMp4Args({ visualKind: visual.kind, visualName, audioName, outputName, clip });
    const bytes = await engine.run({
      inputs: {
        [visualName]: new Uint8Array(await visual.file.arrayBuffer()),
        [audioName]: new Uint8Array(await audio.file.arrayBuffer()),
      },
      args,
      outputName,
      onProgress,
    });

    return { blob: new Blob([bytes], { type: 'video/mp4' }), filename: 'figcomaudio.mp4', mime: 'video/mp4' };
  },
};
