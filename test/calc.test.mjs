import test from 'node:test';
import assert from 'node:assert/strict';
import { calcular, ENTRADAS_PADRAO } from '../src/calc.js';

const TOL = 1e-6;

function perto(atual, esperado, msg) {
  assert.ok(
    Number.isFinite(atual) && Math.abs(atual - esperado) < TOL,
    `${msg}: esperado ~${esperado}, recebido ${atual}`
  );
}

/** Gramas de um item da lista de resultado, pelo nome. */
function gramas(lista, nome) {
  const item = lista.find((x) => x.nome === nome);
  return item ? item.gramas : undefined;
}

function comFarinhas(pares, extra = {}) {
  return {
    ...ENTRADAS_PADRAO,
    farinhas: pares.map((p, i) => ({
      id: `f${i}`,
      nome: p.nome,
      preco: p.preco ?? 0,
      pct: p.pct ?? 0,
      pctStarter: p.pctStarter ?? 0,
    })),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Os valores da planilha têm que sobreviver ao modelo de listas. Se algum
// destes quebrar, o novo modelo mudou o comportamento sem querer.
// ---------------------------------------------------------------------------

test('pesagem dos ingredientes reproduz a planilha', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  assert.equal(gramas(pao.farinhas, 'Farinha branca'), 530, 'farinha branca');
  assert.equal(gramas(pao.farinhas, 'Farinha integral'), 60, 'farinha integral');
  assert.equal(gramas(pao.farinhas, 'Farinha de centeio'), 0, 'farinha de centeio');
  assert.equal(pao.agua, 400, 'água');
  assert.equal(pao.starter, 120, 'starter');
  assert.equal(pao.sal, 10, 'sal');
});

test('farinha total e peso-alvo reproduzem a planilha', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  perto(pao.alvoMassa, 1123.595506, 'peso-alvo total da massa');
  assert.equal(pao.farinhaTotal, 590, 'farinha total adicionada');
  assert.equal(pao.massaTotal, 1120, 'massa total');
  assert.equal(pao.massaPorPao, 560, 'massa por pão');
});

test('métricas derivadas reproduzem a planilha', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  perto(pao.hidratacaoReal, 0.7076923077, 'hidratação real');
  perto(pao.pesoAssado, 498.4, 'peso assado por pão');
  perto(pao.largura, 12.15141476, 'largura');
  perto(pao.comprimento, 26.73311248, 'comprimento');
  perto(pao.altura, 10.32870255, 'altura');
  assert.equal(pao.fornadas, 1, 'fornadas');
});

test('custos reproduzem a planilha', () => {
  const { custos } = calcular(ENTRADAS_PADRAO);
  perto(custos.energia, 0.735505, 'custo de energia');
  perto(custos.producao, 8.271905, 'custo da produção');
  perto(custos.porPao, 2.0259525, 'custo por pão');
  perto(custos.porPaoEmbalado, 4.1359525, 'custo por pão embalado');
  perto(custos.ingredientes, 3.3164, 'ingredientes');
  perto(custos.embalagemTotal, 4.22, 'embalagem');
});

test('ativação do starter reproduz a planilha', () => {
  const { starter } = calcular(ENTRADAS_PADRAO);
  perto(starter.hidratacaoAtivado, 1, 'hidratação do ativado');
  assert.equal(starter.maeParaAtivar, 18, 'starter-mãe');
  assert.equal(starter.farinhaAtivar, 54, 'farinha');
  assert.equal(starter.aguaAtivar, 54, 'água');
  assert.equal(starter.totalAtivado, 126, 'total ativado');
  assert.equal(starter.sobra, 6, 'sobra');
  perto(starter.farinhaNoStarter, 60, 'farinha embutida');
  perto(starter.aguaNoStarter, 60, 'água embutida');
});

test('número de fornadas assume dois pães por vez', () => {
  assert.equal(calcular({ ...ENTRADAS_PADRAO, numeroPaes: 3 }).pao.fornadas, 2, '3 pães');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, numeroPaes: 5 }).pao.fornadas, 3, '5 pães');
});

// ---------------------------------------------------------------------------
// Catálogo de farinhas
// ---------------------------------------------------------------------------

test('a primeira farinha da lista é a base e absorve o resto do percentual', () => {
  const r = calcular(
    comFarinhas([
      { nome: 'Branca', pct: 0.99 }, // ignorado: base é calculada
      { nome: 'Integral', pct: 0.2 },
      { nome: 'Centeio', pct: 0.1 },
    ])
  );
  const total = r.pao.farinhaTotal;
  assert.equal(gramas(r.pao.farinhas, 'Integral'), Math.round((total * 0.2) / 10) * 10);
  assert.equal(gramas(r.pao.farinhas, 'Centeio'), Math.round((total * 0.1) / 10) * 10);
  assert.equal(gramas(r.pao.farinhas, 'Branca'), Math.round((total * 0.7) / 10) * 10, 'base = 70%');
});

