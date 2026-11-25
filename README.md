# Figcomaudio

Página web estática (HTML + CSS + JS puro, sem backend, nada para instalar) que recebe uma imagem ou vídeo
e um áudio, deixa escolher um trecho de **até 5 s** e gera um **mp4 quadrado 512×512
com o áudio embutido**, usando [ffmpeg.wasm](https://ffmpegwasm.netlify.app/).
Tudo roda no navegador: nenhum arquivo é enviado a servidor.

**Usar online:** https://victorfaria-dev.github.io/Figcomaudio/ (publicado automaticamente
a partir da branch `main`; ver "Publicação" abaixo).

## Hipótese a validar

> **H1.** Um mp4 512×512 (H.264 + AAC, ≤ 5 s) importado pelo fluxo "Criar figurinha"
> do WhatsApp **mantém o áudio** e é aceito como figurinha.

Este projeto existe para **testar H1 barato**, não para presumir que ela é verdadeira.

### O que sabemos e o que não sabemos

| Afirmação | Status |
|---|---|
| ffmpeg.wasm gera mp4 512×512 H.264+AAC no navegador | Verificável aqui (testes automatizados deste repo) |
| O mp4 gerado toca com áudio em players comuns | Verificável aqui |
| O WhatsApp aceita esse mp4 no "Criar figurinha" | **Não verificado** |
| O WhatsApp preserva o áudio na figurinha resultante | **Não verificado — provavelmente falsa** (ver R1) |

### Experimento (checklist manual, ~10 min, não precisa saber programar)

1. No celular, abra o link "Usar online" acima. Escolha uma foto e um áudio com **voz
   falando** (som inconfundível) e gere um mp4 de 3 s.
2. Salve na galeria ("Compartilhar / salvar no celular" ou "Baixar") e tente importar pelo
   "Criar figurinha" do WhatsApp (Android e iPhone, se tiver acesso aos dois).
3. Registrar para cada plataforma/versão do WhatsApp: (a) aceitou o arquivo? (b) virou
   figurinha animada? (c) **o áudio sobreviveu**? (d) enviada a um contato, toca com som?
4. Se (c) = não em todas as plataformas, H1 está **refutada** para o fluxo atual; a página
   continua útil só como gerador de mp4 quadrado com áudio (para status, Reels etc.), e a
   camada de exportação (abaixo) é o ponto de troca caso a API oficial passe a suportar áudio.

Registre os resultados em [`docs/resultados.md`](docs/resultados.md).

## Riscos

- **R1 — Figurinhas do WhatsApp provavelmente não têm áudio.** Pelo que consta na
  documentação oficial de figurinhas (formato WebP, 512×512, animada ≤ 500 KB e ≤ 10 s) não
  há faixa de áudio. Esta documentação **não foi reverificada** ao escrever este README:
  confirmar na fonte oficial antes de qualquer decisão. É o risco que pode invalidar H1.
- **R2 — Fluxo "Criar figurinha" muda por versão/plataforma.** As instruções na página são
  um roteiro aproximado, não verificado em todas as versões.
- **R3 — Tamanho do arquivo.** O limite de 500 KB é de figurinha animada WebP; para mp4
  não sabemos o limite efetivo. A página mostra o tamanho do resultado para medirmos.
- **R4 — Memória/desempenho do ffmpeg.wasm.** A versão single-thread roda em worker, é
  lenta e limitada pela memória do navegador. As entradas são lidas via WORKERFS (sem copiar
  o arquivo inteiro para o wasm), há limite de 200 MB por entrada, timeout de 180 s e botão
  Cancelar. O consumo real de memória em celulares **não foi medido**.
- **R5 — Dependência de CDN / peso.** O núcleo wasm tem ~31 MB. Está vendorizado no
  repositório para funcionar offline e sem depender de CDN, ao custo de um repositório maior.
- **R6 — Direitos autorais.** Áudio e imagens de terceiros podem ter direitos reservados;
  responsabilidade de quem usa. A página não envia nada para fora do navegador.
