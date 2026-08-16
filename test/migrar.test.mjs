import test from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../src/calc.js';
import { migrarEntradas, migrarEstado } from '../src/migrar.js';

const TOL = 1e-6;
const perto = (a, b, m) =>
  assert.ok(Number.isFinite(a) && Math.abs(a - b) < TOL, `${m}: esperado ~${b}, recebido ${a}`);
const gramas = (lista, nome) => lista.find((x) => x.nome === nome)?.gramas;

/** Exatamente o formato que ficou salvo nos aparelhos da primeira versão. */
const V1 = {
  pesoAssadoDesejado: 500,
  numeroPaes: 2,
  pctIntegral: 0.1,
  pctCenteio: 0,
  hidratacao: 0.7,
  pctStarter: 0.2,
  pctSal: 0.02,
  pctMelado: 0,
  extras: 0,
  fatorArredondamento: 10,
  perdaForno: 0.11,
  hidratacaoMae: 1,
  tempoPreAquecimento: 45,
  tempoCozimento: 40,
  propAtivacaoStarter: 1,
  propAtivacaoFarinha: 3,
  propAtivacaoAgua: 3,
  precoFarinha: 4.46,
  precoIntegral: 11,
  precoCenteio: 9,
  precoSal: 2.5,
  precoMelado: 41,
  precoExtras: 10,
  precoKwh: 0.8653,
  potenciaForno: 0.6,
  embalagemExterna: 1.44,
  embalagemInterna: 0.63,
  etiqueta: 0.04,
};

// ---------------------------------------------------------------------------
// O que importa: quem já usava o app não pode ver número mudar.
// ---------------------------------------------------------------------------

test('receita v1 migrada produz exatamente os mesmos pesos de antes', () => {
  const { pao } = calcular(migrarEntradas(V1));
  assert.equal(gramas(pao.farinhas, 'Farinha branca'), 530);
  assert.equal(gramas(pao.farinhas, 'Farinha integral'), 60);
  assert.equal(gramas(pao.farinhas, 'Farinha de centeio'), 0);
  assert.equal(pao.agua, 400);
  assert.equal(pao.starter, 120);
  assert.equal(pao.sal, 10);
  assert.equal(pao.massaTotal, 1120);
  assert.equal(pao.massaPorPao, 560);
  perto(pao.hidratacaoReal, 0.7076923077, 'hidratação real');
});

test('receita v1 migrada produz exatamente os mesmos custos de antes', () => {
  const { custos } = calcular(migrarEntradas(V1));
  perto(custos.energia, 0.735505, 'energia');
  perto(custos.producao, 8.271905, 'produção');
  perto(custos.porPao, 2.0259525, 'por pão');
  perto(custos.porPaoEmbalado, 4.1359525, 'por pão embalado');
});

test('o starter migra como 100% da farinha base, que era o comportamento de v1', () => {
  const { farinhas } = migrarEntradas(V1);
  assert.equal(farinhas[0].pctStarter, 0, 'a base absorve o resto');
  assert.equal(farinhas[1].pctStarter, 0, 'integral fora do starter');
  assert.equal(farinhas[2].pctStarter, 0, 'centeio fora do starter');

  const r = calcular(migrarEntradas(V1));
  perto(gramas(r.starter.farinhas, 'Farinha branca'), 60, 'toda a farinha do starter é branca');
  perto(gramas(r.starter.farinhas, 'Farinha integral'), 0, 'nada de integral');
});

// ---------------------------------------------------------------------------
// Conversões
// ---------------------------------------------------------------------------

test('as três farinhas viram catálogo com nome, percentual e preço preservados', () => {
  const { farinhas } = migrarEntradas({ ...V1, pctIntegral: 0.15, pctCenteio: 0.05 });
  assert.deepEqual(
    farinhas.map((f) => [f.nome, f.pct, f.preco]),
    [
      ['Farinha branca', 0, 4.46],
      ['Farinha integral', 0.15, 11],
      ['Farinha de centeio', 0.05, 9],
    ]
  );
});

test('melado vira líquido sem água, preservando os números de v1', () => {
  const migrada = migrarEntradas({ ...V1, pctMelado: 0.05 });
  assert.equal(migrada.liquidos.length, 1);
  assert.equal(migrada.liquidos[0].nome, 'Melado');
  assert.equal(migrada.liquidos[0].pct, 0.05);
  assert.equal(migrada.liquidos[0].fracaoAgua, 0, 'v1 não contava melado como água');
  assert.equal(migrada.liquidos[0].preco, 41);

  const { pao } = calcular(migrada);
  assert.equal(pao.farinhaTotal, 580, 'farinha total de v1 com 5% de melado');
  assert.equal(gramas(pao.liquidos, 'Melado'), 30);
});

