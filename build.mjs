/**
 * Gera os arquivos autocontidos a partir de src/.
 *
 *   index.html     documento completo — abrir no celular, "Adicionar à Tela de Início"
 *   artifact.html  o mesmo conteúdo sem <head>, para publicar como Artifact
 *
 * Nada é buscado na rede em tempo de execução: CSS, JS e ícones vão embutidos.
 * O JS vira um script clássico de propósito — módulos ES são bloqueados por
 * CORS quando a página é aberta via file://, que é justamente o caso de uso.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const src = (nome) => path.join(raiz, 'src', nome);

// ---------------------------------------------------------------------------
// Codificador PNG mínimo — evita depender de biblioteca de imagem
// ---------------------------------------------------------------------------

const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = TABELA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pedaco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

function montarPng(largura, altura, rgba) {
  const passo = largura * 4;
  const bruto = Buffer.alloc((passo + 1) * altura);
  for (let y = 0; y < altura; y += 1) {
    bruto[y * (passo + 1)] = 0; // filtro "none"
    rgba.copy(bruto, y * (passo + 1) + 1, y * passo, (y + 1) * passo);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', zlib.deflateSync(bruto, { level: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Desenho do ícone: um pão com três pestanas, em coordenadas normalizadas
// ---------------------------------------------------------------------------

const FUNDO = [0xed, 0xeb, 0xe1];
const CROSTA = [0xb0, 0x4d, 0x1c];
const CORTE = [0xf0, 0xee, 0xe5];
const BASE = [0x6d, 0x30, 0x10];

const PESTANAS = [
  [0.31, 0.63, 0.43, 0.44],
  [0.44, 0.66, 0.56, 0.47],
  [0.57, 0.63, 0.69, 0.44],
];

function dentroDoPao(x, y) {
  // Superelipse: mais reta nas laterais que uma elipse, como um pão de fôrma.
  return Math.abs((x - 0.5) / 0.35) ** 2.1 + Math.abs((y - 0.53) / 0.255) ** 3 <= 1;
}

function distanciaAoSegmento(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function corDoPonto(x, y) {
  if (!dentroDoPao(x, y)) return null;
  // Faixa escura na barriga: pontos cuja vizinhança logo abaixo já saiu do pão.
  if (y > 0.60 && !dentroDoPao(x, y + 0.05)) return BASE;
  for (const [x1, y1, x2, y2] of PESTANAS) {
    if (distanciaAoSegmento(x, y, x1, y1, x2, y2) < 0.028) return CORTE;
  }
  return CROSTA;
}

function desenharIcone(lado) {
  const amostras = 3; // supersampling: 3×3 por pixel
  const rgba = Buffer.alloc(lado * lado * 4);

  for (let py = 0; py < lado; py += 1) {
    for (let px = 0; px < lado; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < amostras; sy += 1) {
        for (let sx = 0; sx < amostras; sx += 1) {
          const x = (px + (sx + 0.5) / amostras) / lado;
          const y = (py + (sy + 0.5) / amostras) / lado;
          const cor = corDoPonto(x, y) ?? FUNDO;
          r += cor[0];
          g += cor[1];
          b += cor[2];
        }
      }
      const total = amostras * amostras;
      const i = (py * lado + px) * 4;
      rgba[i] = Math.round(r / total);
      rgba[i + 1] = Math.round(g / total);
      rgba[i + 2] = Math.round(b / total);
      rgba[i + 3] = 255;
    }
  }
  return montarPng(lado, lado, rgba);
}

// ---------------------------------------------------------------------------
// Empacotamento dos módulos
// ---------------------------------------------------------------------------

const MODULOS = ['calc.js', 'campos.js', 'migrar.js', 'store.js', 'app.js'];

function carregarModulo(nome) {
  const texto = fs.readFileSync(src(nome), 'utf8');
  const semImports = texto.replace(/^import\s[^\n]*?;[ \t]*$/gm, '');
  const semExports = semImports.replace(/^export\s+(const|function|let|class)\s/gm, '$1 ');
  return `// ===== ${nome} =====\n${semExports.trim()}`;
}

function empacotar() {
  const corpo = MODULOS.map(carregarModulo).join('\n\n');
  const sobrou = corpo.match(/^\s*(import|export)\s/m);
  if (sobrou) {
    throw new Error(
      `Sobrou um "${sobrou[1]}" no pacote — o build só remove import/export de uma linha só. ` +
        'Reescreva a declaração numa linha única em src/.'
    );
  }
  return `(function () {\n${corpo}\n})();`;
}

// ---------------------------------------------------------------------------
// Montagem das páginas
// ---------------------------------------------------------------------------

const TITULO = 'Levain — calculadora de pão';
const DESCRICAO =
  'Calculadora de pão de fermentação natural: starter, receita, custos e diário de fornadas. Funciona offline.';

const icone180 = `data:image/png;base64,${desenharIcone(180).toString('base64')}`;
const icone512 = `data:image/png;base64,${desenharIcone(512).toString('base64')}`;

const manifesto = encodeURIComponent(
  JSON.stringify({
    name: 'Levain',
    short_name: 'Levain',
    description: DESCRICAO,
    start_url: '.',
    display: 'standalone',
    background_color: '#e5e2d6',
    theme_color: '#e5e2d6',
    icons: [{ src: icone512, sizes: '512x512', type: 'image/png', purpose: 'any' }],
  })
);

const css = fs.readFileSync(src('styles.css'), 'utf8');
const js = empacotar();

const cabecalho = `<meta name="theme-color" content="#e5e2d6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131410" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Levain">
<link rel="apple-touch-icon" href="${icone180}">
<link rel="icon" type="image/png" href="${icone180}">
<link rel="manifest" href="data:application/manifest+json,${manifesto}">`;

const marcacao = '<div id="app"></div>';

const paginaCompleta = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${DESCRICAO}">
<title>${TITULO}</title>
${cabecalho}
<style>
${css}</style>
</head>
<body>
${marcacao}
<script>
${js}
</script>
</body>
</html>
`;

// O Artifact embrulha o arquivo no seu próprio <head>/<body>, então esta versão
// não traz doctype nem head. Os <meta>/<link> ficam no corpo — fora do ideal,
// mas os navegadores os processam mesmo assim, e é o que dá o ícone na tela de
// início quando o app é aberto pelo link publicado.
const paginaArtifact = `<title>${TITULO}</title>
${cabecalho}
<style>
${css}</style>
${marcacao}
<script>
${js}
</script>
`;

fs.writeFileSync(path.join(raiz, 'index.html'), paginaCompleta);
fs.writeFileSync(path.join(raiz, 'artifact.html'), paginaArtifact);

const kb = (texto) => `${(Buffer.byteLength(texto) / 1024).toFixed(0)} kB`;
console.log(`index.html     ${kb(paginaCompleta)}`);
console.log(`artifact.html  ${kb(paginaArtifact)}`);
