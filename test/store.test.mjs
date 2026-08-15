import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRADAS_PADRAO } from '../src/calc.js';
import { formatarValor, CAMPO_POR_CHAVE } from '../src/campos.js';
import {
  estadoInicial,
  novaReceita,
  criarRegistro,
  diffEntradas,
  registrosDaReceita,
  diffDoRegistro,
  exportar,
  importar,
  criarPersistencia,
} from '../src/store.js';

const T0 = '2026-08-01T10:00:00.000Z';
const T1 = '2026-08-08T10:00:00.000Z';
const T2 = '2026-08-15T10:00:00.000Z';

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

test('percentuais são exibidos como número com vírgula, não como fração', () => {
  assert.equal(formatarValor(CAMPO_POR_CHAVE.hidratacao, 0.7), '70%');
  assert.equal(formatarValor(CAMPO_POR_CHAVE.hidratacao, 0.755), '75,5%');
  assert.equal(formatarValor(CAMPO_POR_CHAVE.pctSal, 0.02), '2%');
});

test('pesos e preços trazem a unidade junto', () => {
  assert.equal(formatarValor(CAMPO_POR_CHAVE.pesoAssadoDesejado, 500), '500 g');
  assert.equal(formatarValor(CAMPO_POR_CHAVE.precoFarinha, 4.46), 'R$ 4,46/kg');
  assert.equal(formatarValor(CAMPO_POR_CHAVE.etiqueta, 0.04), 'R$ 0,04');
  assert.equal(formatarValor(CAMPO_POR_CHAVE.numeroPaes, 2), '2');
});

// ---------------------------------------------------------------------------
// Diff entre conjuntos de parâmetros
// ---------------------------------------------------------------------------

test('diff é vazio quando nada mudou', () => {
  assert.deepEqual(diffEntradas(ENTRADAS_PADRAO, { ...ENTRADAS_PADRAO }), []);
});

test('diff descreve a mudança em português com os valores formatados', () => {
  const d = diffEntradas(ENTRADAS_PADRAO, { ...ENTRADAS_PADRAO, hidratacao: 0.75 });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], {
    chave: 'hidratacao',
    rotulo: 'Hidratação',
    de: '70%',
    para: '75%',
  });
});

test('diff lista vários campos na ordem em que aparecem no formulário', () => {
  const d = diffEntradas(ENTRADAS_PADRAO, {
    ...ENTRADAS_PADRAO,
    precoFarinha: 5,
    hidratacao: 0.75,
    numeroPaes: 3,
  });
  assert.deepEqual(d.map((x) => x.chave), ['numeroPaes', 'hidratacao', 'precoFarinha']);
});

test('diff ignora ruído de ponto flutuante', () => {
  const atual = { ...ENTRADAS_PADRAO, hidratacao: 0.7 + 1e-12 };
  assert.deepEqual(diffEntradas(ENTRADAS_PADRAO, atual), []);
});

test('diff sem retrato anterior devolve vazio, não a receita inteira', () => {
  assert.deepEqual(diffEntradas(null, ENTRADAS_PADRAO), []);
});

// ---------------------------------------------------------------------------
// Receitas e registros
// ---------------------------------------------------------------------------

test('receita nova nasce com as entradas padrão', () => {
  const r = novaReceita('Integral 500g', { id: 'r1', agora: T0 });
  assert.equal(r.nome, 'Integral 500g');
  assert.equal(r.entradas.hidratacao, 0.7);
  assert.equal(r.criadaEm, T0);
});

test('receita nova aceita entradas iniciais', () => {
  const r = novaReceita('Centeio', { id: 'r1', agora: T0, entradas: { pctCenteio: 0.3 } });
  assert.equal(r.entradas.pctCenteio, 0.3);
  assert.equal(r.entradas.hidratacao, 0.7, 'o resto continua padrão');
});

test('registro congela um retrato das entradas no momento da fornada', () => {
  const receita = novaReceita('Padrão', { id: 'r1', agora: T0 });
  const reg = criarRegistro(receita, { observacao: 'miolo fechado' }, { id: 'g1', agora: T1 });

  receita.entradas.hidratacao = 0.8; // mexer na receita depois não pode afetar o registro

  assert.equal(reg.snapshot.hidratacao, 0.7);
  assert.equal(reg.observacao, 'miolo fechado');
  assert.equal(reg.receitaId, 'r1');
  assert.equal(reg.quando, T1);
});

test('registros de uma receita vêm do mais recente para o mais antigo', () => {
  const estado = estadoInicial({ id: 'r1', agora: T0 });
  const receita = estado.receitas[0];
  estado.registros = [
    criarRegistro(receita, {}, { id: 'a', agora: T0 }),
    criarRegistro(receita, {}, { id: 'c', agora: T2 }),
    criarRegistro(receita, {}, { id: 'b', agora: T1 }),
  ];
  assert.deepEqual(registrosDaReceita(estado, 'r1').map((r) => r.id), ['c', 'b', 'a']);
});