- **R7 — Compatibilidade do navegador.** Requer Web Workers com módulos (ES modules) e
  WebAssembly. A página lê duração/dimensões com `<video>`/`<audio>` nativos: um arquivo que o
  *navegador* não decodifica (ex.: HEVC no Chrome/Linux) é recusado mesmo que o ffmpeg o
  aceitasse. GIF é tratado como imagem (só o primeiro quadro).
- **R8 — Licença do núcleo.** O pacote `@ffmpeg/core` declara MIT, mas embute FFmpeg e
  libx264, cujas licenças (LGPL/GPL) se aplicam ao binário wasm. **Não verificado**; conferir
  antes de distribuir publicamente o site com o `vendor/` incluído.

## Arquitetura

```
index.html            UI (uma página)
css/styles.css
js/
  main.js             orquestra a UI (única parte que toca o DOM de ponta a ponta)
  clip.js             regras puras do trecho (duração máx., limites) — testável em Node
  media.js            leitura de arquivos e duração (vídeo/áudio/imagem)
  ffmpeg-engine.js    carrega e executa o ffmpeg.wasm (worker, WORKERFS, timeout, cancelar)
  export/
    index.js          registro de exportadores
    mp4-args.js       monta os argumentos do ffmpeg (puro, testável)
    mp4-square.js     exportador atual: mp4 512×512 com áudio
    sticker-pack.js   STUB: pacote de figurinhas (futuro, quando a API suportar áudio)
```

### Camada de exportação (trocável)

A UI nunca chama o ffmpeg diretamente: ela chama um **exportador** que obedece a este contrato
(ver `js/export/index.js`):

```js
{
  id: 'mp4-square',
  label: 'MP4 quadrado 512×512',
  available: true,
  async export({ engine, visual, audio, clip, onProgress }) {
    return { blob, filename, mime };
  }
}
```

Para trocar por pacote de figurinhas quando a API oficial suportar áudio, basta
implementar `js/export/sticker-pack.js` (hoje um stub que recusa explicitamente) e
marcá-lo `available: true`. A UI, o recorte e o motor ffmpeg não mudam.

## Rodar localmente

```bash
npm install
npm run vendor      # copia ffmpeg.wasm de node_modules para vendor/
npm run serve       # http://localhost:8080
```

(Não abrir via `file://`: módulos ES e workers exigem http.)

## Publicação

`.github/workflows/pages.yml` publica no GitHub Pages a cada push na `main`. Configuração
única no GitHub: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
`.github/workflows/ci.yml` roda os testes unitários e de integração em cada PR e confere se
`vendor/` corresponde ao `package-lock.json`.

## Testes

```bash
npm test                  # unitários (lógica pura)
npm run test:integration  # roda o ffmpeg do sistema com os mesmos argumentos do app
npm run test:e2e          # navegador real (Playwright) com o ffmpeg.wasm
```

## Estado da validação (o que foi realmente executado)

- Unitários e integração (ffmpeg do sistema + ffprobe): passam, inclusive o caso de PNG
  transparente e a verificação de que o áudio vem do arquivo de áudio (por frequência).
- E2E em Chromium (Playwright) com ffmpeg.wasm real: vídeo→mp4 e imagem→mp4 (512×512,
  H.264+AAC, duração pedida, conferido com ffprobe no arquivo baixado), cancelamento,
  timeout, corrida ao trocar de arquivo, limpeza após arquivo inválido, compartilhar
  (com `navigator.share` simulado). O e2e reprova se houver erro de console.
- Nos testes, mídia sintética (`testsrc`) comprime muito (~50–90 KB); **não** representa o
  tamanho de filmagens reais. Meça com seus arquivos (R3).
- O e2e não roda no CI (depende do Playwright instalado na máquina); rodar localmente.
- **Não testado:** importação no WhatsApp (H1), Safari/Firefox, celulares reais, Web Share real.

## Limites assumidos

- Trecho máximo: 5 s. Saída: 512×512, 30 fps, H.264 (yuv420p) + AAC estéreo 44,1 kHz.
- Recorte quadrado centralizado (cobre o quadro; as bordas são cortadas).
- Áreas transparentes (PNG de figurinha) viram fundo branco: mp4/H.264 não tem transparência.
- O áudio do vídeo de entrada é ignorado; vale só o arquivo de áudio escolhido.