test('farinhas somando mais de 100% geram aviso em vez de base negativa', () => {
  const r = calcular(comFarinhas([{ nome: 'Branca' }, { nome: 'Integral', pct: 0.7 }, { nome: 'Centeio', pct: 0.5 }]));
  assert.ok(r.avisos.length > 0, 'deveria avisar');
  assert.ok(
    r.pao.farinhas.every((f) => f.gramas >= 0),
    'nenhuma farinha pode ter peso negativo'
  );
});

test('acrescentar uma farinha zerada não altera peso nenhum', () => {
  const base = calcular(ENTRADAS_PADRAO);
  const comEspelta = calcular({
    ...ENTRADAS_PADRAO,
    farinhas: [...ENTRADAS_PADRAO.farinhas, { id: 'f-esp', nome: 'Espelta', preco: 15, pct: 0, pctStarter: 0 }],
  });
  assert.equal(comEspelta.pao.massaTotal, base.pao.massaTotal);
  perto(comEspelta.custos.producao, base.custos.producao, 'custo não muda');
});

// ---------------------------------------------------------------------------
// Composição própria do starter
// ---------------------------------------------------------------------------

test('starter com composição própria reparte a farinha embutida entre as farinhas', () => {
  const r = calcular(
    comFarinhas([
      { nome: 'Branca', preco: 4.46 },
      { nome: 'Integral', preco: 11, pct: 0.1, pctStarter: 0.1 },
    ])
  );
  // 120 g de starter a 100% de hidratação = 60 g de farinha, repartidos 90/10
  perto(gramas(r.starter.farinhas, 'Branca'), 54, 'branca no starter');
  perto(gramas(r.starter.farinhas, 'Integral'), 6, 'integral no starter');
});

test('starter de integral custa mais que starter de branca', () => {
  const branco = calcular(comFarinhas([{ nome: 'Branca', preco: 4.46 }, { nome: 'Integral', preco: 11, pct: 0.1 }]));
  const integral = calcular(
    comFarinhas([{ nome: 'Branca', preco: 4.46 }, { nome: 'Integral', preco: 11, pct: 0.1, pctStarter: 1 }])
  );
  // 60 g de farinha no starter trocando de R$ 4,46/kg para R$ 11/kg
  perto(integral.custos.producao - branco.custos.producao, (60 * (11 - 4.46)) / 1000, 'delta de custo');
});

test('a composição do starter não altera os pesos da massa', () => {
  const a = calcular(comFarinhas([{ nome: 'Branca' }, { nome: 'Integral', pct: 0.1 }]));
  const b = calcular(comFarinhas([{ nome: 'Branca' }, { nome: 'Integral', pct: 0.1, pctStarter: 1 }]));
  assert.equal(a.pao.massaTotal, b.pao.massaTotal);
  assert.equal(a.pao.agua, b.pao.agua);
});

// ---------------------------------------------------------------------------
// Líquidos
// ---------------------------------------------------------------------------

test('líquido sem água se comporta como o melado da planilha', () => {
  const comMelado = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Melado', pct: 0.05, fracaoAgua: 0, preco: 41 }],
  });
  const total = comMelado.pao.farinhaTotal;
  assert.equal(gramas(comMelado.pao.liquidos, 'Melado'), Math.round((total * 0.05) / 10) * 10);
  // Entra na massa, mas fora da razão de hidratação
  const farinha = comMelado.pao.farinhas.reduce((s, f) => s + f.gramas, 0) + comMelado.starter.farinhaNoStarter;
  perto(
    comMelado.pao.hidratacaoReal,
    (comMelado.pao.agua + comMelado.starter.aguaNoStarter) / farinha,
    'líquido seco fica fora da hidratação'
  );
});

test('a fração de água de um líquido desconta da água pura', () => {
  const semLeite = calcular(ENTRADAS_PADRAO);
  const comLeite = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Leite', pct: 0.1, fracaoAgua: 0.87, preco: 5 }],
  });
  assert.ok(comLeite.pao.agua < semLeite.pao.agua, 'água pura tem que cair');
  const leite = gramas(comLeite.pao.liquidos, 'Leite');
  assert.ok(leite > 0, 'leite pesado');
});

test('a água que vem no líquido conta na hidratação real', () => {
  const r = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Leite', pct: 0.1, fracaoAgua: 0.87, preco: 5 }],
  });
  const leite = gramas(r.pao.liquidos, 'Leite');
  const farinha = r.pao.farinhas.reduce((s, f) => s + f.gramas, 0) + r.starter.farinhaNoStarter;
  const esperado = (r.pao.agua + r.starter.aguaNoStarter + leite * 0.87) / farinha;
  perto(r.pao.hidratacaoReal, esperado, 'hidratação real inclui a água do leite');
});

test('azeite não conta como água', () => {
  const r = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Azeite', pct: 0.05, fracaoAgua: 0, preco: 40 }],
  });
  const azeite = gramas(r.pao.liquidos, 'Azeite');
  const farinha = r.pao.farinhas.reduce((s, f) => s + f.gramas, 0) + r.starter.farinhaNoStarter;
  perto(r.pao.hidratacaoReal, (r.pao.agua + r.starter.aguaNoStarter) / farinha, 'azeite fora da hidratação');
  assert.ok(azeite > 0, 'mas está na massa');
});

