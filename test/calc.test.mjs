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

/**
 * Monta uma receita a partir de uma lista de farinhas, distribuindo cada uma
 * nas duas composições. `pct` e `pctStarter` ausentes significam "fora daquela
 * composição" — que é justamente o caso de ter centeio na massa e não no pote.
 */
function comFarinhas(pares, extra = {}) {
  const farinhas = pares.map((p, i) => ({ id: `f${i}`, nome: p.nome, preco: p.preco ?? 0 }));
  const composicaoPao = [];
  const composicaoStarter = [];
  pares.forEach((p, i) => {
    if (i === 0 || p.pct !== undefined) composicaoPao.push({ farinhaId: `f${i}`, pct: p.pct ?? 0 });
    if (i === 0 || p.pctStarter !== undefined) composicaoStarter.push({ farinhaId: `f${i}`, pct: p.pctStarter ?? 0 });
  });
  return { ...ENTRADAS_PADRAO, farinhas, composicaoPao, composicaoStarter, ...extra };
}

// ---------------------------------------------------------------------------
// Os valores da planilha têm que sobreviver ao modelo de listas. Se algum
// destes quebrar, o novo modelo mudou o comportamento sem querer.
// ---------------------------------------------------------------------------

test('pesagem dos ingredientes reproduz a planilha', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  assert.equal(gramas(pao.farinhas, 'Farinha branca'), 530, 'farinha branca');
  assert.equal(gramas(pao.farinhas, 'Farinha integral'), 60, 'farinha integral');
  assert.equal(
    gramas(pao.farinhas, 'Farinha de centeio'),
    undefined,
    'centeio está no catálogo mas fora da composição, então nem aparece'
  );
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

// ---------------------------------------------------------------------------
// Fornadas: quantos pães cabem no forno de uma vez
// ---------------------------------------------------------------------------

test('o padrão continua sendo dois pães por fornada, como a planilha', () => {
  assert.equal(calcular({ ...ENTRADAS_PADRAO, numeroPaes: 3 }).pao.fornadas, 2, '3 pães');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, numeroPaes: 5 }).pao.fornadas, 3, '5 pães');
});

test('a capacidade do forno é configurável', () => {
  const fornadas = (paes, porFornada) =>
    calcular({ ...ENTRADAS_PADRAO, numeroPaes: paes, paesPorFornada: porFornada }).pao.fornadas;
  assert.equal(fornadas(6, 3), 2, '6 pães em fornadas de 3');
  assert.equal(fornadas(7, 3), 3, 'sobra um, mais uma fornada');
  assert.equal(fornadas(4, 1), 4, 'um por vez');
  assert.equal(fornadas(2, 8), 1, 'cabe tudo de uma vez');
});

test('a capacidade do forno muda o tempo e o custo de energia', () => {
  const umPorVez = calcular({ ...ENTRADAS_PADRAO, numeroPaes: 4, paesPorFornada: 1 });
  const todosJuntos = calcular({ ...ENTRADAS_PADRAO, numeroPaes: 4, paesPorFornada: 4 });
  assert.equal(umPorVez.pao.tempoTotal, 45 + 40 * 4, 'quatro fornadas');
  assert.equal(todosJuntos.pao.tempoTotal, 45 + 40 * 1, 'uma fornada');
  assert.ok(umPorVez.custos.energia > todosJuntos.custos.energia, 'mais forno, mais energia');
});

test('capacidade de forno zero é rejeitada com aviso, sem dividir por zero', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, paesPorFornada: 0 });
  assert.ok(Number.isFinite(r.pao.fornadas), 'sem Infinity');
  assert.ok(r.avisos.length > 0, 'deveria avisar');
});

// ---------------------------------------------------------------------------
// Catálogo de farinhas e composições isoladas
// ---------------------------------------------------------------------------

