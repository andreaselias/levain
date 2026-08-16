/**
 * Conversão do formato v1 (campos fixos de ingrediente) para v2 (catálogo).
 *
 * Roda ao carregar o estado do aparelho. O critério é simples e conservador:
 * quem já usava o app não pode ver número mudar. A única exceção é combinada —
 * em v1 os extras não entravam no peso, e agora entram.
 */

import { ENTRADAS_PADRAO, LISTAS } from './calc.js';

export const VERSAO_ESTADO = 2;

function num(valor, padrao) {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

/** v1 guardava tudo isto em campos fixos; v2 guarda dentro das listas. */
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

export function migrarEntradas(entradas) {
  const v = entradas && typeof entradas === 'object' ? entradas : {};
  if (Array.isArray(v.farinhas)) return v; // já é v2

  const saida = {};
  for (const [chave, padrao] of Object.entries(ENTRADAS_PADRAO)) {
    if (LISTAS.includes(chave)) continue;
    saida[chave] = num(v[chave], padrao);
  }

  // As três farinhas fixas viram o catálogo. A branca é a base: em v1 ela era
  // literalmente "o resto", então o percentual dela nem é guardado.
  saida.farinhas = [
    { id: 'f-branca', nome: 'Farinha branca', preco: num(v.precoFarinha, 4.46), pct: 0, pctStarter: 0 },
    { id: 'f-integral', nome: 'Farinha integral', preco: num(v.precoIntegral, 11), pct: num(v.pctIntegral, 0), pctStarter: 0 },
    { id: 'f-centeio', nome: 'Farinha de centeio', preco: num(v.precoCenteio, 9), pct: num(v.pctCenteio, 0), pctStarter: 0 },
  ];

  // fracaoAgua 0 reproduz v1 exatamente: lá o melado nunca contou como água.
  saida.liquidos = [];
  const pctMelado = num(v.pctMelado, 0);
  if (pctMelado > 0) {
    saida.liquidos.push({
      id: 'l-melado',
      nome: 'Melado',
      pct: pctMelado,
      fracaoAgua: 0,
      preco: num(v.precoMelado, 41),
    });
  }

  // Em v1 os extras eram o total do lote; em v2 são por pão.
  saida.solidos = [];
  const extras = num(v.extras, 0);
  if (extras > 0) {
    const paes = Math.max(1, num(v.numeroPaes, 1));
    saida.solidos.push({
      id: 's-extras',
      nome: 'Extras',
      gramasPorPao: extras / paes,
      preco: num(v.precoExtras, 10),
    });
  }

  for (const morto of CAMPOS_MORTOS) delete saida[morto];
  return saida;
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
