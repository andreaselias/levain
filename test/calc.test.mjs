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

// ---------------------------------------------------------------------------
// Os valores de referência abaixo vêm da planilha Tabela_de_pao.xlsx rodando
// com seus parâmetros padrão. São o critério de aceitação do motor.
// ---------------------------------------------------------------------------

test('starter ativado 1:3:3 com mãe a 100% resulta em hidratação de 100%', () => {
  const { starter } = calcular(ENTRADAS_PADRAO);
  perto(starter.hidratacaoAtivado, 1, 'hidratação do starter ativado');
});

test('ativação divide o starter necessário na proporção 1:3:3 arredondando para cima', () => {
  const { starter } = calcular(ENTRADAS_PADRAO);
  assert.equal(starter.maeParaAtivar, 18, 'starter-mãe para ativação');
  assert.equal(starter.farinhaAtivar, 54, 'farinha para ativação');
  assert.equal(starter.aguaAtivar, 54, 'água para ativação');
});

test('starter ativado totaliza 126 g com 6 g de sobra', () => {
  const { starter } = calcular(ENTRADAS_PADRAO);
  assert.equal(starter.totalAtivado, 126, 'total ativado');
  assert.equal(starter.sobra, 6, 'sobra de starter ativado');
});

test('starter de 120 g a 100% de hidratação contém 60 g de farinha e 60 g de água', () => {
  const { starter } = calcular(ENTRADAS_PADRAO);
  perto(starter.farinhaNoStarter, 60, 'farinha dentro do starter');
  perto(starter.aguaNoStarter, 60, 'água dentro do starter');
});

test('pesagem dos ingredientes reproduz a planilha', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  assert.equal(pao.farinhaBranca, 530, 'farinha branca');
  assert.equal(pao.integral, 60, 'farinha integral');
  assert.equal(pao.centeio, 0, 'farinha de centeio');
  assert.equal(pao.agua, 400, 'água');
  assert.equal(pao.starter, 120, 'starter');
  assert.equal(pao.sal, 10, 'sal');
  assert.equal(pao.melado, 0, 'melado');
});

test('farinha total é resolvida a partir do peso-alvo da massa', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  perto(pao.alvoMassa, 1123.595506, 'peso-alvo total da massa');
  assert.equal(pao.farinhaTotal, 590, 'farinha total adicionada');
});

test('peso total soma os ingredientes e ignora os extras', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  assert.equal(pao.pesoTotal, 1120, 'peso total');
  assert.equal(pao.pesoPorPao, 560, 'peso real da massa por pão');
});

test('extras alteram o custo mas não o peso da massa', () => {
  const base = calcular(ENTRADAS_PADRAO);
  const comExtras = calcular({ ...ENTRADAS_PADRAO, extras: 50 });
  assert.equal(comExtras.pao.pesoTotal, base.pao.pesoTotal, 'peso não muda com extras');
  assert.ok(comExtras.custos.producao > base.custos.producao, 'custo sobe com extras');
});

test('hidratação real considera a farinha e a água que vêm no starter', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  perto(pao.hidratacaoReal, 0.7076923077, 'hidratação real');
});

test('peso assado estimado desconta a perda no forno', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  perto(pao.pesoAssado, 498.4, 'peso assado estimado por pão');
});

test('dimensões da fôrma derivam do peso assado', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  perto(pao.largura, 12.15141476, 'largura estimada');
  perto(pao.comprimento, 26.73311248, 'comprimento estimado');
  perto(pao.altura, 10.32870255, 'altura estimada');
});

test('número de fornadas assume dois pães por vez', () => {
  assert.equal(calcular(ENTRADAS_PADRAO).pao.fornadas, 1, '2 pães');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, numeroPaes: 3 }).pao.fornadas, 2, '3 pães');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, numeroPaes: 4 }).pao.fornadas, 2, '4 pães');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, numeroPaes: 5 }).pao.fornadas, 3, '5 pães');
});

test('custos reproduzem a planilha', () => {
  const { custos } = calcular(ENTRADAS_PADRAO);
  perto(custos.energia, 0.735505, 'custo de energia');
  perto(custos.producao, 8.271905, 'custo da produção');
  perto(custos.porPao, 2.0259525, 'custo por pão');
  perto(custos.porPaoEmbalado, 4.1359525, 'custo por pão embalado');
});

test('custos separam ingredientes, embalagem e energia, e as partes somam o total', () => {
  const { custos } = calcular(ENTRADAS_PADRAO);
  perto(custos.ingredientes, 3.3164, 'custo dos ingredientes');
  perto(custos.embalagemTotal, 4.22, 'custo total de embalagem');
  perto(
    custos.ingredientes + custos.embalagemTotal + custos.energia,
    custos.producao,
    'soma das partes'
  );
});

test('a farinha que vem no starter é cobrada ao preço da farinha branca', () => {
  const base = calcular(ENTRADAS_PADRAO);
  const maisCara = calcular({ ...ENTRADAS_PADRAO, precoFarinha: ENTRADAS_PADRAO.precoFarinha + 1 });
  // 590 g de farinha branca + starter = R$ 0,59 a mais por real no preço do quilo
  perto(maisCara.custos.producao - base.custos.producao, 0.59, 'delta de custo');
});

// ---------------------------------------------------------------------------
// Comportamento sob parâmetros extremos: nunca produzir NaN ou Infinity.
// ---------------------------------------------------------------------------

function todosFinitos(obj, caminho = '') {
  for (const [k, v] of Object.entries(obj)) {
    const p = caminho ? `${caminho}.${k}` : k;
    if (typeof v === 'number') {
      assert.ok(Number.isFinite(v), `${p} deveria ser finito, é ${v}`);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
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
  todosFinitos(r.pao);
  todosFinitos(r.custos);
  assert.ok(r.avisos.length > 0, 'deveria avisar');
});

test('número de pães zero é rejeitado com aviso', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, numeroPaes: 0 });
  todosFinitos(r.pao);
  todosFinitos(r.custos);
  assert.ok(r.avisos.length > 0, 'deveria avisar');
});

test('proporção de starter zero na ativação zera a ativação com aviso', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, propAtivacaoStarter: 0 });
  todosFinitos(r.starter);
  assert.equal(r.starter.maeParaAtivar, 0, 'sem starter-mãe');
  assert.equal(r.starter.farinhaAtivar, 0, 'sem farinha');
  assert.equal(r.starter.aguaAtivar, 0, 'sem água');
  assert.ok(r.avisos.length > 0, 'deveria avisar');
});

test('percentuais que zeram o denominador são rejeitados com aviso', () => {
  // hidratação muito negativa derruba o denominador a zero ou menos
  const r = calcular({ ...ENTRADAS_PADRAO, hidratacao: -2 });
  todosFinitos(r.pao);
  todosFinitos(r.custos);
  assert.ok(r.avisos.length > 0, 'deveria avisar');
});

test('entradas ausentes ou não numéricas não quebram o cálculo', () => {
  const r = calcular({});
  todosFinitos(r.pao);
  todosFinitos(r.starter);
  todosFinitos(r.custos);
});