test('líquido entra no custo pelo preço por quilo', () => {
  const base = calcular(ENTRADAS_PADRAO);
  const r = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Azeite', pct: 0.05, fracaoAgua: 0, preco: 40 }],
  });
  const azeite = gramas(r.pao.liquidos, 'Azeite');
  assert.ok(r.custos.ingredientes > base.custos.ingredientes);
  assert.ok(azeite > 0);
});

// ---------------------------------------------------------------------------
// Sólidos
// ---------------------------------------------------------------------------

test('sólidos são informados por pão e somam no peso total', () => {
  const r = calcular({
    ...ENTRADAS_PADRAO,
    solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 50, preco: 60 }],
  });
  assert.equal(r.pao.solidosPorPao, 50, 'por pão');
  assert.equal(r.pao.solidosTotal, 100, '2 pães');
  assert.equal(gramas(r.pao.solidos, 'Nozes'), 100, 'a pesagem mostra o total do lote');
  assert.equal(r.pao.pesoTotal, r.pao.massaTotal + 100, 'peso total inclui os sólidos');
  assert.equal(r.pao.pesoPorPao, r.pao.massaPorPao + 50, 'peso por pão inclui os sólidos');
});

test('sólidos não alteram o equilíbrio farinha-água', () => {
  const base = calcular(ENTRADAS_PADRAO);
  const r = calcular({
    ...ENTRADAS_PADRAO,
    solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 50, preco: 60 }],
  });
  assert.equal(r.pao.massaTotal, base.pao.massaTotal, 'a massa é a mesma');
  assert.equal(r.pao.agua, base.pao.agua, 'a água é a mesma');
  perto(r.pao.hidratacaoReal, base.pao.hidratacaoReal, 'a hidratação é a mesma');
});

test('a perda no forno se aplica só à massa: sólidos não perdem água', () => {
  const r = calcular({
    ...ENTRADAS_PADRAO,
    solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 50, preco: 60 }],
  });
  perto(r.pao.pesoAssadoMassa, 498.4, 'a massa assada continua a mesma');
  perto(r.pao.pesoAssado, 548.4, 'o pão sai mais pesado, com as nozes inteiras');
});

test('sólidos entram no custo pelo total do lote', () => {
  const base = calcular(ENTRADAS_PADRAO);
  const r = calcular({
    ...ENTRADAS_PADRAO,
    solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 50, preco: 60 }],
  });
  perto(r.custos.ingredientes - base.custos.ingredientes, (100 * 60) / 1000, '100 g a R$ 60/kg');
});

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

test('tempo total soma o pré-aquecimento e as fornadas', () => {
  assert.equal(calcular(ENTRADAS_PADRAO).pao.tempoTotal, 85, '45 + 40 × 1');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, numeroPaes: 4 }).pao.tempoTotal, 125, '45 + 40 × 2');
});

// ---------------------------------------------------------------------------
// Parâmetros extremos: nunca produzir NaN ou Infinity
// ---------------------------------------------------------------------------

function todosFinitos(obj, caminho = '') {
  for (const [k, v] of Object.entries(obj)) {
    const p = caminho ? `${caminho}.${k}` : k;
    if (typeof v === 'number') {
      assert.ok(Number.isFinite(v), `${p} deveria ser finito, é ${v}`);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => typeof item === 'object' && item && todosFinitos(item, `${p}[${i}]`));
    } else if (v && typeof v === 'object') {
      todosFinitos(v, p);
    }
  }
}

test('fator de arredondamento zero significa não arredondar, sem aviso', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, fatorArredondamento: 0 });
  todosFinitos(r.pao);
  perto(r.pao.farinhaTotal, 1123.595506 / 1.89, 'farinha total sem arredondamento');
  assert.equal(r.avisos.length, 0, 'não é um erro pedir para não arredondar');
});

test('perda no forno de 100% é rejeitada com aviso', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, perdaForno: 1 });
  todosFinitos(r);
  assert.ok(r.avisos.length > 0);
});

test('número de pães zero é rejeitado com aviso', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, numeroPaes: 0 });
  todosFinitos(r);
  assert.ok(r.avisos.length > 0);
});

test('proporção de starter zero na ativação zera a ativação com aviso', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, propAtivacaoStarter: 0 });
  todosFinitos(r);
  assert.equal(r.starter.maeParaAtivar, 0);
  assert.ok(r.avisos.length > 0);
});

test('percentuais que zeram o denominador são rejeitados com aviso', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, hidratacao: -2 });
  todosFinitos(r);
  assert.ok(r.avisos.length > 0);
});

test('entradas ausentes, listas faltando ou lixo não quebram o cálculo', () => {
  todosFinitos(calcular({}));
  todosFinitos(calcular({ farinhas: [], liquidos: null, solidos: undefined }));
  todosFinitos(calcular({ farinhas: [{ nome: 'X' }] }));
  todosFinitos(calcular(null));
});

test('lista de farinhas vazia gera aviso em vez de dividir por zero', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, farinhas: [] });
  todosFinitos(r);
  assert.ok(r.avisos.length > 0, 'deveria avisar');
});
