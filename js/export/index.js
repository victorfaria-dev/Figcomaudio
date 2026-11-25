// Registro de exportadores. A UI só conhece esta interface:
//
//   exporter = { id, label, available, export({ engine, video, clip, onProgress })
//                                          → Promise<{ blob, filename, mime }> }
//
// Para adicionar/trocar um formato, crie um módulo com esse contrato e registre aqui.
import { mp4SquareExporter } from './mp4-square.js';
import { stickerPackExporter } from './sticker-pack.js';

const exporters = [mp4SquareExporter, stickerPackExporter];

export const listExporters = () => exporters.slice();
export const listAvailableExporters = () => exporters.filter((e) => e.available);
export const defaultExporter = () => listAvailableExporters()[0];

export function getExporter(id) {
  const e = exporters.find((x) => x.id === id);
  if (!e) throw new Error(`Exportador desconhecido: ${id}`);
  return e;
}

export { ExportNotSupportedError } from './sticker-pack.js';
export { MissingAudioError } from './mp4-square.js';