test('a primeira farinha da composição é a base e absorve o resto do percentual', () => {
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

test('farinha que está no catálogo mas fora das composições não pesa nem custa', () => {
  const base = calcular(ENTRADAS_PADRAO);
  const comEspelta = calcular({
    ...ENTRADAS_PADRAO,
    farinhas: [...ENTRADAS_PADRAO.farinhas, { id: 'f-esp', nome: 'Espelta', preco: 15 }],
  });
  assert.equal(comEspelta.pao.massaTotal, base.pao.massaTotal);
  perto(comEspelta.custos.producao, base.custos.producao, 'custo não muda');
  assert.equal(gramas(comEspelta.pao.farinhas, 'Espelta'), undefined, 'nem aparece na pesagem');
});

// --- O caso que motivou a separação --------------------------------------

test('centeio pode estar na massa do pão sem estar no starter', () => {
  const r = calcular(
    comFarinhas([
      { nome: 'Branca', preco: 4.46, pctStarter: 0 },
      { nome: 'Centeio', preco: 9, pct: 0.2 }, // só na massa: sem pctStarter
    ])
  );
  assert.ok(gramas(r.pao.farinhas, 'Centeio') > 0, 'centeio pesa na massa');
  assert.equal(
    r.starter.farinhas.find((f) => f.nome === 'Centeio'),
    undefined,
    'e não aparece no starter'
  );
  perto(
    r.starter.farinhas.find((f) => f.nome === 'Branca').gramas,
    r.starter.farinhaNoStarter,
    'o starter é todo de branca'
  );
});

test('o starter pode ter uma farinha que não está na massa do pão', () => {
  const r = calcular(
    comFarinhas([
      { nome: 'Branca', preco: 4.46, pct: 0 },
      { nome: 'Centeio', preco: 9, pctStarter: 1 }, // só no pote
    ])
  );
  assert.equal(gramas(r.pao.farinhas, 'Centeio'), undefined, 'centeio fora da massa');
  perto(
    r.starter.farinhas.find((f) => f.nome === 'Centeio').gramas,
    r.starter.farinhaNoStarter,
    'o starter é todo de centeio'
  );
});

test('cada composição tem a sua própria base', () => {
  // Branca é base da massa; centeio é base do starter.
  const r = calcular({
    ...ENTRADAS_PADRAO,
    farinhas: [
      { id: 'b', nome: 'Branca', preco: 4.46 },
      { id: 'c', nome: 'Centeio', preco: 9 },
    ],
    composicaoPao: [{ farinhaId: 'b', pct: 0 }, { farinhaId: 'c', pct: 0.2 }],
    composicaoStarter: [{ farinhaId: 'c', pct: 0 }],
  });
  const total = r.pao.farinhaTotal;
  assert.equal(gramas(r.pao.farinhas, 'Branca'), Math.round((total * 0.8) / 10) * 10, 'base da massa');
  perto(
    r.starter.farinhas.find((f) => f.nome === 'Centeio').gramas,
    r.starter.farinhaNoStarter,
    'base do starter'
  );
});

test('uma farinha nas duas composições vira uma linha de custo só', () => {
  const r = calcular(
    comFarinhas([
      { nome: 'Branca', preco: 4.46 },
      { nome: 'Integral', preco: 11, pct: 0.1, pctStarter: 0.1 },
    ])
  );
  const linhas = r.custos.itens.filter((i) => i.nome === 'Integral');
  assert.equal(linhas.length, 1, 'não pode duplicar');
  perto(linhas[0].gramasStarter, 6, '10% dos 60 g do starter');
  perto(linhas[0].custo, ((linhas[0].gramasPao + 6) * 11) / 1000, 'custo soma massa e starter');
});

test('composição do pão vazia gera aviso', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, composicaoPao: [] });
  assert.ok(r.avisos.length > 0, 'deveria avisar');
  assert.ok(Number.isFinite(r.pao.massaTotal), 'sem NaN');
});

