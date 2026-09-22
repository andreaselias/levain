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

import { ENTRADAS_PADRAO, LISTAS, TEXTOS } from './calc.js';

export const VERSAO_ESTADO = 4;

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
  // v3: as três proporções viraram propIncremento + hidratacaoAtivado
  'propAtivacaoStarter',
  'propAtivacaoFarinha',
  'propAtivacaoAgua',
];

/**
 * v3 guardava a ativação como três proporções — starter, farinha, água — e
 * derivava a hidratação do ativado delas. v4 inverte: diz-se quanto alimento
 * entra por parte de starter e que hidratação se quer no ativado pronto.
 *
 * A troca é bijetiva, então a conversão é exata: `p` junta farinha e água numa
 * razão só contra o starter, e a hidratação é a própria fórmula que `calc.js`
 * usava para derivá-la. Vale para v1 e v2 também — os três formatos guardavam
 * essas mesmas chaves.
 */
function converterAtivacao(v) {
  const rSt = num(v.propAtivacaoStarter, 1);
  const rFl = num(v.propAtivacaoFarinha, 3);
  const rWa = num(v.propAtivacaoAgua, 3);
  const hMae = num(v.hidratacaoMae, ENTRADAS_PADRAO.hidratacaoMae);
  const divisorMae = 1 + hMae;
  const farinhaDaProporcao = rFl + rSt / divisorMae;

  // Entrada degenerada cai no padrão em vez de propagar NaN para a receita.
  // `farinhaDaProporcao` é o denominador da fração única dividido por
  // `divisorMae` — `rFl·dMae + rSt = dMae·(rFl + rSt/dMae)` — então zerar aqui
  // é exatamente zerar lá. Não troque um pelo outro sem refazer essa conta.
  if (!(rSt > 0) || !(divisorMae > 0) || farinhaDaProporcao === 0) {
    return {
      propIncremento: ENTRADAS_PADRAO.propIncremento,
      hidratacaoAtivado: ENTRADAS_PADRAO.hidratacaoAtivado,
    };
  }
  return {
    propIncremento: (rFl + rWa) / rSt,
    // Fração única de propósito: a forma com divisões aninhadas
    // `(rWa + rSt·hMae/dMae) / (rFl + rSt/dMae)` é a mesma álgebra, mas
    // arredonda no meio do caminho e erra o último bit em 38% das razões.
    // Esta chega ao piso: bate com o valor exato em racionais.
    hidratacaoAtivado: (rWa * divisorMae + rSt * hMae) / (rFl * divisorMae + rSt),
  };
}

function escalares(v) {
  const saida = {};
  for (const [chave, padrao] of Object.entries(ENTRADAS_PADRAO)) {
    if (LISTAS.includes(chave)) continue;
    // A validação do valor é de `calcular`; aqui só se preserva o que veio,
    // porque a migração não conhece o vocabulário de cada campo de texto.
    saida[chave] = TEXTOS.includes(chave) ? (v[chave] ?? padrao) : num(v[chave], padrao);
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

  Object.assign(saida, converterAtivacao(v));
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

  Object.assign(saida, converterAtivacao(v));
  for (const morto of CAMPOS_MORTOS) delete saida[morto];
  return saida;
}

/**
 * v3 → v4: troca as proporções de ativação e preserva todo o resto como veio.
 * O spread cru, em vez de `escalares`, é de propósito: retrato de diário pode
 * ser parcial, e remontá-lo pelo padrão apagaria a distinção entre "campo que
 * a fornada não tinha" e "campo que ela tinha igual ao padrão".
 */
function deV3(v) {
  const saida = { ...v, ...converterAtivacao(v) };
  for (const morto of CAMPOS_MORTOS) delete saida[morto];
  return saida;
}

/** As três proporções de ativação são a marca de que o objeto ainda é v3. */
function temProporcoesAntigas(v) {
  return (
    Object.hasOwn(v, 'propAtivacaoStarter') ||
    Object.hasOwn(v, 'propAtivacaoFarinha') ||
    Object.hasOwn(v, 'propAtivacaoAgua')
  );
}

export function migrarEntradas(entradas) {
  const v = entradas && typeof entradas === 'object' ? entradas : {};
  if (Array.isArray(v.composicaoPao)) return temProporcoesAntigas(v) ? deV3(v) : v;
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
