/**
 * Conversão dos formatos antigos de receita para o atual.
 *
 *   v1  campos fixos de ingrediente (pctIntegral, pctCenteio, pctMelado, extras)
 *   v2  catálogo de farinhas com pct e pctStarter embutidos no próprio item
 *   v3  catálogo só de nome e preço, com duas listas de composição separadas
 *
 * Roda ao carregar o estado do aparelho. O critério é conservador: quem já
 * usava o app não pode ver número mudar. A única exceção é combinada — em v1
 * os extras não entravam no peso, e agora entram.
 */

import { ENTRADAS_PADRAO, LISTAS } from './calc.js';

export const VERSAO_ESTADO = 3;

function num(valor, padrao) {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

/** v1 guardava isto em campos fixos; hoje mora dentro das listas. */
const CAMPOS_MORTOS = [
  'pctIntegral',
  'pctCenteio',
  'pctMelado',
  'extras',
  'precoFarinha',
  'precoIntegral',
  'precoCenteio',
  'precoMelado',
  'precoExtras',
];

function escalares(v) {
  const saida = {};
  for (const [chave, padrao] of Object.entries(ENTRADAS_PADRAO)) {
    if (LISTAS.includes(chave)) continue;
    saida[chave] = num(v[chave], padrao);
  }
  return saida;
}

/** v1 → v3: os três campos fixos de farinha viram catálogo e composição. */
function deV1(v) {
  const saida = escalares(v);

  saida.farinhas = [
    { id: 'f-branca', nome: 'Farinha branca', preco: num(v.precoFarinha, 4.46) },
    { id: 'f-integral', nome: 'Farinha integral', preco: num(v.precoIntegral, 11) },
    { id: 'f-centeio', nome: 'Farinha de centeio', preco: num(v.precoCenteio, 9) },
  ];

  // A branca era literalmente "o resto" em v1, então continua sendo a base.
  // As outras só entram na composição se estavam de fato em uso.
  saida.composicaoPao = [{ farinhaId: 'f-branca', pct: 0 }];
  const integral = num(v.pctIntegral, 0);
  const centeio = num(v.pctCenteio, 0);
  if (integral > 0) saida.composicaoPao.push({ farinhaId: 'f-integral', pct: integral });
  if (centeio > 0) saida.composicaoPao.push({ farinhaId: 'f-centeio', pct: centeio });

  // Em v1 toda a farinha do starter era cobrada como branca — é o equivalente
  // a um starter 100% da farinha base.
  saida.composicaoStarter = [{ farinhaId: 'f-branca', pct: 0 }];

  saida.liquidos = [];
  const pctMelado = num(v.pctMelado, 0);
  if (pctMelado > 0) {
    // fracaoAgua 0 reproduz v1: lá o melado nunca contou como água.
    saida.liquidos.push({ id: 'l-melado', nome: 'Melado', pct: pctMelado, fracaoAgua: 0, preco: num(v.precoMelado, 41) });
  }

  saida.solidos = [];
  const extras = num(v.extras, 0);
  if (extras > 0) {
    // Em v1 os extras eram o total do lote; hoje são por pão.
    const paes = Math.max(1, num(v.numeroPaes, 1));
    saida.solidos.push({ id: 's-extras', nome: 'Extras', gramasPorPao: extras / paes, preco: num(v.precoExtras, 10) });
  }

  for (const morto of CAMPOS_MORTOS) delete saida[morto];
  return saida;
}

/** v2 → v3: separa a participação, que vinha grudada no item do catálogo. */
function deV2(v) {
  const saida = escalares(v);
  const farinhas = v.farinhas.map((f, i) => ({
    id: f.id ?? `f${i}`,
    nome: String(f.nome ?? 'Farinha'),
    preco: num(f.preco, 0),
  }));
  saida.farinhas = farinhas;

  // Em v2 a base das duas composições era sempre o primeiro item, e as demais
  // participavam só quando o percentual era maior que zero.
  const participacao = (attr) =>
    v.farinhas
      .map((f, i) => ({ farinhaId: farinhas[i].id, pct: num(f[attr], 0), base: i === 0 }))
      .filter((c) => c.base || c.pct > 0)
      .map(({ farinhaId, pct }) => ({ farinhaId, pct }));

  saida.composicaoPao = participacao('pct');
  saida.composicaoStarter = participacao('pctStarter');

  saida.liquidos = (Array.isArray(v.liquidos) ? v.liquidos : []).map((l) => ({ ...l }));
  saida.solidos = (Array.isArray(v.solidos) ? v.solidos : []).map((s) => ({ ...s }));

  for (const morto of CAMPOS_MORTOS) delete saida[morto];
  return saida;
}

export function migrarEntradas(entradas) {
  const v = entradas && typeof entradas === 'object' ? entradas : {};
  if (Array.isArray(v.composicaoPao)) return v; // já é v3
  if (Array.isArray(v.farinhas)) return deV2(v);
  return deV1(v);
}

export function migrarEstado(estado) {
  if (!estado || typeof estado !== 'object') return estado;
  return {
    ...estado,
    versao: VERSAO_ESTADO,
    receitas: (estado.receitas ?? []).map((r) => ({ ...r, entradas: migrarEntradas(r.entradas) })),
    registros: (estado.registros ?? []).map((g) => ({ ...g, snapshot: migrarEntradas(g.snapshot) })),
  };
}
