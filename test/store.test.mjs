import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRADAS_PADRAO } from '../src/calc.js';
import { formatarValor, CAMPO_POR_CHAVE, ESCALAS } from '../src/campos.js';
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
  receitaAtiva,
  receitaDoRegistro,
} from '../src/store.js';

const T0 = '2026-08-01T10:00:00.000Z';
const T1 = '2026-08-08T10:00:00.000Z';
const T2 = '2026-08-15T10:00:00.000Z';

/** Troca o percentual de uma farinha dentro de uma composição. */
const comPct = (chave, farinhaId, pct) => ({
  ...ENTRADAS_PADRAO,
  [chave]: ENTRADAS_PADRAO[chave].some((c) => c.farinhaId === farinhaId)
    ? ENTRADAS_PADRAO[chave].map((c) => (c.farinhaId === farinhaId ? { ...c, pct } : c))
    : [...ENTRADAS_PADRAO[chave], { farinhaId, pct }],
});

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
  assert.equal(formatarValor(CAMPO_POR_CHAVE.precoSal, 2.5), 'R$ 2,5/kg');
  assert.equal(formatarValor(CAMPO_POR_CHAVE.etiqueta, 0.04), 'R$ 0,04');
  assert.equal(formatarValor(CAMPO_POR_CHAVE.numeroPaes, 2), '2');
});

// ---------------------------------------------------------------------------
// Diff de campos simples
// ---------------------------------------------------------------------------

test('diff é vazio quando nada mudou', () => {
  assert.deepEqual(diffEntradas(ENTRADAS_PADRAO, { ...ENTRADAS_PADRAO }), []);
});

test('diff descreve a mudança em português com os valores formatados', () => {
  const d = diffEntradas(ENTRADAS_PADRAO, { ...ENTRADAS_PADRAO, hidratacao: 0.75 });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], { chave: 'hidratacao', rotulo: 'Hidratação', de: '70%', para: '75%' });
});

test('diff lista os campos simples na ordem em que aparecem no formulário', () => {
  const d = diffEntradas(ENTRADAS_PADRAO, {
    ...ENTRADAS_PADRAO,
    precoKwh: 1,
    hidratacao: 0.75,
    numeroPaes: 3,
  });
  assert.deepEqual(d.map((x) => x.chave), ['numeroPaes', 'hidratacao', 'precoKwh']);
});

test('diff ignora ruído de ponto flutuante', () => {
  assert.deepEqual(diffEntradas(ENTRADAS_PADRAO, { ...ENTRADAS_PADRAO, hidratacao: 0.7 + 1e-12 }), []);
});

test('diff sem retrato anterior devolve vazio, não a receita inteira', () => {
  assert.deepEqual(diffEntradas(null, ENTRADAS_PADRAO), []);
});

// ---------------------------------------------------------------------------
// Diff das listas
// ---------------------------------------------------------------------------

test('percentual de farinha alterado aparece com o nome da farinha', () => {
  const d = diffEntradas(ENTRADAS_PADRAO, comPct('composicaoPao', 'f-integral', 0.2));
  assert.equal(d.length, 1);
  assert.equal(d[0].rotulo, 'Farinha integral');
  assert.equal(d[0].de, '10%');
  assert.equal(d[0].para, '20%');
});

test('mudança na composição do starter é distinguida da composição do pão', () => {
  const d = diffEntradas(ENTRADAS_PADRAO, comPct('composicaoStarter', 'f-integral', 0.1));
  assert.equal(d.length, 1);
  assert.match(d[0].rotulo, /starter/i, 'o rótulo tem que dizer que é do starter');
  assert.equal(d[0].para, '10%');
});

test('a mesma farinha nas duas composições gera dois avisos distintos', () => {
  const atual = {
    ...comPct('composicaoPao', 'f-centeio', 0.2),
    composicaoStarter: [...ENTRADAS_PADRAO.composicaoStarter, { farinhaId: 'f-centeio', pct: 0.5 }],
  };
  const d = diffEntradas(ENTRADAS_PADRAO, atual);
  assert.equal(d.filter((x) => x.rotulo === 'Farinha de centeio').length, 1, 'na massa');
  assert.equal(d.filter((x) => x.rotulo === 'Farinha de centeio no starter').length, 1, 'no pote');
});

