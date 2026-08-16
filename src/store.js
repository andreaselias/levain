/**
 * Estado do aplicativo: receitas nomeadas, diário de fornadas e persistência.
 *
 * O diff entre fornadas não é guardado — é calculado na hora, comparando o
 * retrato de uma fornada com o da anterior. Assim o dado canônico é único e
 * mudar o formato de exibição do diff melhora o histórico inteiro sem migração.
 */

import { ENTRADAS_PADRAO, LISTAS } from './calc.js';
import { CAMPOS, MOLDE, formatarValor } from './campos.js';
import { migrarEntradas, migrarEstado, VERSAO_ESTADO } from './migrar.js';

export const CHAVE_STORAGE = 'aplicativo-pao';
export const VERSAO = VERSAO_ESTADO;

/** Abaixo disto é ruído de ponto flutuante, não uma alteração do usuário. */
const TOLERANCIA_DIFF = 1e-9;

function agoraISO() {
  return new Date().toISOString();
}

function gerarId(prefixo = 'i') {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Migra o que vier em formato antigo e devolve uma cópia funda. A cópia funda
 * é obrigatória: sem ela, duas receitas acabariam apontando para a mesma lista
 * de farinhas e editar uma mudaria a outra.
 */
export function clonarEntradas(entradas) {
  // Sem entradas é receita nova, e vale o padrão do app. Com entradas é dado
  // existente, e aí sim passa pela migração — que trata ausência de campo como
  // "zero", não como "padrão".
  const base = entradas && typeof entradas === 'object' ? migrarEntradas(entradas) : ENTRADAS_PADRAO;
  const saida = { ...ENTRADAS_PADRAO, ...base };
  for (const lista of LISTAS) {
    const origem = Array.isArray(base[lista]) ? base[lista] : ENTRADAS_PADRAO[lista];
    saida[lista] = origem.map((item) => ({ ...item }));
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------------

export function novaReceita(nome, opcoes = {}) {
  const agora = opcoes.agora ?? agoraISO();
  return {
    id: opcoes.id ?? gerarId('r'),
    nome,
    criadaEm: agora,
    atualizadaEm: agora,
    entradas: clonarEntradas(opcoes.entradas),
  };
}

export function estadoInicial(opcoes = {}) {
  const receita = novaReceita(opcoes.nome ?? 'Minha receita', opcoes);
  return {
    versao: VERSAO,
    receitas: [receita],
    receitaAtivaId: receita.id,
    registros: [],
  };
}

export function receitaAtiva(estado) {
  return estado.receitas.find((r) => r.id === estado.receitaAtivaId) ?? estado.receitas[0] ?? null;
}

// ---------------------------------------------------------------------------
// Diário
// ---------------------------------------------------------------------------

export function criarRegistro(receita, dados = {}, opcoes = {}) {
  const agora = opcoes.agora ?? agoraISO();
  return {
    id: opcoes.id ?? gerarId('g'),
    receitaId: receita.id,
    quando: dados.quando ?? agora,
    observacao: dados.observacao ?? '',
    snapshot: clonarEntradas(receita.entradas),
    pesoRealAssado: dados.pesoRealAssado ?? null,
    notas: { crescimento: null, miolo: null, casca: null, acidez: null, ...(dados.notas ?? {}) },
    processo: {
      fermentacaoH: null,
      geladeiraH: null,
      temperaturaC: null,
      ...(dados.processo ?? {}),
    },
  };
}

/** Do mais recente para o mais antigo. */
export function registrosDaReceita(estado, receitaId) {
  return (estado.registros ?? [])
    .filter((r) => r.receitaId === receitaId)
    .sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
}

/**
 * Como cada lista é comparada. O primeiro atributo é o principal: é ele que
 * aparece sozinho quando um item é acrescentado ou removido.
 */
const LISTAS_DIFF = [
  {
    chave: 'farinhas',
    atributos: [
      { attr: 'pct', molde: MOLDE.pct, rotulo: (nome) => nome, pulaBase: true },
      { attr: 'pctStarter', molde: MOLDE.pct, rotulo: (nome) => `${nome} no starter`, pulaBase: true },
      { attr: 'preco', molde: MOLDE.preco, rotulo: (nome) => `${nome} (preço)` },
    ],
  },
  {
    chave: 'liquidos',
    atributos: [
      { attr: 'pct', molde: MOLDE.pct, rotulo: (nome) => nome },
      { attr: 'fracaoAgua', molde: MOLDE.fracaoAgua, rotulo: (nome) => `${nome} (água)` },
      { attr: 'preco', molde: MOLDE.preco, rotulo: (nome) => `${nome} (preço)` },
    ],
  },
  {
    chave: 'solidos',
    atributos: [
      { attr: 'gramasPorPao', molde: MOLDE.gramasPorPao, rotulo: (nome) => nome },
      { attr: 'preco', molde: MOLDE.preco, rotulo: (nome) => `${nome} (preço)` },
    ],
  },
];

function igual(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return x === y || (!Number.isFinite(x) && !Number.isFinite(y));
  return Math.abs(x - y) <= TOLERANCIA_DIFF;
}

function diffDeLista(anterior, atual, definicao, mudancas) {
  const antes = Array.isArray(anterior[definicao.chave]) ? anterior[definicao.chave] : [];
  const depois = Array.isArray(atual[definicao.chave]) ? atual[definicao.chave] : [];
  const porIdAntes = new Map(antes.map((x, i) => [x.id, { item: x, indice: i }]));
  const porIdDepois = new Map(depois.map((x, i) => [x.id, { item: x, indice: i }]));
  const principal = definicao.atributos[0];

  for (const [id, { item, indice }] of porIdDepois) {
    const anteriorItem = porIdAntes.get(id);
    if (!anteriorItem) {
      mudancas.push({
        chave: `${definicao.chave}.${id}`,
        rotulo: item.nome,
        de: '—',
        para: formatarValor(principal.molde, item[principal.attr]),
      });
      continue;
    }
    for (const a of definicao.atributos) {
      // O percentual da farinha base é calculado, não digitado: comparar o que
      // está guardado nele só produziria ruído.
      if (a.pulaBase && (indice === 0 || anteriorItem.indice === 0)) continue;
      if (igual(anteriorItem.item[a.attr], item[a.attr])) continue;
      mudancas.push({
        chave: `${definicao.chave}.${id}.${a.attr}`,
        rotulo: a.rotulo(item.nome),
        de: formatarValor(a.molde, anteriorItem.item[a.attr]),
        para: formatarValor(a.molde, item[a.attr]),
      });
    }
  }

  for (const [id, { item }] of porIdAntes) {
    if (porIdDepois.has(id)) continue;
    mudancas.push({
      chave: `${definicao.chave}.${id}`,
      rotulo: item.nome,
      de: formatarValor(principal.molde, item[principal.attr]),
      para: '—',
    });
  }
}

export function diffEntradas(anterior, atual) {
  if (!anterior || !atual) return [];
  const mudancas = [];

  for (const campo of CAMPOS) {
    const de = Number(anterior[campo.chave]);
    const para = Number(atual[campo.chave]);
    if (!Number.isFinite(de) || !Number.isFinite(para)) continue;
    if (igual(de, para)) continue;
    mudancas.push({
      chave: campo.chave,
      rotulo: campo.rotulo,
      de: formatarValor(campo, de),
      para: formatarValor(campo, para),
    });
  }

  for (const definicao of LISTAS_DIFF) diffDeLista(anterior, atual, definicao, mudancas);
  return mudancas;
}

/** O que mudou entre esta fornada e a anterior da mesma receita. */
export function diffDoRegistro(estado, registro) {
  const lista = registrosDaReceita(estado, registro.receitaId);
  const posicao = lista.findIndex((r) => r.id === registro.id);
  if (posicao === -1 || posicao === lista.length - 1) return [];
  return diffEntradas(lista[posicao + 1].snapshot, registro.snapshot);
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export function exportar(estado) {
  return JSON.stringify(
    {
      app: CHAVE_STORAGE,
      versao: VERSAO,
      exportadoEm: agoraISO(),
      receitas: estado.receitas,
      receitaAtivaId: estado.receitaAtivaId,
      registros: estado.registros,
    },
    null,
    2
  );
}

function normalizarReceita(bruta) {
  return {
    id: String(bruta.id),
    nome: String(bruta.nome ?? 'Sem nome'),
    criadaEm: bruta.criadaEm ?? agoraISO(),
    atualizadaEm: bruta.atualizadaEm ?? bruta.criadaEm ?? agoraISO(),
    entradas: clonarEntradas(bruta.entradas),
  };
}

function normalizarRegistro(bruto) {
  return {
    id: String(bruto.id ?? gerarId('g')),
    receitaId: String(bruto.receitaId),
    quando: bruto.quando ?? agoraISO(),
    observacao: String(bruto.observacao ?? ''),
    snapshot: clonarEntradas(bruto.snapshot),
    pesoRealAssado: bruto.pesoRealAssado ?? null,
    notas: { crescimento: null, miolo: null, casca: null, acidez: null, ...(bruto.notas ?? {}) },
    processo: {
      fermentacaoH: null,
      geladeiraH: null,
      temperaturaC: null,
      ...(bruto.processo ?? {}),
    },
  };
}

export function importar(texto) {
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido.' };
  }

  if (!dados || typeof dados !== 'object' || Array.isArray(dados) || !Array.isArray(dados.receitas)) {
    return { ok: false, erro: 'O arquivo não parece um backup deste aplicativo.' };
  }

  // Converte formatos antigos antes de qualquer outra coisa.
  const convertido = migrarEstado(dados);

  const receitas = convertido.receitas
    .filter((r) => r && r.id !== undefined && r.id !== null)
    .map(normalizarReceita);
  if (receitas.length === 0) {
    return { ok: false, erro: 'O backup não contém nenhuma receita.' };
  }

  const idsValidos = new Set(receitas.map((r) => r.id));
  const registros = (Array.isArray(convertido.registros) ? convertido.registros : [])
    .filter((r) => r && idsValidos.has(String(r.receitaId)))
    .map(normalizarRegistro);

  const ativa = String(convertido.receitaAtivaId ?? '');
  return {
    ok: true,
    estado: {
      versao: VERSAO,
      receitas,
      receitaAtivaId: idsValidos.has(ativa) ? ativa : receitas[0].id,
      registros,
    },
  };
}

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

/**
 * O storage é injetado para poder ser testado fora do navegador, e todo acesso
 * é protegido: navegação privada e cota estourada lançam exceção em vez de
 * falhar silenciosamente, e nenhum dos dois pode derrubar o aplicativo.
 */
export function criarPersistencia(storage, chave = CHAVE_STORAGE) {
  return {
    carregar() {
      try {
        const bruto = storage.getItem(chave);
        if (!bruto) return null;
        const resultado = importar(bruto);
        return resultado.ok ? resultado.estado : null;
      } catch {
        return null;
      }
    },
    salvar(estado) {
      try {
        storage.setItem(chave, exportar(estado));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export { gerarId };
