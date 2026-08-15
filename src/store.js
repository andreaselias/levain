/**
 * Estado do aplicativo: receitas nomeadas, diário de fornadas e persistência.
 *
 * O diff entre fornadas não é guardado — é calculado na hora, comparando o
 * retrato de uma fornada com o da anterior. Assim o dado canônico é único e
 * mudar o formato de exibição do diff melhora o histórico inteiro sem migração.
 */

import { ENTRADAS_PADRAO } from './calc.js';
import { CAMPOS, formatarValor } from './campos.js';

export const CHAVE_STORAGE = 'aplicativo-pao';
export const VERSAO = 1;

/** Abaixo disto é ruído de ponto flutuante, não uma alteração do usuário. */
const TOLERANCIA_DIFF = 1e-9;

function agoraISO() {
  return new Date().toISOString();
}

function gerarId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------------

export function novaReceita(nome, opcoes = {}) {
  const agora = opcoes.agora ?? agoraISO();
  return {
    id: opcoes.id ?? gerarId(),
    nome,
    criadaEm: agora,
    atualizadaEm: agora,
    entradas: { ...ENTRADAS_PADRAO, ...(opcoes.entradas ?? {}) },
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
    id: opcoes.id ?? gerarId(),
    receitaId: receita.id,
    quando: dados.quando ?? agora,
    observacao: dados.observacao ?? '',
    // Cópia rasa basta: entradas é um objeto plano de números.
    snapshot: { ...receita.entradas },
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

export function diffEntradas(anterior, atual) {
  if (!anterior || !atual) return [];
  const mudancas = [];
  for (const campo of CAMPOS) {
    const de = Number(anterior[campo.chave]);
    const para = Number(atual[campo.chave]);
    if (!Number.isFinite(de) || !Number.isFinite(para)) continue;
    if (Math.abs(de - para) <= TOLERANCIA_DIFF) continue;
    mudancas.push({
      chave: campo.chave,
      rotulo: campo.rotulo,
      de: formatarValor(campo, de),
      para: formatarValor(campo, para),
    });
  }
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
    entradas: { ...ENTRADAS_PADRAO, ...(bruta.entradas ?? {}) },
  };
}

function normalizarRegistro(bruto) {
  return {
    id: String(bruto.id ?? gerarId()),
    receitaId: String(bruto.receitaId),
    quando: bruto.quando ?? agoraISO(),
    observacao: String(bruto.observacao ?? ''),
    snapshot: { ...ENTRADAS_PADRAO, ...(bruto.snapshot ?? {}) },
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

  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return { ok: false, erro: 'O arquivo não parece um backup deste aplicativo.' };
  }
  if (!Array.isArray(dados.receitas)) {
    return { ok: false, erro: 'O arquivo não parece um backup deste aplicativo.' };
  }

  const receitas = dados.receitas.filter((r) => r && r.id !== undefined && r.id !== null).map(normalizarReceita);
  if (receitas.length === 0) {
    return { ok: false, erro: 'O backup não contém nenhuma receita.' };
  }

  const idsValidos = new Set(receitas.map((r) => r.id));
  const registros = (Array.isArray(dados.registros) ? dados.registros : [])
    .filter((r) => r && idsValidos.has(String(r.receitaId)))
    .map(normalizarRegistro);

  const ativa = String(dados.receitaAtivaId ?? '');
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