test('centeio entrando só na massa não mexe no starter', () => {
  const d = diffEntradas(ENTRADAS_PADRAO, comPct('composicaoPao', 'f-centeio', 0.2));
  assert.equal(d.length, 1, 'uma mudança só');
  assert.equal(d[0].rotulo, 'Farinha de centeio');
  assert.equal(d[0].de, '—', 'não estava na massa');
  assert.equal(d[0].para, '20%');
});

test('farinha saindo de uma composição aparece como saída', () => {
  const anterior = comPct('composicaoPao', 'f-centeio', 0.2);
  const d = diffEntradas(anterior, ENTRADAS_PADRAO);
  const saiu = d.find((x) => x.rotulo === 'Farinha de centeio');
  assert.ok(saiu, 'a saída tem que aparecer');
  assert.equal(saiu.de, '20%');
  assert.equal(saiu.para, '—');
});

test('acrescentar farinha só ao catálogo não vira notícia no diário', () => {
  const atual = { ...ENTRADAS_PADRAO, farinhas: [...ENTRADAS_PADRAO.farinhas, { id: 'f-esp', nome: 'Espelta', preco: 15 }] };
  assert.deepEqual(diffEntradas(ENTRADAS_PADRAO, atual), [], 'só entra no diário quando for usada');
});

test('líquido acrescentado aparece, com a fração de água à parte', () => {
  const atual = {
    ...ENTRADAS_PADRAO,
    liquidos: [{ id: 'l1', nome: 'Leite', pct: 0.1, fracaoAgua: 0.87, preco: 5 }],
  };
  const d = diffEntradas(ENTRADAS_PADRAO, atual);
  assert.ok(d.some((x) => x.rotulo === 'Leite' && x.para === '10%'), 'percentual do leite');
});

test('gramas por pão de um sólido aparecem com a unidade certa', () => {
  const anterior = { ...ENTRADAS_PADRAO, solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 30, preco: 60 }] };
  const atual = { ...ENTRADAS_PADRAO, solidos: [{ id: 's1', nome: 'Nozes', gramasPorPao: 50, preco: 60 }] };
  const d = diffEntradas(anterior, atual);
  assert.equal(d.length, 1);
  assert.equal(d[0].rotulo, 'Nozes');
  assert.match(d[0].de, /30/);
  assert.match(d[0].para, /50/);
});

test('mudança de preço entra no diff, porque explica o custo mudar', () => {
  const atual = { ...ENTRADAS_PADRAO, farinhas: ENTRADAS_PADRAO.farinhas.map((f) => (f.id === 'f-branca' ? { ...f, preco: 5.2 } : f)) };
  const d = diffEntradas(ENTRADAS_PADRAO, atual);
  assert.equal(d.length, 1);
  assert.match(d[0].rotulo, /pre[çc]o/i);
  assert.equal(d[0].para, 'R$ 5,2/kg');
});

test('renomear um item não conta como alteração de valor', () => {
  const atual = { ...ENTRADAS_PADRAO, farinhas: ENTRADAS_PADRAO.farinhas.map((f) => (f.id === 'f-centeio' ? { ...f, nome: 'Centeio escuro' } : f)) };
  assert.deepEqual(diffEntradas(ENTRADAS_PADRAO, atual), []);
});

// ---------------------------------------------------------------------------
// Receitas e registros
// ---------------------------------------------------------------------------

test('receita nova nasce com as entradas padrão', () => {
  const r = novaReceita('Integral 500g', { id: 'r1', agora: T0 });
  assert.equal(r.nome, 'Integral 500g');
  assert.equal(r.entradas.hidratacao, 0.7);
  assert.equal(r.entradas.farinhas.length, 3);
});