test('registros de outras receitas não se misturam', () => {
  const estado = estadoInicial({ id: 'r1', agora: T0 });
  const outra = novaReceita('Outra', { id: 'r2', agora: T0 });
  estado.receitas.push(outra);
  estado.registros = [
    criarRegistro(estado.receitas[0], {}, { id: 'a', agora: T0 }),
    criarRegistro(outra, {}, { id: 'b', agora: T1 }),
  ];
  assert.deepEqual(registrosDaReceita(estado, 'r1').map((r) => r.id), ['a']);
});

test('diff do registro compara com o registro anterior da mesma receita', () => {
  const estado = estadoInicial({ id: 'r1', agora: T0 });
  const receita = estado.receitas[0];
  const primeiro = criarRegistro(receita, {}, { id: 'a', agora: T0 });
  receita.entradas = { ...receita.entradas, hidratacao: 0.75 };
  const segundo = criarRegistro(receita, {}, { id: 'b', agora: T1 });
  estado.registros = [primeiro, segundo];

  assert.deepEqual(diffDoRegistro(estado, primeiro), [], 'o primeiro não tem com o que comparar');
  const d = diffDoRegistro(estado, segundo);
  assert.equal(d.length, 1);
  assert.equal(d[0].chave, 'hidratacao');
  assert.equal(d[0].de, '70%');
  assert.equal(d[0].para, '75%');
});

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

test('exportar e importar preserva receitas e registros', () => {
  const estado = estadoInicial({ id: 'r1', agora: T0 });
  estado.registros = [criarRegistro(estado.receitas[0], { observacao: 'boa' }, { id: 'a', agora: T1 })];

  const resultado = importar(exportar(estado));

  assert.equal(resultado.ok, true, resultado.erro);
  assert.deepEqual(resultado.estado, estado);
});

test('importar rejeita texto que não é JSON', () => {
  const r = importar('isto não é json {');
  assert.equal(r.ok, false);
  assert.match(r.erro, /json/i);
});

test('importar rejeita JSON válido que não é um backup do app', () => {
  const r = importar(JSON.stringify({ qualquer: 'coisa' }));
  assert.equal(r.ok, false);
  assert.ok(r.erro.length > 0);
});

test('importar rejeita backup sem nenhuma receita', () => {
  const r = importar(JSON.stringify({ app: 'aplicativo-pao', versao: 1, receitas: [], registros: [] }));
  assert.equal(r.ok, false);
});

test('importar preenche entradas que faltam com os valores padrão', () => {
  const backup = {
    app: 'aplicativo-pao',
    versao: 1,
    receitas: [{ id: 'r1', nome: 'Antiga', criadaEm: T0, atualizadaEm: T0, entradas: { hidratacao: 0.8 } }],
    registros: [],
    receitaAtivaId: 'r1',
  };
  const r = importar(JSON.stringify(backup));
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.estado.receitas[0].entradas.hidratacao, 0.8);
  assert.equal(r.estado.receitas[0].entradas.pctSal, ENTRADAS_PADRAO.pctSal, 'campo ausente ganha o padrão');
});

test('importar descarta registros órfãos de receitas que não existem', () => {
  const backup = {
    app: 'aplicativo-pao',
    versao: 1,
    receitas: [{ id: 'r1', nome: 'A', criadaEm: T0, atualizadaEm: T0, entradas: {} }],
    registros: [
      { id: 'g1', receitaId: 'r1', quando: T1, observacao: '', snapshot: {} },
      { id: 'g2', receitaId: 'sumida', quando: T1, observacao: '', snapshot: {} },
    ],
    receitaAtivaId: 'r1',
  };
  const r = importar(JSON.stringify(backup));
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual(r.estado.registros.map((x) => x.id), ['g1']);
});

test('importar conserta receita ativa apontando para receita inexistente', () => {
  const backup = {
    app: 'aplicativo-pao',
    versao: 1,
    receitas: [{ id: 'r1', nome: 'A', criadaEm: T0, atualizadaEm: T0, entradas: {} }],
    registros: [],
    receitaAtivaId: 'sumida',
  };
  const r = importar(JSON.stringify(backup));
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.estado.receitaAtivaId, 'r1');
});

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

function storageFalso() {
  const dados = new Map();
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  };
}

test('salvar e carregar devolve o mesmo estado', () => {
  const storage = storageFalso();
  const p = criarPersistencia(storage);
  const estado = estadoInicial({ id: 'r1', agora: T0 });

  p.salvar(estado);

  assert.deepEqual(p.carregar(), estado);
});

test('carregar sem nada guardado devolve null', () => {
  assert.equal(criarPersistencia(storageFalso()).carregar(), null);
});

test('carregar dado corrompido devolve null em vez de estourar', () => {
  const storage = storageFalso();
  storage.setItem('aplicativo-pao', '{lixo');
  assert.equal(criarPersistencia(storage).carregar(), null);
});

test('salvar com storage indisponível não estoura', () => {
  const quebrado = {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('cota estourada'); },
    removeItem: () => {},
  };
  const p = criarPersistencia(quebrado);
  assert.equal(p.salvar(estadoInicial({ id: 'r1', agora: T0 })), false);
  assert.equal(p.carregar(), null);
});
