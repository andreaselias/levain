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
  assert.equal(gramas(pao.farinhas, 'Farinha de centeio'), undefined, 'estava em 0%, saiu da composição');
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
  const { composicaoStarter } = migrarEntradas(V1);
  assert.deepEqual(composicaoStarter, [{ farinhaId: 'f-branca', pct: 0 }], 'só a base');

  const r = calcular(migrarEntradas(V1));
  perto(gramas(r.starter.farinhas, 'Farinha branca'), 60, 'toda a farinha do starter é branca');
  assert.equal(gramas(r.starter.farinhas, 'Farinha integral'), undefined, 'nada de integral');
});

// ---------------------------------------------------------------------------
// Conversões
// ---------------------------------------------------------------------------

test('as três farinhas viram catálogo com nome e preço preservados', () => {
  const { farinhas } = migrarEntradas({ ...V1, pctIntegral: 0.15, pctCenteio: 0.05 });
  assert.deepEqual(
    farinhas.map((f) => [f.nome, f.preco]),
    [
      ['Farinha branca', 4.46],
      ['Farinha integral', 11],
      ['Farinha de centeio', 9],
    ]
  );
});

test('a composição da massa recebe só as farinhas que estavam em uso', () => {
  const { composicaoPao } = migrarEntradas({ ...V1, pctIntegral: 0.15, pctCenteio: 0.05 });
  assert.deepEqual(composicaoPao, [
    { farinhaId: 'f-branca', pct: 0 },
    { farinhaId: 'f-integral', pct: 0.15 },
    { farinhaId: 'f-centeio', pct: 0.05 },
  ]);
});

test('farinha zerada em v1 fica só no catálogo, fora da composição', () => {
  const migrada = migrarEntradas(V1); // centeio em 0%
  assert.equal(migrada.farinhas.length, 3, 'continua no catálogo');
  assert.deepEqual(
    migrada.composicaoPao.map((c) => c.farinhaId),
    ['f-branca', 'f-integral'],
    'centeio fora da composição'
  );
});