test('melado zerado não cria líquido nenhum', () => {
  assert.deepEqual(migrarEntradas(V1).liquidos, []);
});

test('extras viram sólido por pão preservando o custo', () => {
  const migrada = migrarEntradas({ ...V1, extras: 100 });
  assert.equal(migrada.solidos.length, 1);
  assert.equal(migrada.solidos[0].gramasPorPao, 50, '100 g do lote em 2 pães');
  assert.equal(migrada.solidos[0].preco, 10);

  const semExtras = calcular(migrarEntradas(V1));
  const comExtras = calcular(migrada);
  perto(comExtras.custos.producao - semExtras.custos.producao, 1, '100 g a R$ 10/kg');
});

test('extras passam a contar no peso — a mudança pedida nesta rodada', () => {
  const r = calcular(migrarEntradas({ ...V1, extras: 100 }));
  assert.equal(r.pao.massaTotal, 1120, 'a massa continua a mesma');
  assert.equal(r.pao.pesoTotal, 1220, 'mas o peso total agora soma os sólidos');
  perto(r.pao.pesoAssado, 548.4, 'e o pão sai mais pesado');
});

test('extras zerados não criam sólido nenhum', () => {
  assert.deepEqual(migrarEntradas(V1).solidos, []);
});

test('os campos antigos de preço e percentual somem depois da migração', () => {
  const migrada = migrarEntradas(V1);
  for (const morto of ['pctIntegral', 'pctCenteio', 'pctMelado', 'extras', 'precoFarinha', 'precoIntegral', 'precoCenteio', 'precoMelado', 'precoExtras']) {
    assert.equal(migrada[morto], undefined, `${morto} deveria ter sumido`);
  }
});

// ---------------------------------------------------------------------------
// Robustez
// ---------------------------------------------------------------------------

test('entradas que já estão em v2 passam intactas', () => {
  const v2 = migrarEntradas(V1);
  assert.deepEqual(migrarEntradas(v2), v2);
});

test('migrar duas vezes dá o mesmo que migrar uma', () => {
  assert.deepEqual(migrarEntradas(migrarEntradas(V1)), migrarEntradas(V1));
});

test('receita v1 incompleta ganha os padrões que faltam', () => {
  const migrada = migrarEntradas({ hidratacao: 0.8 });
  assert.equal(migrada.hidratacao, 0.8, 'o que veio é respeitado');
  assert.equal(migrada.pctSal, 0.02, 'o que faltou vira padrão');
  assert.equal(migrada.farinhas.length, 3, 'catálogo criado');
});

test('número de pães zero não faz a conversão de extras dividir por zero', () => {
  const migrada = migrarEntradas({ ...V1, extras: 100, numeroPaes: 0 });
  assert.ok(Number.isFinite(migrada.solidos[0]?.gramasPorPao ?? 0), 'sem Infinity');
});

// ---------------------------------------------------------------------------
// Estado inteiro: receitas e retratos do diário
// ---------------------------------------------------------------------------

test('migrarEstado converte receitas e os retratos guardados no diário', () => {
  const estado = {
    versao: 1,
    receitaAtivaId: 'r1',
    receitas: [{ id: 'r1', nome: 'Antiga', criadaEm: 'x', atualizadaEm: 'x', entradas: { ...V1 } }],
    registros: [{ id: 'g1', receitaId: 'r1', quando: 'x', observacao: 'oi', snapshot: { ...V1 } }],
  };

  const novo = migrarEstado(estado);

  assert.ok(Array.isArray(novo.receitas[0].entradas.farinhas), 'receita migrada');
  assert.ok(Array.isArray(novo.registros[0].snapshot.farinhas), 'retrato do diário migrado');
  assert.equal(novo.registros[0].observacao, 'oi', 'o resto do registro fica intacto');
  assert.equal(novo.versao, 2);
});

test('migrarEstado não estraga um estado que já está em v2', () => {
  const v2 = migrarEstado({
    versao: 1,
    receitaAtivaId: 'r1',
    receitas: [{ id: 'r1', nome: 'A', criadaEm: 'x', atualizadaEm: 'x', entradas: { ...V1 } }],
    registros: [],
  });
  assert.deepEqual(migrarEstado(v2), v2);
});
