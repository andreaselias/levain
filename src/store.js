/**
 * Estado do aplicativo: receitas nomeadas, diário de fornadas e persistência.
 *
 * O diff entre fornadas não é guardado — é calculado na hora, comparando o
 * retrato de uma fornada com o da anterior. Assim o dado canônico é único e
 * mudar o formato de exibição do diff melhora o histórico inteiro sem migração.
 */

import { ENTRADAS_PADRAO, LISTAS } from './calc.js';
import { CAMPOS, MOLDE, formatarValor, notasEmBranco } from './campos.js';
import { migrarEntradas, migrarEstado, VERSAO_ESTADO } from './migrar.js';

export const CHAVE_STORAGE = 'aplicativo-pao';
export const VERSAO = VERSAO_ESTADO;

/** Abaixo disto é ruído de ponto flutuante, não uma alteração do usuário. */
const TOLERANCIA_DIFF = 1e-9;

function agoraISO() {
  return new Date().toISOString();
}

export function gerarId(prefixo = 'i') {
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

/**
 * A receita a que uma fornada pertence — que não é necessariamente a que está
 * aberta na tela. Com o filtro do diário em "Todas", o cartão de qualquer
 * receita aparece, e quem age sobre esse cartão tem que agir sobre a receita
 * dele. Devolve `null` como `receitaAtiva`, para as duas terem o mesmo
 * contrato de "não achei" — os chamadores de hoje tratariam `undefined` igual.
 */
export function receitaDoRegistro(estado, registro) {
  return estado.receitas.find((r) => r.id === registro?.receitaId) ?? null;
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
    // `quando` é editável e o campo de data/hora só tem precisão de minuto, então
    // duas fornadas seguidas empatam. `criadoEm` guarda o instante real e serve
    // de desempate — sem ele a ordem, e com ela a direção do diff, viram sorteio.
    criadoEm: agora,
    observacao: dados.observacao ?? '',
    snapshot: clonarEntradas(receita.entradas),
    pesoRealAssado: dados.pesoRealAssado ?? null,
    alturaReal: dados.alturaReal ?? null,
    notas: { ...notasEmBranco(), ...(dados.notas ?? {}) },
    // Na ordem da linha do tempo: alimenta o starter, mistura, fermenta, gela.
    processo: {
      ativacaoH: null,
      fermentacaoH: null,
      geladeiraH: null,
      temperaturaC: null,
      ...(dados.processo ?? {}),
    },
  };
}

/** Do mais recente para o mais antigo, desempatando pela ordem de criação. */
export function registrosDaReceita(estado, receitaId) {
  const maisRecentePrimeiro = (a, b) => {
    if (a.quando !== b.quando) return a.quando < b.quando ? 1 : -1;
    const criadoA = a.criadoEm ?? a.quando;
    const criadoB = b.criadoEm ?? b.quando;
    return criadoA < criadoB ? 1 : criadoA > criadoB ? -1 : 0;
  };
  return (estado.registros ?? []).filter((r) => r.receitaId === receitaId).sort(maisRecentePrimeiro);
}

/**
 * Como cada lista é comparada. O primeiro atributo é o principal: é ele que
 * aparece sozinho quando um item é acrescentado ou removido.
 */
const LISTAS_DIFF = [
  {
    chave: 'farinhas',
    // O catálogo guarda só nome e preço. Entrar e sair do catálogo não é
    // notícia — o que importa é entrar e sair de uma composição.
    semEntradaSaida: true,
    atributos: [{ attr: 'preco', molde: MOLDE.preco, rotulo: (nome) => `${nome} (preço)` }],
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
      if (definicao.semEntradaSaida) continue;
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

  if (definicao.semEntradaSaida) return;
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

/**
 * As composições apontam para o catálogo por id, então o rótulo do diff vem
 * de lá. Entrar e sair de uma composição é a notícia principal: é o que
 * significa "passei a usar centeio na massa".
 */
function diffDeComposicao(anterior, atual, chave, sufixo, mudancas) {
  const nomeDe = (entradas, id) => entradas.farinhas?.find((f) => f.id === id)?.nome ?? 'Farinha';
  const mapear = (lista) =>
    new Map((Array.isArray(lista) ? lista : []).map((c, i) => [c.farinhaId, { pct: c.pct, indice: i }]));
  const antes = mapear(anterior[chave]);
  const depois = mapear(atual[chave]);

  for (const [id, agora] of depois) {
    const rotulo = `${nomeDe(atual, id)}${sufixo}`;
    const antigo = antes.get(id);
    if (!antigo) {
      mudancas.push({ chave: `${chave}.${id}`, rotulo, de: '—', para: formatarValor(MOLDE.pct, agora.pct) });
      continue;
    }
    // Base é calculada, não digitada.
    if (agora.indice === 0 || antigo.indice === 0) continue;
    if (igual(antigo.pct, agora.pct)) continue;
    mudancas.push({
      chave: `${chave}.${id}`,
      rotulo,
      de: formatarValor(MOLDE.pct, antigo.pct),
      para: formatarValor(MOLDE.pct, agora.pct),
    });
  }

  for (const [id, antigo] of antes) {
    if (depois.has(id)) continue;
    mudancas.push({
      chave: `${chave}.${id}`,
      rotulo: `${nomeDe(anterior, id)}${sufixo}`,
      de: formatarValor(MOLDE.pct, antigo.pct),
      para: '—',
    });
  }
}

export function diffEntradas(anterior, atual) {
  if (!anterior || !atual) return [];
  const mudancas = [];

  for (const campo of CAMPOS) {
    // Campo de opções compara por identidade e é escrito pelo rótulo. O ramo
    // numérico abaixo o descartaria calado, porque 'boule' não é finito.
    if (campo.tipo === 'opcoes') {
      const de = anterior[campo.chave];
      const para = atual[campo.chave];
      if (de === para) continue;
      mudancas.push({
        chave: campo.chave,
        rotulo: campo.rotulo,
        de: formatarValor(campo, de),
        para: formatarValor(campo, para),
      });
      continue;
    }

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

  diffDeComposicao(anterior, atual, 'composicaoPao', '', mudancas);
  diffDeComposicao(anterior, atual, 'composicaoStarter', ' no starter', mudancas);
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
    criadoEm: bruto.criadoEm ?? bruto.quando ?? agoraISO(),
    observacao: String(bruto.observacao ?? ''),
    snapshot: clonarEntradas(bruto.snapshot),
    pesoRealAssado: bruto.pesoRealAssado ?? null,
    alturaReal: bruto.alturaReal ?? null,
    notas: { ...notasEmBranco(), ...(bruto.notas ?? {}) },
    processo: {
      ativacaoH: null,
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