test('receita nova não compartilha as listas com a receita de origem', () => {
  const origem = novaReceita('Origem', { id: 'r1', agora: T0 });
  const copia = novaReceita('Cópia', { id: 'r2', agora: T0, entradas: origem.entradas });
  copia.entradas.composicaoPao[1].pct = 0.5;
  copia.entradas.farinhas[0].preco = 99;
  assert.equal(origem.entradas.composicaoPao[1].pct, 0.1, 'mexer na cópia não pode afetar a origem');
  assert.equal(origem.entradas.farinhas[0].preco, 4.46, 'nem no catálogo');
});

test('registro congela um retrato das entradas, listas inclusive', () => {
  const receita = novaReceita('Padrão', { id: 'r1', agora: T0 });
  const reg = criarRegistro(receita, { observacao: 'miolo fechado' }, { id: 'g1', agora: T1 });

  receita.entradas.hidratacao = 0.8;
  receita.entradas.composicaoPao[1].pct = 0.5;

  assert.equal(reg.snapshot.hidratacao, 0.7);
  assert.equal(reg.snapshot.composicaoPao[1].pct, 0.1, 'a lista também tem que estar congelada');
  assert.equal(reg.observacao, 'miolo fechado');
});

test('registro novo nasce com todas as notas em branco, inclusive as de manuseio', () => {
  const reg = criarRegistro(novaReceita('R', { id: 'r1', agora: T0 }), {}, { id: 'g1', agora: T1 });
  for (const e of ESCALAS) {
    assert.equal(reg.notas[e.chave], null, `${e.chave} deveria existir em branco`);
  }
  assert.ok('pegajosidade' in reg.notas, 'pegajosidade');
  assert.ok('formaNoShaping' in reg.notas, 'manteve a forma');
});

test('registro antigo ganha as escalas novas em branco sem perder as que tinha', () => {
  const backup = {
    app: 'aplicativo-pao',
    versao: 3,
    receitas: [{ id: 'r1', nome: 'A', criadaEm: T0, atualizadaEm: T0, entradas: {} }],
    registros: [
      { id: 'g1', receitaId: 'r1', quando: T1, observacao: '', snapshot: {}, notas: { crescimento: 4, casca: 2 } },
    ],
    receitaAtivaId: 'r1',
  };
  const r = importar(JSON.stringify(backup));
  assert.equal(r.ok, true, r.erro);
  const notas = r.estado.registros[0].notas;
  assert.equal(notas.crescimento, 4, 'o que já existia fica');
  assert.equal(notas.casca, 2, 'o que já existia fica');
  assert.equal(notas.pegajosidade, null, 'a escala nova entra em branco');
  assert.equal(notas.formaNoShaping, null, 'a escala nova entra em branco');
});

