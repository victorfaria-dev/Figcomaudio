// STUB — pacote de figurinhas do WhatsApp.
//
// Hoje NÃO é possível: pelo que se sabe (não reverificado, ver README R1), figurinhas do
// WhatsApp são WebP sem faixa de áudio. Este arquivo existe para marcar o ponto de troca:
// quando a API oficial suportar áudio, implemente `export()` aqui devolvendo o pacote
// (ex.: .wastickers / arquivos exigidos pela API), troque `available` para true e nada
// mais no app precisa mudar (UI, recorte e motor ffmpeg são independentes).

export class ExportNotSupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExportNotSupportedError';
  }
}

export const stickerPackExporter = {
  id: 'sticker-pack',
  label: 'Pacote de figurinhas (indisponível)',
  available: false,

  async export() {
    throw new ExportNotSupportedError(
      'Pacote de figurinhas com áudio ainda não é suportado pela API oficial do WhatsApp.',
    );
  },
};