test('composição que aponta para farinha inexistente é ignorada sem quebrar', () => {
  const r = calcular({
    ...ENTRADAS_PADRAO,
    composicaoPao: [...ENTRADAS_PADRAO.composicaoPao, { farinhaId: 'fantasma', pct: 0.5 }],
  });
  assert.ok(Number.isFinite(r.pao.massaTotal), 'sem NaN');
  assert.equal(gramas(r.pao.farinhas, undefined), undefined);
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

test('a farinha da ativação é repartida pela composição do pote', () => {
  const r = calcular(
    comFarinhas([
      { nome: 'Branca', preco: 4.46 },
      { nome: 'Integral', preco: 11, pct: 0.1, pctStarter: 0.1 },
    ])
  );
  // São 54 g de farinha para alimentar, num pote 90/10
  perto(r.starter.farinhaAtivar, 54, 'total a pesar');
  perto(gramas(r.starter.farinhasAtivar, 'Branca'), 48.6, 'branca a pesar');
  perto(gramas(r.starter.farinhasAtivar, 'Integral'), 5.4, 'integral a pesar');
});

test('as partes da ativação somam o total de farinha a pesar', () => {
  const r = calcular(
    comFarinhas([
      { nome: 'Branca' },
      { nome: 'Integral', pctStarter: 0.15 },
      { nome: 'Centeio', pctStarter: 0.25 },
    ])
  );
  const soma = r.starter.farinhasAtivar.reduce((s, f) => s + f.gramas, 0);
  perto(soma, r.starter.farinhaAtivar, 'soma das partes');
});

test('pote de uma farinha só dá uma linha, com o total inteiro', () => {
  const r = calcular(ENTRADAS_PADRAO);
  assert.equal(r.starter.farinhasAtivar.length, 1);
  perto(r.starter.farinhasAtivar[0].gramas, r.starter.farinhaAtivar, 'tudo numa linha');
});

test('farinha do pote em 0% não recebe farinha na ativação', () => {
  const r = calcular(
    comFarinhas([{ nome: 'Branca' }, { nome: 'Integral', pctStarter: 0 }])
  );
  perto(gramas(r.starter.farinhasAtivar, 'Integral'), 0, 'nada de integral');
  perto(gramas(r.starter.farinhasAtivar, 'Branca'), r.starter.farinhaAtivar, 'tudo na branca');
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
// Custo item a item — ingrediente opcional não pode sair de graça sem avisar
// ---------------------------------------------------------------------------

const item = (custos, nome) => custos.itens.find((i) => i.nome === nome);

test('cada ingrediente em uso vira uma linha de custo com gramas e valor', () => {
  const { custos } = calcular(ENTRADAS_PADRAO);
  const branca = item(custos, 'Farinha branca');
  assert.ok(branca, 'a farinha branca tem que estar na lista');
  assert.equal(branca.gramas, 590, '530 no pão + 60 no starter');
  perto(branca.custo, (590 * 4.46) / 1000, 'custo da farinha branca');
  perto(item(custos, 'Sal').custo, (10 * 2.5) / 1000, 'custo do sal');
});

test('a linha de farinha separa o que vai na massa do que vai no starter', () => {
  const { custos } = calcular(ENTRADAS_PADRAO);
  const branca = item(custos, 'Farinha branca');
  assert.equal(branca.gramasPao, 530);
  perto(branca.gramasStarter, 60, 'a farinha embutida no starter');
});

test('ingrediente zerado não vira linha de custo', () => {
  const { custos } = calcular(ENTRADAS_PADRAO);
  assert.equal(item(custos, 'Farinha de centeio'), undefined, 'centeio está em 0%');
});

test('as linhas de custo somam exatamente o custo de ingredientes', () => {
  const r = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Azeite', pct: 0.04, fracaoAgua: 0, preco: 40 }],
    solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 40, preco: 60 }],
  });
  const soma = r.custos.itens.reduce((s, i) => s + i.custo, 0);
  perto(soma, r.custos.ingredientes, 'soma das linhas');
});

test('líquidos e sólidos entram nas linhas de custo como qualquer outro', () => {
  const { custos } = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Azeite', pct: 0.04, fracaoAgua: 0, preco: 40 }],
    solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 40, preco: 60 }],
  });
  assert.equal(item(custos, 'Azeite').tipo, 'liquido');
  assert.equal(item(custos, 'Nozes').tipo, 'solido');
  assert.equal(item(custos, 'Nozes').gramas, 80, '40 g por pão × 2 pães');
  perto(item(custos, 'Nozes').custo, (80 * 60) / 1000, 'custo das nozes');
});

test('ingrediente em uso e sem preço é denunciado pelo nome', () => {
  const { custos } = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Azeite', pct: 0.04, fracaoAgua: 0, preco: 0 }],
    solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 40, preco: 60 }],
  });
  assert.deepEqual(custos.semPreco, ['Azeite']);
});

test('ingrediente sem preço mas fora da receita não é denunciado', () => {
  const { custos } = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Azeite', pct: 0, fracaoAgua: 0, preco: 0 }],
  });
  assert.deepEqual(custos.semPreco, [], 'azeite não está em uso');
});

test('receita com tudo precificado não denuncia nada', () => {
  assert.deepEqual(calcular(ENTRADAS_PADRAO).custos.semPreco, []);
});

test('acrescentar um ingrediente precificado não pode baratear a fornada', () => {
  const base = calcular(ENTRADAS_PADRAO);
  const comAzeite = calcular({
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Azeite', pct: 0.04, fracaoAgua: 0, preco: 40 }],
  });
  assert.ok(
    comAzeite.custos.ingredientes > base.custos.ingredientes,
    `azeite a R$ 40/kg tem que encarecer: ${base.custos.ingredientes} → ${comAzeite.custos.ingredientes}`
  );
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