test('as escalas de manuseio trazem os extremos escritos; as de resultado não', () => {
  const manuseio = ESCALAS.filter((e) => e.grupo === 'Manuseio e shaping');
  assert.ok(manuseio.length >= 2, 'existe um grupo de manuseio');
  for (const e of manuseio) {
    assert.equal(e.extremos?.length, 2, `${e.chave} precisa dos dois extremos, porque a escala é descritiva`);
  }
  for (const e of ESCALAS.filter((x) => x.grupo === 'Depois de assado')) {
    assert.equal(e.extremos, undefined, `${e.chave} é escala de qualidade: 5 é melhor que 1, sem ambiguidade`);
  }
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

test('duas fornadas no mesmo minuto mantêm a ordem em que foram criadas', () => {
  // O campo de data/hora tem precisão de minuto, então duas fornadas
  // registradas em seguida ficam com o mesmo `quando`. Sem desempate, a ordem
  // e — pior — a direção do diff viram sorteio.
  const estado = estadoInicial({ id: 'r1', agora: T0 });
  const receita = estado.receitas[0];
  const mesmoMinuto = '2026-08-16T01:53:00.000Z';

  const primeira = criarRegistro(receita, { quando: mesmoMinuto }, { id: 'a', agora: '2026-08-16T01:53:04.100Z' });
  receita.entradas = { ...receita.entradas, hidratacao: 0.75 };
  const segunda = criarRegistro(receita, { quando: mesmoMinuto }, { id: 'b', agora: '2026-08-16T01:53:41.900Z' });
  estado.registros = [primeira, segunda];

  assert.deepEqual(
    registrosDaReceita(estado, 'r1').map((r) => r.id),
    ['b', 'a'],
    'a mais recente primeiro, mesmo com o mesmo carimbo de minuto'
  );

  assert.deepEqual(diffDoRegistro(estado, primeira), [], 'a primeira não tem anterior');
  const d = diffDoRegistro(estado, segunda);
  assert.equal(d.length, 1, 'o diff pertence à segunda, não à primeira');
  assert.equal(d[0].de, '70%');
  assert.equal(d[0].para, '75%');
});

test('a data escrita pelo usuário manda mais que a ordem de criação', () => {
  const estado = estadoInicial({ id: 'r1', agora: T0 });
  const receita = estado.receitas[0];
  // Registrada depois, mas datada de antes — alguém anotando a fornada de ontem
  const deHoje = criarRegistro(receita, { quando: T2 }, { id: 'hoje', agora: '2026-08-15T09:00:00.000Z' });
  const deOntem = criarRegistro(receita, { quando: T1 }, { id: 'ontem', agora: '2026-08-15T09:05:00.000Z' });
  estado.registros = [deHoje, deOntem];

  assert.deepEqual(registrosDaReceita(estado, 'r1').map((r) => r.id), ['hoje', 'ontem']);
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
  assert.equal(importar(JSON.stringify({ qualquer: 'coisa' })).ok, false);
});

test('importar rejeita backup sem nenhuma receita', () => {
  assert.equal(importar(JSON.stringify({ app: 'aplicativo-pao', versao: 2, receitas: [], registros: [] })).ok, false);
});

test('importar migra um backup no formato antigo', () => {
  const backup = {
    app: 'aplicativo-pao',
    versao: 1,
    receitas: [
      { id: 'r1', nome: 'Antiga', criadaEm: T0, atualizadaEm: T0, entradas: { hidratacao: 0.8, pctIntegral: 0.2, precoFarinha: 5 } },
    ],
    registros: [{ id: 'g1', receitaId: 'r1', quando: T1, observacao: '', snapshot: { hidratacao: 0.7, pctIntegral: 0.1 } }],
    receitaAtivaId: 'r1',
  };
  const r = importar(JSON.stringify(backup));
  assert.equal(r.ok, true, r.erro);

  const entradas = r.estado.receitas[0].entradas;
  assert.ok(Array.isArray(entradas.farinhas), 'catálogo criado');
  assert.equal(entradas.hidratacao, 0.8);
  assert.equal(entradas.composicaoPao[1].pct, 0.2, 'integral migrada');
  assert.equal(entradas.farinhas[0].preco, 5, 'preço migrado');
  assert.ok(Array.isArray(r.estado.registros[0].snapshot.composicaoPao), 'retrato migrado');
});

test('importar descarta registros órfãos de receitas que não existem', () => {
  const backup = {
    app: 'aplicativo-pao',
    versao: 3,
    receitas: [{ id: 'r1', nome: 'A', criadaEm: T0, atualizadaEm: T0, entradas: {} }],
    registros: [
      { id: 'g1', receitaId: 'r1', quando: T1, observacao: '', snapshot: {} },
      { id: 'g2', receitaId: 'sumida', quando: T1, observacao: '', snapshot: {} },
    ],
    receitaAtivaId: 'r1',
  };
  const r = importar(JSON.stringify(backup));
  assert.deepEqual(r.estado.registros.map((x) => x.id), ['g1']);
});

test('importar conserta receita ativa apontando para receita inexistente', () => {
  const backup = {
    app: 'aplicativo-pao',
    versao: 3,
    receitas: [{ id: 'r1', nome: 'A', criadaEm: T0, atualizadaEm: T0, entradas: {} }],
    registros: [],
    receitaAtivaId: 'sumida',
  };
  assert.equal(importar(JSON.stringify(backup)).estado.receitaAtivaId, 'r1');
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

test('campo de opções é formatado pelo rótulo, não pelo número', () => {
  const campo = CAMPO_POR_CHAVE.formato;
  assert.equal(campo.tipo, 'opcoes');
  assert.equal(formatarValor(campo, 'batard'), 'Batard');
  assert.equal(formatarValor(campo, 'retangular'), 'Fôrma retangular');
  assert.equal(formatarValor(campo, 'inventado'), '—', 'opção desconhecida');
  assert.equal(formatarValor(campo, null), '—', 'ausente');
});

test('o volume específico é formatado com a unidade', () => {
  assert.equal(formatarValor(CAMPO_POR_CHAVE.volumeEspecifico, 2.7), '2,7 cm³/g');
});

test('trocar de formato aparece no diff, com os rótulos', () => {
  const mudancas = diffEntradas(
    { ...ENTRADAS_PADRAO, formato: 'batard' },
    { ...ENTRADAS_PADRAO, formato: 'boule' }
  );
  const linha = mudancas.find((m) => m.chave === 'formato');
  assert.ok(linha, 'a troca de formato entrou no diff');
  assert.equal(linha.rotulo, 'Formato');
  assert.equal(linha.de, 'Batard');
  assert.equal(linha.para, 'Boule');
});

test('formato igual não polui o diff', () => {
  const mudancas = diffEntradas(
    { ...ENTRADAS_PADRAO, formato: 'boule', hidratacao: 0.7 },
    { ...ENTRADAS_PADRAO, formato: 'boule', hidratacao: 0.75 }
  );
  assert.equal(mudancas.filter((m) => m.chave === 'formato').length, 0);
});

test('o registro guarda a altura medida, e nulo quando não foi medida', () => {
  const receita = novaReceita('Teste');
  assert.equal(criarRegistro(receita, {}, { agora: T0 }).alturaReal, null);
  assert.equal(criarRegistro(receita, { alturaReal: 9.4 }, { agora: T0 }).alturaReal, 9.4);
});

test('a altura medida sobrevive ao export/import', () => {
  const estado = estadoInicial();
  const receita = estado.receitas[0];
  estado.registros.push(criarRegistro(receita, { alturaReal: 9.4, pesoRealAssado: 505 }, { agora: T0 }));

  const { ok, estado: voltou } = importar(exportar(estado));
  assert.ok(ok, 'importou');
  assert.equal(voltou.registros[0].alturaReal, 9.4);
});

// Um retrato v3 sem `formato` é o que uma fornada salva antes desse campo
// existir realmente parece: `migrarEntradas` devolve v3 sem tocar, e é o
// spread de `clonarEntradas` — `{ ...ENTRADAS_PADRAO, ...base }` — quem
// preenche o buraco. Sem essa ordem, a primeira vez que o diário abrisse
// depois do upgrade mostraria "Formato: — → Batard" para todo mundo.
//
// A hidratação diferente do padrão não é enfeite: um retrato onde tudo mais
// já bate com ENTRADAS_PADRAO não distingue "buraco preenchido pelo padrão"
// de "tudo pisado pelo padrão" — as duas ordens do spread dariam o mesmo
// resultado. Com um campo que a fornada realmente tinha, só a ordem certa
// preserva a hidratação e ainda assim preenche o formato ausente.
test('fornada antiga sem formato herda o padrão sem perder os campos que já tinha', () => {
  const { formato, ...semFormato } = { ...ENTRADAS_PADRAO, hidratacao: 0.65 };
  assert.ok(!('formato' in semFormato), 'o teste só vale se a chave estiver mesmo ausente');
  assert.ok(Array.isArray(semFormato.composicaoPao), 'tem que ser v3 para migrarEntradas não mexer');

  // Não passa por novaReceita: ela mesma chama clonarEntradas e já preencheria
  // o buraco antes da hora. O que se quer exercitar é o clonarEntradas de
  // dentro de criarRegistro — o caminho real de uma fornada antiga relida.
  const receita = { id: 'r1', entradas: semFormato };
  const registro = criarRegistro(receita, {}, { id: 'g1', agora: T0 });

  assert.equal(registro.snapshot.formato, 'batard', 'formato ausente vira o padrão, não fica undefined');
  assert.equal(registro.snapshot.hidratacao, 0.65, 'campo que a fornada tinha não pode ser pisado pelo padrão');

  const mudancas = diffEntradas(registro.snapshot, ENTRADAS_PADRAO);
  assert.equal(mudancas.filter((m) => m.chave === 'formato').length, 0, 'nada de "Formato: — → Batard" na primeira leitura');
  assert.ok(mudancas.some((m) => m.chave === 'hidratacao'), 'a mudança real de hidratação continua aparecendo');
});

test('a fornada aponta para a receita dela, não para a que está aberta', () => {
  const estado = estadoInicial();
  const pao = estado.receitas[0];
  const brioche = novaReceita('Brioche');
  estado.receitas.push(brioche);

  const daBrioche = criarRegistro(brioche, { alturaReal: 9.4 }, { id: 'g1', agora: T0 });
  estado.registros.push(daBrioche);

  // O caso que o filtro "Todas" do diário expõe: a fornada é de uma receita e
  // a tela está mostrando outra.
  estado.receitaAtivaId = pao.id;
  assert.equal(receitaAtiva(estado).id, pao.id, 'a receita aberta é a outra');
  assert.equal(receitaDoRegistro(estado, daBrioche).id, brioche.id);
  assert.equal(receitaDoRegistro(estado, daBrioche).nome, 'Brioche');
});

test('fornada sem receita correspondente não aponta para lugar nenhum', () => {
  const estado = estadoInicial();
  const orfa = { ...criarRegistro(estado.receitas[0], {}, { id: 'g1', agora: T0 }), receitaId: 'sumiu' };

  // Nenhum caminho do app produz isto — apagar receita apaga as fornadas e a
  // importação filtra as órfãs — mas devolver a receita aberta por engano é
  // exatamente o defeito que esta função existe para não cometer.
  assert.equal(receitaDoRegistro(estado, orfa), null);
  assert.equal(receitaDoRegistro(estado, null), null);
  assert.equal(receitaDoRegistro(estado, undefined), null);
});

test('o registro guarda o tempo de ativação do fermento', () => {
  const receita = novaReceita('Teste');
  assert.equal(criarRegistro(receita, {}, { agora: T0 }).processo.ativacaoH, null, 'em branco vira nulo');
  assert.equal(criarRegistro(receita, { processo: { ativacaoH: 6.5 } }, { agora: T0 }).processo.ativacaoH, 6.5);
});

test('o tempo de ativação sobrevive ao export/import, e fornada antiga não inventa um', () => {
  const estado = estadoInicial();
  const receita = estado.receitas[0];
  estado.registros.push(criarRegistro(receita, { processo: { ativacaoH: 6.5, fermentacaoH: 5 } }, { id: 'g1', agora: T0 }));

  // Fornada gravada antes do campo existir: o processo dela não tem a chave.
  const antiga = criarRegistro(receita, { processo: { fermentacaoH: 4 } }, { id: 'g2', agora: T1 });
  delete antiga.processo.ativacaoH;
  estado.registros.push(antiga);

  const { ok, estado: voltou } = importar(exportar(estado));
  assert.ok(ok, 'importou');
  const porId = Object.fromEntries(voltou.registros.map((r) => [r.id, r]));
  assert.equal(porId.g1.processo.ativacaoH, 6.5);
  assert.equal(porId.g1.processo.fermentacaoH, 5, 'os outros tempos continuam inteiros');
  assert.equal(porId.g2.processo.ativacaoH, null, 'ausente vira nulo, não undefined');
  assert.equal(porId.g2.processo.fermentacaoH, 4);
});