test('pães por fornada ganha o padrão de dois em receita antiga', () => {
  assert.equal(migrarEntradas(V1).paesPorFornada, 2);
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

test('entradas já no formato atual passam intactas', () => {
  const atual = migrarEntradas(V1);
  assert.deepEqual(migrarEntradas(atual), atual);
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

// ---------------------------------------------------------------------------
// v2 → v3: participação sai de dentro do item do catálogo
// ---------------------------------------------------------------------------

const V2 = {
  ...Object.fromEntries(Object.entries(V1).filter(([k]) => !k.startsWith('pct') || k === 'pctStarter' || k === 'pctSal')),
  hidratacao: 0.7,
  farinhas: [
    { id: 'f-branca', nome: 'Farinha branca', preco: 4.46, pct: 0, pctStarter: 0 },
    { id: 'f-integral', nome: 'Farinha integral', preco: 11, pct: 0.1, pctStarter: 0.1 },
    { id: 'f-centeio', nome: 'Farinha de centeio', preco: 9, pct: 0, pctStarter: 0 },
  ],
  liquidos: [{ id: 'l1', nome: 'Azeite', pct: 0.04, fracaoAgua: 0, preco: 40 }],
  solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 40, preco: 60 }],
};

test('v2 vira v3 produzindo os números que v2 produzia', () => {
  // Conferidos à mão a partir da semântica de v2: farinha total 580, integral a
  // 10% na massa E no starter, azeite 4%, nozes 40 g por pão.
  const r = calcular(migrarEntradas(V2));
  assert.equal(r.pao.farinhaTotal, 580);
  assert.equal(gramas(r.pao.farinhas, 'Farinha branca'), 520);
  assert.equal(gramas(r.pao.farinhas, 'Farinha integral'), 60);
  assert.equal(r.pao.agua, 390);
  assert.equal(r.pao.massaTotal, 1120);
  perto(gramas(r.starter.farinhas, 'Farinha integral'), 6, '10% dos 60 g do starter');
  perto(r.custos.producao, 13.866545, 'custo da produção');
});

test('v2 separa a participação nas duas composições', () => {
  const m = migrarEntradas(V2);
  assert.deepEqual(m.composicaoPao, [
    { farinhaId: 'f-branca', pct: 0 },
    { farinhaId: 'f-integral', pct: 0.1 },
  ]);
  assert.deepEqual(m.composicaoStarter, [
    { farinhaId: 'f-branca', pct: 0 },
    { farinhaId: 'f-integral', pct: 0.1 },
  ]);
  assert.equal(m.farinhas[0].pct, undefined, 'o catálogo perde a participação');
});

test('v2 mantém líquidos e sólidos como estavam', () => {
  const m = migrarEntradas(V2);
  assert.equal(m.liquidos[0].nome, 'Azeite');
  assert.equal(m.solidos[0].gramasPorPao, 40);
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
  assert.equal(novo.versao, 4);
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

// ---------------------------------------------------------------------------
// Formato e volume específico: entradas novas, sem equivalente em v1/v2
// ---------------------------------------------------------------------------

test('estado antigo ganha os padrões de formato e crescimento', () => {
  const migrado = migrarEntradas(V1);
  assert.equal(migrado.formato, 'batard', 'formato padrão');
  perto(migrado.volumeEspecifico, 2.7, 'volume específico padrão');
});

test('migração preserva o formato já escolhido, sem virar número', () => {
  const migrado = migrarEntradas({ ...V1, formato: 'boule', volumeEspecifico: 2.2 });
  assert.equal(migrado.formato, 'boule');
  perto(migrado.volumeEspecifico, 2.2, 'volume específico preservado');
});

// ---------------------------------------------------------------------------
// v3 → v4: as três proporções viram incremento + hidratação do ativado
// ---------------------------------------------------------------------------

const ENTRADAS_V3_BASE = {
  pesoAssadoDesejado: 500,
  numeroPaes: 2,
  hidratacao: 0.7,
  pctStarter: 0.2,
  pctSal: 0.02,
  farinhas: [
    { id: 'f-branca', nome: 'Farinha branca', preco: 4.46 },
    { id: 'f-integral', nome: 'Farinha integral', preco: 11 },
  ],
  composicaoPao: [
    { farinhaId: 'f-branca', pct: 0 },
    { farinhaId: 'f-integral', pct: 0.1 },
  ],
  composicaoStarter: [{ farinhaId: 'f-branca', pct: 0 }],
  liquidos: [],
  solidos: [],
  fatorArredondamento: 10,
  perdaForno: 0.11,
  volumeEspecifico: 2.7,
  formato: 'batard',
  paesPorFornada: 2,
  tempoPreAquecimento: 45,
  tempoCozimento: 40,
  hidratacaoMae: 1,
  propAtivacaoStarter: 1,
  propAtivacaoFarinha: 3,
  propAtivacaoAgua: 3,
  arredondamentoAtivacao: 1,
  precoSal: 2.5,
  precoKwh: 0.8653,
  potenciaForno: 0.6,
  embalagemExterna: 1.44,
  embalagemInterna: 0.63,
  etiqueta: 0.04,
};

/** Uma receita v3 completa, com as proporções que o formato guardava. */
const v3 = (proporcoes) => ({ ...ENTRADAS_V3_BASE, ...proporcoes });

/**
 * Retratos tirados com o motor ANTIGO, antes da reparametrização, rodando as
 * proporções de cada caso. São o critério de aceitação da migração: se algum
 * número destes mudar, a conversão não foi exata e receitas salvas de gente de
 * verdade mudaram sozinhas.
 */
const OURO_V3 = [
  {
    prop: { propAtivacaoStarter: 1, propAtivacaoFarinha: 3, propAtivacaoAgua: 3 },
    p: 6, hAlvo: 1,
    mae: 20, far: 60, ag: 60, total: 140, sobra: 20, paoAgua: 400,
  },
  {
    prop: { propAtivacaoStarter: 1, propAtivacaoFarinha: 3, propAtivacaoAgua: 2.55, hidratacaoMae: 0.85 },
    p: 5.55, hAlvo: 0.85,
    mae: 22, far: 66, ag: 56, total: 144, sobra: 24, paoAgua: 400,
  },
  {
    prop: { propAtivacaoStarter: 3, propAtivacaoFarinha: 5, propAtivacaoAgua: 5 },
    p: 10 / 3, hAlvo: 1,
    mae: 36, far: 60, ag: 60, total: 156, sobra: 36, paoAgua: 400,
  },
  {
    prop: { propAtivacaoStarter: 1, propAtivacaoFarinha: 2, propAtivacaoAgua: 2 },
    p: 4, hAlvo: 1,
    mae: 30, far: 60, ag: 60, total: 150, sobra: 30, paoAgua: 400,
  },
  {
    prop: { propAtivacaoStarter: 2, propAtivacaoFarinha: 6, propAtivacaoAgua: 4, hidratacaoMae: 1.2 },
    p: 5, hAlvo: 0.7368421053,
    mae: 24, far: 72, ag: 48, total: 144, sobra: 24, paoAgua: 410,
  },
];

test('a migração v3 → v4 não muda um grama', () => {
  for (const ouro of OURO_V3) {
    const migrada = migrarEntradas(v3(ouro.prop));
    const rotulo = JSON.stringify(ouro.prop);

    // As chaves mortas somem, as novas chegam com o valor convertido.
    assert.ok(!('propAtivacaoFarinha' in migrada), `${rotulo}: proporção antiga apagada`);
    assert.ok(!('propAtivacaoStarter' in migrada), `${rotulo}: proporção antiga apagada`);
    assert.ok(!('propAtivacaoAgua' in migrada), `${rotulo}: proporção antiga apagada`);
    perto(migrada.propIncremento, ouro.p, `${rotulo}: incremento`);
    perto(migrada.hidratacaoAtivado, ouro.hAlvo, `${rotulo}: hidratação do ativado`);

    // E o que importa de verdade: o ticket e a massa saem iguais aos do motor
    // antigo.
    const r = calcular(migrada);
    assert.equal(r.starter.maeParaAtivar, ouro.mae, `${rotulo}: starter-mãe`);
    assert.equal(r.starter.farinhaAtivar, ouro.far, `${rotulo}: farinha da ativação`);
    assert.equal(r.starter.aguaAtivar, ouro.ag, `${rotulo}: água da ativação`);
    assert.equal(r.starter.totalAtivado, ouro.total, `${rotulo}: total ativado`);
    assert.equal(r.starter.sobra, ouro.sobra, `${rotulo}: volta ao pote`);
    assert.equal(r.pao.agua, ouro.paoAgua, `${rotulo}: água da massa`);
    assert.equal(r.pao.starter, 120, `${rotulo}: starter na massa`);
    assert.equal(r.pao.farinhaTotal, 590, `${rotulo}: farinha total`);
  }
});

test('migrar duas vezes dá o mesmo que migrar uma', () => {
  const uma = migrarEntradas(v3({ propAtivacaoStarter: 1, propAtivacaoFarinha: 3, propAtivacaoAgua: 2.55 }));
  const duas = migrarEntradas(uma);
  assert.deepEqual(duas, uma, 'a migração é idempotente');
});

test('v3 com proporção de starter zerada cai no padrão sem NaN', () => {
  const migrada = migrarEntradas(v3({ propAtivacaoStarter: 0, propAtivacaoFarinha: 3, propAtivacaoAgua: 3 }));
  assert.ok(Number.isFinite(migrada.propIncremento), 'incremento finito');
  assert.ok(Number.isFinite(migrada.hidratacaoAtivado), 'hidratação finita');
  const r = calcular(migrada);
  assert.ok(Number.isFinite(r.pao.agua), 'a conta sobrevive');
});

// Antes, v1 e v2 caíam em `escalares`, que só copia chaves presentes no padrão:
// uma receita antiga com proporção 1:4:4 perdia o 4:4 e virava o 3:3 do padrão
// em silêncio. A conversão tem que valer nos três formatos.
test('v1 com proporções fora do padrão também converte', () => {
  const migrada = migrarEntradas({
    ...V1,
    propAtivacaoStarter: 1,
    propAtivacaoFarinha: 4,
    propAtivacaoAgua: 4,
  });
  perto(migrada.propIncremento, 8, 'v1 converte o incremento');
  // 1:4:4 com a mãe a 100% dá (4 + 0,5) / (4 + 0,5) = 1.
  perto(migrada.hidratacaoAtivado, 1, 'v1 converte a hidratação');
  assert.ok(!('propAtivacaoAgua' in migrada), 'a chave antiga não sobrevive');
});

// Mesmo buraco do v1: `escalares` só copia chave que existe no padrão, e as
// três proporções saíram dele. Sem o conversor em `deV2`, uma receita v2 com
// 1:4:4 viraria o 1:3:3 do padrão sem dizer nada.
test('v2 com proporções fora do padrão também converte', () => {
  const migrada = migrarEntradas({
    ...V2,
    propAtivacaoStarter: 1,
    propAtivacaoFarinha: 4,
    propAtivacaoAgua: 4,
  });
  perto(migrada.propIncremento, 8, 'v2 converte o incremento');
  perto(migrada.hidratacaoAtivado, 1, 'v2 converte a hidratação');
  assert.ok(!('propAtivacaoAgua' in migrada), 'a chave antiga não sobrevive');
});

/**
 * A conversão é exata em quase toda a faixa realista, mas não em toda. Onde o
 * valor exato pré-arredondamento cai em cima de um empate do passo da balança,
 * um erro de última casa decide o empate para o outro lado e a ativação sai um
 * passo diferente da que saía antes.
 *
 * A lista abaixo é o conjunto COMPLETO dessas divergências na faixa varrida,
 * congelado de propósito: o teste falha tanto se aparecer uma nova quanto se
 * alguma sumir sem explicação. Zero não é alcançável — ver o registro no plano.
 */
const DIVERGENCIAS_CONHECIDAS = [
  '2:5:1 mãe 0.75 starter 0.2 passo 0.2',
  '3:3:1 mãe 1.75 starter 0.1 passo 2',
  '4:3:1 mãe 1.75 starter 0.3 passo 5',
  '3:1:1 mãe 1.75 starter 0.25 passo 10',
  '3:1:1 mãe 2 starter 0.25 passo 10',
  '3:1:1 mãe 2 starter 0.3 passo 10',
  '4:1:1 mãe 1.25 starter 0.3 passo 10',
  '4:1:1 mãe 1.75 starter 0.3 passo 10',
];

test('a migração muda de número só nas divergências já conhecidas', () => {
  const p15 = (x) => (!Number.isFinite(x) || x === 0 ? x : Number(x.toPrecision(15)));
  const excelRound = (x) => { const v = p15(x); return v < 0 ? -Math.round(-v) : Math.round(v); };
  const roundUp = (x) => { const v = p15(x); return v < 0 ? -Math.ceil(-v) : Math.ceil(v); };
  const snapA = (x, s) => (s > 0 ? excelRound(x / s) * s : x);

  const achadas = [];
  let paoDivergiu = 0;
  for (const passo of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25]) {
    for (const rSt of [1, 2, 3, 4]) {
      for (const rFl of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (const rWa of [1, 2, 3, 4, 5, 6, 7, 8]) {
          for (const hMae of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
            for (const pctStarter of [0.1, 0.2, 0.25, 0.3, 0.35]) {
              const antigas = {
                propAtivacaoStarter: rSt,
                propAtivacaoFarinha: rFl,
                propAtivacaoAgua: rWa,
                hidratacaoMae: hMae,
                pctStarter,
                arredondamentoAtivacao: passo,
              };
              const r = calcular(migrarEntradas(v3(antigas)));
              const mae = roundUp((r.pao.starter * rSt) / (rFl + rWa));
              if (
                r.starter.maeParaAtivar !== mae ||
                r.starter.farinhaAtivar !== snapA((mae * rFl) / rSt, passo) ||
                r.starter.aguaAtivar !== snapA((mae * rWa) / rSt, passo)
              ) {
                achadas.push(`${rSt}:${rFl}:${rWa} mãe ${hMae} starter ${pctStarter} passo ${passo}`);
              }
              // A massa nunca pode divergir: a exceção é só do que se pesa
              // para alimentar o pote. 400 só vale para o starter em 20% —
              // pctStarter muda pao.agua por conta própria, não por divergência.
              if (r.pao.agua !== 400 && rSt === 1 && rFl === 3 && rWa === 3 && hMae === 1 && pctStarter === 0.2) paoDivergiu++;
            }
          }
        }
      }
    }
  }
  assert.deepEqual(achadas, DIVERGENCIAS_CONHECIDAS, 'o conjunto de divergências mudou');
  assert.equal(paoDivergiu, 0, 'a massa não pode divergir em nenhum caso');
});
