/**
 * Interface: quatro abas sobre um motor de cálculo só.
 *
 * Regra de renderização: apenas o painel ativo existe no DOM. Enquanto o
 * usuário digita, nada é reconstruído — só os nós marcados com `data-saida`
 * recebem texto novo. É o que impede o campo de perder o foco a cada tecla.
 */

import { calcular, calibrarPerda, ENTRADAS_PADRAO } from './calc.js';
import { CAMPOS, CAMPO_POR_CHAVE, formatarEntrada, formatarValor, paraArmazenamento } from './campos.js';
import { criarPersistencia, criarRegistro, diffDoRegistro, estadoInicial, exportar, importar, novaReceita, receitaAtiva, registrosDaReceita } from './store.js';

const ABAS = [
  { id: 'starter', glifo: '🫧', rotulo: 'Starter' },
  { id: 'pao', glifo: '🍞', rotulo: 'Pão' },
  { id: 'custos', glifo: '💰', rotulo: 'Custos' },
  { id: 'diario', glifo: '📓', rotulo: 'Diário' },
];

const ESCALAS = [
  { chave: 'crescimento', rotulo: 'Crescimento' },
  { chave: 'miolo', rotulo: 'Abertura do miolo' },
  { chave: 'casca', rotulo: 'Casca' },
  { chave: 'acidez', rotulo: 'Acidez' },
];

const persistencia = criarPersistencia(
  typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
);

let estado = persistencia.carregar() ?? estadoInicial();
let abaAtiva = 'pao';
let filtroDiario = 'receita';
let temporizadorSalvar = null;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const formatadores = new Map();
function fmtNum(valor, casas) {
  if (!formatadores.has(casas)) {
    formatadores.set(
      casas,
      new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
    );
  }
  return formatadores.get(casas).format(valor);
}

function unidade(texto) {
  return `<span class="unidade">${texto}</span>`;
}

/** Converte o valor cru num pedaço de HTML já formatado, conforme o tipo. */
function formatarSaida(valor, tipo) {
  const n = Number.isFinite(valor) ? valor : 0;
  switch (tipo) {
    case 'g': return `${fmtNum(n, 0)}${unidade('g')}`;
    case 'g1': return `${fmtNum(n, 1)}${unidade('g')}`;
    case 'pct': return `${fmtNum(n * 100, 1)}${unidade('%')}`;
    case 'brl': return `${unidade('R$')}${fmtNum(n, 2)}`;
    case 'brl4': return `${unidade('R$')}${fmtNum(n, 4)}`;
    case 'cm': return `${fmtNum(n, 1)}${unidade('cm')}`;
    default: return fmtNum(n, 0);
  }
}

function caminho(objeto, rota) {
  return rota.split('.').reduce((acc, parte) => (acc == null ? acc : acc[parte]), objeto);
}

/** Aceita tanto "70,5" quanto "70.5"; ponto vira separador de milhar se houver vírgula. */
function paraNumero(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return NaN;
  const normalizado = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : NaN;
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

function dataLegivel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtData.format(d)} · ${fmtHora.format(d)}`;
}

/** Date → "AAAA-MM-DDTHH:mm" no fuso local, que é o que datetime-local espera. */
function paraCampoDataHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function salvar() {
  clearTimeout(temporizadorSalvar);
  temporizadorSalvar = setTimeout(() => persistencia.salvar(estado), 300);
}

// ---------------------------------------------------------------------------
// Blocos reutilizáveis
// ---------------------------------------------------------------------------

function linhaTicket(rotulo, rota, tipo, zeroSe) {
  return `<div class="ticket-linha${zeroSe ? ' apagada' : ''}">
    <span class="ticket-nome">${rotulo}</span>
    <span class="ticket-pontilhado"></span>
    <span class="ticket-valor" data-saida="${rota}" data-fmt="${tipo}"></span>
  </div>`;
}

function metrica(rotulo, rota, tipo, destaque) {
  return `<div class="metrica${destaque ? ' destaque' : ''}">
    <span class="rotulo">${rotulo}</span>
    <span class="valor" data-saida="${rota}" data-fmt="${tipo}"></span>
  </div>`;
}

function campoEntrada(chave, entradas) {
  const campo = CAMPO_POR_CHAVE[chave];
  const valor = formatarEntrada(campo, entradas[chave]);
  return `<div class="campo">
    <span class="campo-texto">
      <span class="campo-rotulo">${campo.rotulo}</span>
      ${campo.dica ? `<span class="campo-dica">${campo.dica}</span>` : ''}
    </span>
    <span class="campo-controle">
      <button class="passo" data-acao="passo" data-campo-alvo="${chave}" data-sinal="-1" aria-label="Diminuir ${campo.rotulo}">−</button>
      <input type="text" inputmode="decimal" data-campo="${chave}" value="${valor}" aria-label="${campo.rotulo}">
      <span class="campo-unidade">${campo.unidade === '%' ? '%' : campo.unidade.replace('R$/kg', '/kg').replace('R$', '')}</span>
      <button class="passo" data-acao="passo" data-campo-alvo="${chave}" data-sinal="1" aria-label="Aumentar ${campo.rotulo}">+</button>
    </span>
  </div>`;
}

function grupoDeCampos(aba, grupo, entradas) {
  const chaves = CAMPOS.filter((c) => c.aba === aba && c.grupo === grupo).map((c) => c.chave);
  if (chaves.length === 0) return '';
  return `<section class="secao">
    <h2 class="secao-titulo">${grupo}</h2>
    <div class="grupo">${chaves.map((k) => campoEntrada(k, entradas)).join('')}</div>
  </section>`;
}

function blocoAvisos() {
  return `<div id="avisos"></div>`;
}

// ---------------------------------------------------------------------------
// Painéis
// ---------------------------------------------------------------------------

function painelStarter(entradas) {
  return `
    <section class="secao">
      <h2 class="secao-titulo">Ativação para esta receita</h2>
      <div class="ticket">
        <div class="ticket-borda"></div>
        ${linhaTicket('Starter-mãe do pote', 'starter.maeParaAtivar', 'g')}
        ${linhaTicket('Farinha', 'starter.farinhaAtivar', 'g')}
        ${linhaTicket('Água', 'starter.aguaAtivar', 'g')}
        <div class="ticket-rodape">
          <span class="rotulo">Starter ativado</span>
          <span class="valor" data-saida="starter.totalAtivado" data-fmt="g"></span>
        </div>
      </div>
      <p class="nota-rodape">As quantidades saem da necessidade de starter da receita, arredondada para cima — por isso costuma sobrar um pouco.</p>
    </section>

    <section class="secao">
      <h2 class="secao-titulo">O que o starter carrega</h2>
      <div class="metricas">
        ${metrica('Hidratação do ativado', 'starter.hidratacaoAtivado', 'pct', true)}
        ${metrica('Sobra', 'starter.sobra', 'g')}
        ${metrica('Farinha embutida', 'starter.farinhaNoStarter', 'g1')}
        ${metrica('Água embutida', 'starter.aguaNoStarter', 'g1')}
      </div>
      <p class="nota-rodape">A farinha e a água de dentro do starter são descontadas da receita — é por isso que mexer aqui muda os pesos da aba Pão.</p>
    </section>

    ${blocoAvisos()}
    ${grupoDeCampos('starter', 'Starter-mãe', entradas)}
    ${grupoDeCampos('starter', 'Ativação', entradas)}
  `;
}

function painelPao(entradas) {
  const zero = (chave) => !(Number(entradas[chave]) > 0);
  return `
    <section class="secao">
      <h2 class="secao-titulo">Pesagem</h2>
      <div class="ticket">
        <div class="ticket-borda"></div>
        ${linhaTicket('Farinha branca', 'pao.farinhaBranca', 'g')}
        ${linhaTicket('Farinha integral', 'pao.integral', 'g', zero('pctIntegral'))}
        ${linhaTicket('Farinha de centeio', 'pao.centeio', 'g', zero('pctCenteio'))}
        ${linhaTicket('Água', 'pao.agua', 'g')}
        ${linhaTicket('Starter ativado', 'pao.starter', 'g')}
        ${linhaTicket('Sal', 'pao.sal', 'g')}
        ${linhaTicket('Melado', 'pao.melado', 'g', zero('pctMelado'))}
        <div class="ticket-rodape">
          <span class="rotulo">Peso total da massa</span>
          <span class="valor" data-saida="pao.pesoTotal" data-fmt="g"></span>
        </div>
      </div>
    </section>

    <section class="secao">
      <h2 class="secao-titulo">Resultado esperado</h2>
      <div class="metricas">
        ${metrica('Hidratação real', 'pao.hidratacaoReal', 'pct', true)}
        ${metrica('Massa por pão', 'pao.pesoPorPao', 'g')}
        ${metrica('Assado por pão', 'pao.pesoAssado', 'g1')}
        ${metrica('Fornadas', 'pao.fornadas', 'int')}
      </div>
      <p class="nota-rodape">A hidratação real passa de 70% porque conta também a água que veio dentro do starter.</p>
    </section>

    <section class="secao">
      <h2 class="secao-titulo">Fôrma estimada</h2>
      <div class="metricas tres">
        ${metrica('Comprimento', 'pao.comprimento', 'cm')}
        ${metrica('Largura', 'pao.largura', 'cm')}
        ${metrica('Altura', 'pao.altura', 'cm')}
      </div>
    </section>

    ${blocoAvisos()}
    ${grupoDeCampos('pao', 'Objetivo', entradas)}
    ${grupoDeCampos('pao', 'Percentuais de padeiro', entradas)}
    ${grupoDeCampos('pao', 'Ajustes', entradas)}
  `;
}

function painelCustos(entradas) {
  return `
    <section class="secao">
      <div class="heroi">
        <div>
          <span class="rotulo">Custo por pão embalado</span>
          <span class="valor" data-saida="custos.porPaoEmbalado" data-fmt="brl"></span>
        </div>
        <div class="lateral">
          <div>pão só: <span data-saida="custos.porPao" data-fmt="brl"></span></div>
          <div>fornada: <span data-saida="custos.producao" data-fmt="brl"></span></div>
        </div>
      </div>
    </section>

    <section class="secao">
      <h2 class="secao-titulo">De onde vem o custo</h2>
      <div class="metricas tres">
        ${metrica('Ingredientes', 'custos.ingredientes', 'brl')}
        ${metrica('Embalagem', 'custos.embalagemTotal', 'brl')}
        ${metrica('Energia', 'custos.energia', 'brl')}
      </div>
      <p class="nota-rodape">A farinha que vem dentro do starter é cobrada ao preço da branca, e a água não entra no custo — igual à planilha.</p>
    </section>

    ${blocoAvisos()}
    ${grupoDeCampos('custos', 'Preço por quilo', entradas)}
    ${grupoDeCampos('custos', 'Energia', entradas)}
    ${grupoDeCampos('custos', 'Embalagem (por pão)', entradas)}
  `;
}

// --- Diário ----------------------------------------------------------------

function pontos(valor) {
  let html = '<span class="pontos">';
  for (let i = 1; i <= 5; i += 1) html += `<span class="ponto${valor >= i ? ' cheio' : ''}"></span>`;
  return `${html}</span>`;
}

function blocoPesagem(registro) {
  if (!(Number(registro.pesoRealAssado) > 0)) return '';
  const estimado = calcular(registro.snapshot).pao.pesoAssado;
  const perda = calibrarPerda(calcular(registro.snapshot).pao.pesoPorPao, Number(registro.pesoRealAssado));
  return `<div class="pesagem-real">
    <span class="sep">estimado</span> ${fmtNum(estimado, 0)} g
    <span class="sep">·</span>
    <span class="sep">real</span> <span class="real">${fmtNum(Number(registro.pesoRealAssado), 0)} g</span>
    ${perda === null ? '' : `<button class="calibrar" data-acao="calibrar" data-id="${registro.id}">calibrar perda → ${fmtNum(perda * 100, 1)}%</button>`}
  </div>`;
}

function blocoRetrato(registro) {
  const linhas = CAMPOS.map(
    (c) => `<dt>${c.rotulo}</dt><dd>${formatarValor(c, registro.snapshot[c.chave])}</dd>`
  ).join('');
  return `<details class="retrato">
    <summary>Parâmetros desta fornada</summary>
    <dl class="retrato-lista">${linhas}</dl>
  </details>`;
}

function cartaoRegistro(registro, mostrarReceita) {
  const diffs = diffDoRegistro(estado, registro);
  const receita = estado.receitas.find((r) => r.id === registro.receitaId);

  // Diff vazio tem dois significados diferentes, e confundi-los engana quem lê:
  // ou nada mudou, ou esta é a fornada mais antiga e não há com o que comparar.
  const daReceita = registrosDaReceita(estado, registro.receitaId);
  const ehAPrimeira = daReceita.length > 0 && daReceita[daReceita.length - 1].id === registro.id;

  const notas = ESCALAS.filter((e) => Number(registro.notas?.[e.chave]) > 0)
    .map((e) => `<span class="nota-item">${e.rotulo} ${pontos(Number(registro.notas[e.chave]))}</span>`)
    .join('');

  const proc = registro.processo ?? {};
  const partesProcesso = [
    Number(proc.fermentacaoH) > 0 ? `${fmtNum(Number(proc.fermentacaoH), 1)} h em massa` : '',
    Number(proc.geladeiraH) > 0 ? `${fmtNum(Number(proc.geladeiraH), 1)} h de geladeira` : '',
    Number(proc.temperaturaC) > 0 ? `${fmtNum(Number(proc.temperaturaC), 0)} °C ambiente` : '',
  ].filter(Boolean);

  return `<article class="registro">
    <div class="registro-topo">
      <span class="registro-data">${dataLegivel(registro.quando)}</span>
      ${mostrarReceita && receita ? `<span class="registro-receita">${escapar(receita.nome)}</span>` : ''}
    </div>
    ${
      diffs.length
        ? `<div class="diffs">${diffs
            .map(
              (d) =>
                `<span class="diff">${escapar(d.rotulo)} <span class="de">${escapar(d.de)}</span> → <span class="para">${escapar(d.para)}</span></span>`
            )
            .join('')}</div>`
        : `<p class="diff-vazio">${
            ehAPrimeira
              ? 'Primeira fornada registrada desta receita.'
              : 'Sem alterações nos parâmetros desde a fornada anterior.'
          }</p>`
    }
    ${blocoPesagem(registro)}
    <p class="observacao">${escapar(registro.observacao)}</p>
    ${notas ? `<div class="notas-rapidas">${notas}</div>` : ''}
    ${partesProcesso.length ? `<div class="notas-rapidas">${partesProcesso.map((p) => `<span class="nota-item">${p}</span>`).join('')}</div>` : ''}
    ${blocoRetrato(registro)}
    <div class="registro-acoes">
      <button data-acao="apagar-registro" data-id="${registro.id}">Apagar fornada</button>
    </div>
  </article>`;
}

function painelDiario() {
  const ativa = receitaAtiva(estado);
  const lista =
    filtroDiario === 'todas'
      ? [...estado.registros].sort((a, b) => (a.quando < b.quando ? 1 : -1))
      : registrosDaReceita(estado, ativa.id);

  const corpo = lista.length
    ? lista.map((r) => cartaoRegistro(r, filtroDiario === 'todas')).join('')
    : `<div class="vazio">
         <span class="glifo">📓</span>
         <p>Nenhuma fornada registrada ainda.<br>Asse, prove, e anote o que mudaria da próxima vez.</p>
       </div>`;

  return `
    <div class="diario-controles">
      <button class="filtro" data-acao="filtro" data-valor="receita" aria-pressed="${filtroDiario === 'receita'}">Esta receita</button>
      <button class="filtro" data-acao="filtro" data-valor="todas" aria-pressed="${filtroDiario === 'todas'}">Todas</button>
    </div>
    <section class="secao">
      <button class="botao-principal" data-acao="nova-fornada">Registrar fornada</button>
    </section>
    <section class="secao">${corpo}</section>
  `;
}

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------

function render() {
  const ativa = receitaAtiva(estado);
  const topo = document.getElementById('topo');
  topo.innerHTML = `
    <div class="topo-interno">
      <span class="topo-marca">Levain</span>
      <button class="seletor-receita" data-acao="abrir-receitas">
        <span class="nome">${escapar(ativa.nome)}</span>
        <span class="seta">▼</span>
      </button>
      <button class="botao-icone" data-acao="abrir-receitas" aria-label="Receitas e backup">☰</button>
    </div>`;

  const painel = document.getElementById('painel');
  painel.innerHTML =
    abaAtiva === 'starter'
      ? painelStarter(ativa.entradas)
      : abaAtiva === 'pao'
        ? painelPao(ativa.entradas)
        : abaAtiva === 'custos'
          ? painelCustos(ativa.entradas)
          : painelDiario();

  document.querySelectorAll('.aba').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.aba === abaAtiva));
  });

  atualizar();
}

function atualizar() {
  const ativa = receitaAtiva(estado);
  const resultado = calcular(ativa.entradas);

  document.querySelectorAll('#painel [data-saida]').forEach((el) => {
    el.innerHTML = formatarSaida(caminho(resultado, el.dataset.saida), el.dataset.fmt);
  });

  const caixa = document.getElementById('avisos');
  if (caixa) {
    caixa.innerHTML = resultado.avisos
      .map((a) => `<div class="aviso"><span>⚠</span><span>${escapar(a)}</span></div>`)
      .join('');
  }
}

// ---------------------------------------------------------------------------
// Folhas modais
// ---------------------------------------------------------------------------

function abrirFolha(html) {
  const folha = document.getElementById('folha');
  folha.innerHTML = `<div class="folha-fundo" data-acao="fechar-folha"></div>
    <div class="folha-corpo"><div class="folha-alca"></div>${html}</div>`;
  folha.hidden = false;
}

function fecharFolha() {
  const folha = document.getElementById('folha');
  folha.hidden = true;
  folha.innerHTML = '';
}

function folhaReceitas() {
  const itens = estado.receitas
    .map((r) => {
      const n = estado.registros.filter((g) => g.receitaId === r.id).length;
      const atual = r.id === estado.receitaAtivaId;
      return `<button class="item-receita" data-acao="trocar-receita" data-id="${r.id}" aria-current="${atual}">
        <span class="marca">${atual ? '●' : '○'}</span>
        <span class="nome">${escapar(r.nome)}</span>
        <span class="contagem">${n} ${n === 1 ? 'fornada' : 'fornadas'}</span>
      </button>`;
    })
    .join('');

  abrirFolha(`
    <h2 class="folha-titulo">Receitas</h2>
    <div class="lista-receitas">${itens}</div>
    <div class="trio" style="margin-top:12px">
      <button class="botao-secundario" data-acao="nova-receita">Nova</button>
      <button class="botao-secundario" data-acao="renomear-receita">Renomear</button>
      <button class="botao-secundario" data-acao="duplicar-receita">Duplicar</button>
    </div>
    <div style="margin-top:9px">
      <button class="botao-secundario" style="width:100%" data-acao="apagar-receita">Apagar receita atual</button>
    </div>

    <h2 class="folha-titulo" style="margin-top:28px">Backup</h2>
    <p class="nota-rodape" style="margin-bottom:12px">O aplicativo guarda tudo só neste aparelho. Limpar os dados do navegador apaga o diário — exporte de vez em quando.</p>
    <div class="folha-acoes" style="margin-top:0">
      <button class="botao-principal" data-acao="exportar">Exportar tudo</button>
      <button class="botao-secundario" data-acao="importar">Importar</button>
    </div>
    <input type="file" id="arquivo-importar" accept="application/json,.json" hidden>
  `);
}

function folhaNomeReceita(titulo, valorInicial, acao) {
  abrirFolha(`
    <h2 class="folha-titulo">${titulo}</h2>
    <label class="campo-livre">
      <span>Nome da receita</span>
      <input type="text" id="nome-receita" value="${escapar(valorInicial)}" placeholder="Integral 500 g">
    </label>
    <div class="folha-acoes">
      <button class="botao-principal" data-acao="${acao}">Salvar</button>
      <button class="botao-secundario" data-acao="fechar-folha">Cancelar</button>
    </div>
  `);
  const campo = document.getElementById('nome-receita');
  campo.focus();
  campo.select();
}

function folhaFornada() {
  const ativa = receitaAtiva(estado);
  const previsto = calcular(ativa.entradas).pao.pesoAssado;

  abrirFolha(`
    <h2 class="folha-titulo">Registrar fornada</h2>

    <label class="campo-livre">
      <span>Quando</span>
      <input type="datetime-local" id="f-quando" value="${paraCampoDataHora(new Date().toISOString())}">
    </label>

    <label class="campo-livre">
      <span>Observação</span>
      <textarea id="f-obs" placeholder="O que você mudou, o que reparou, o que tentaria da próxima vez."></textarea>
    </label>

    <label class="campo-livre">
      <span>Peso real assado, por pão — estimado ${fmtNum(previsto, 0)} g</span>
      <input type="text" inputmode="decimal" id="f-peso" placeholder="pese um pão e anote">
    </label>

    <div class="escalas">
      ${ESCALAS.map(
        (e) => `<div class="escala" data-escala="${e.chave}">
          <span>${e.rotulo}</span>
          <span class="escala-botoes">
            ${[1, 2, 3, 4, 5]
              .map((n) => `<button type="button" data-acao="escala" data-chave="${e.chave}" data-nota="${n}" aria-pressed="false">${n}</button>`)
              .join('')}
          </span>
        </div>`
      ).join('')}
    </div>

    <div class="trio">
      <label class="campo-livre"><span>Massa (h)</span><input type="text" inputmode="decimal" id="f-fermentacao"></label>
      <label class="campo-livre"><span>Geladeira (h)</span><input type="text" inputmode="decimal" id="f-geladeira"></label>
      <label class="campo-livre"><span>Ambiente (°C)</span><input type="text" inputmode="decimal" id="f-temp"></label>
    </div>

    <div class="folha-acoes">
      <button class="botao-principal" data-acao="salvar-fornada">Salvar fornada</button>
      <button class="botao-secundario" data-acao="fechar-folha">Cancelar</button>
    </div>
  `);
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

function salvarFornada() {
  const ativa = receitaAtiva(estado);
  const quandoCampo = document.getElementById('f-quando').value;
  const notas = {};
  document.querySelectorAll('#folha [data-acao="escala"][aria-pressed="true"]').forEach((b) => {
    notas[b.dataset.chave] = Number(b.dataset.nota);
  });

  const numeroOuNulo = (id) => {
    const n = paraNumero(document.getElementById(id).value);
    return Number.isFinite(n) ? n : null;
  };

  estado.registros.push(
    criarRegistro(ativa, {
      quando: quandoCampo ? new Date(quandoCampo).toISOString() : undefined,
      observacao: document.getElementById('f-obs').value.trim(),
      pesoRealAssado: numeroOuNulo('f-peso'),
      notas,
      processo: {
        fermentacaoH: numeroOuNulo('f-fermentacao'),
        geladeiraH: numeroOuNulo('f-geladeira'),
        temperaturaC: numeroOuNulo('f-temp'),
      },
    })
  );

  salvar();
  fecharFolha();
  abaAtiva = 'diario';
  render();
}

function calibrarPerdaForno(id) {
  const registro = estado.registros.find((r) => r.id === id);
  if (!registro) return;
  const perda = calibrarPerda(calcular(registro.snapshot).pao.pesoPorPao, Number(registro.pesoRealAssado));
  if (perda === null) return;

  const ativa = receitaAtiva(estado);
  const atual = fmtNum(ativa.entradas.perdaForno * 100, 1);
  const nova = fmtNum(perda * 100, 1);
  if (!confirm(`Trocar a perda no forno de ${atual}% para ${nova}% na receita "${ativa.nome}"?`)) return;

  ativa.entradas = { ...ativa.entradas, perdaForno: perda };
  ativa.atualizadaEm = new Date().toISOString();
  salvar();
  render();
}

function baixarBackup() {
  const blob = new Blob([exportar(estado)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dia = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `paes-${dia}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function lerBackup(arquivo) {
  const leitor = new FileReader();
  leitor.onload = () => {
    const resultado = importar(String(leitor.result));
    if (!resultado.ok) {
      alert(`Não deu para importar: ${resultado.erro}`);
      return;
    }
    const n = resultado.estado.receitas.length;
    const g = resultado.estado.registros.length;
    if (!confirm(`Substituir tudo que está neste aparelho por ${n} receita(s) e ${g} fornada(s) do arquivo?`)) return;
    estado = resultado.estado;
    persistencia.salvar(estado);
    fecharFolha();
    render();
  };
  leitor.readAsText(arquivo);
}

const ACOES = {
  'abrir-receitas': folhaReceitas,
  'fechar-folha': fecharFolha,
  'nova-fornada': folhaFornada,
  'salvar-fornada': salvarFornada,
  exportar: baixarBackup,

  importar() {
    document.getElementById('arquivo-importar').click();
  },

  filtro(el) {
    filtroDiario = el.dataset.valor;
    render();
  },

  'trocar-receita'(el) {
    estado.receitaAtivaId = el.dataset.id;
    salvar();
    fecharFolha();
    render();
  },

  'nova-receita'() {
    folhaNomeReceita('Nova receita', '', 'confirmar-nova-receita');
  },

  'confirmar-nova-receita'() {
    const nome = document.getElementById('nome-receita').value.trim();
    if (!nome) return;
    // A receita nova parte dos valores da atual: quase sempre é uma variação.
    const receita = novaReceita(nome, { entradas: receitaAtiva(estado).entradas });
    estado.receitas.push(receita);
    estado.receitaAtivaId = receita.id;
    salvar();
    fecharFolha();
    render();
  },

  'renomear-receita'() {
    folhaNomeReceita('Renomear receita', receitaAtiva(estado).nome, 'confirmar-renomear');
  },

  'confirmar-renomear'() {
    const nome = document.getElementById('nome-receita').value.trim();
    if (!nome) return;
    receitaAtiva(estado).nome = nome;
    salvar();
    fecharFolha();
    render();
  },

  'duplicar-receita'() {
    const atual = receitaAtiva(estado);
    const copia = novaReceita(`${atual.nome} (cópia)`, { entradas: atual.entradas });
    estado.receitas.push(copia);
    estado.receitaAtivaId = copia.id;
    salvar();
    fecharFolha();
    render();
  },

  'apagar-receita'() {
    if (estado.receitas.length === 1) {
      alert('Esta é a única receita. Crie outra antes de apagar esta.');
      return;
    }
    const atual = receitaAtiva(estado);
    const n = estado.registros.filter((r) => r.receitaId === atual.id).length;
    const aviso = n ? ` Isso também apaga ${n} fornada(s) do diário.` : '';
    if (!confirm(`Apagar a receita "${atual.nome}"?${aviso}`)) return;

    estado.receitas = estado.receitas.filter((r) => r.id !== atual.id);
    estado.registros = estado.registros.filter((r) => r.receitaId !== atual.id);
    estado.receitaAtivaId = estado.receitas[0].id;
    salvar();
    fecharFolha();
    render();
  },

  'apagar-registro'(el) {
    if (!confirm('Apagar esta fornada do diário?')) return;
    estado.registros = estado.registros.filter((r) => r.id !== el.dataset.id);
    salvar();
    render();
  },

  calibrar(el) {
    calibrarPerdaForno(el.dataset.id);
  },

  escala(el) {
    const jaMarcado = el.getAttribute('aria-pressed') === 'true';
    el.closest('.escala-botoes')
      .querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-pressed', 'false'));
    el.setAttribute('aria-pressed', String(!jaMarcado));
  },

  passo(el) {
    const chave = el.dataset.campoAlvo;
    const campo = CAMPO_POR_CHAVE[chave];
    const entrada = document.querySelector(`[data-campo="${chave}"]`);
    const atual = paraNumero(entrada.value);
    const base = Number.isFinite(atual) ? atual : 0;
    const proximo = Math.max(0, base + Number(el.dataset.sinal) * (campo.passo ?? 1));
    // Passos fracionários acumulam ruído binário; a casa decimal do campo corta.
    const limpo = Number(proximo.toFixed(campo.casas ?? 0));

    entrada.value = formatarEntrada(campo, paraArmazenamento(campo, limpo));
    aplicarEntrada(chave, limpo);
  },
};

function aplicarEntrada(chave, valorExibido) {
  const campo = CAMPO_POR_CHAVE[chave];
  const ativa = receitaAtiva(estado);
  ativa.entradas = { ...ativa.entradas, [chave]: paraArmazenamento(campo, valorExibido) };
  ativa.atualizadaEm = new Date().toISOString();
  atualizar();
  salvar();
}

// ---------------------------------------------------------------------------
// Ligação com o DOM
// ---------------------------------------------------------------------------

function montar() {
  document.getElementById('app').innerHTML = `
    <header class="topo" id="topo"></header>
    <main class="conteudo"><div class="painel" id="painel"></div></main>
    <nav class="abas" role="tablist">
      ${ABAS.map(
        (a) => `<button class="aba" role="tab" data-aba="${a.id}" aria-selected="false">
          <span class="glifo">${a.glifo}</span>
          <span class="rotulo">${a.rotulo}</span>
        </button>`
      ).join('')}
    </nav>
    <div class="folha" id="folha" hidden></div>`;

  document.addEventListener('click', (evento) => {
    const aba = evento.target.closest('.aba');
    if (aba) {
      abaAtiva = aba.dataset.aba;
      render();
      return;
    }
    const alvo = evento.target.closest('[data-acao]');
    if (alvo && ACOES[alvo.dataset.acao]) {
      evento.preventDefault();
      ACOES[alvo.dataset.acao](alvo);
    }
  });

  document.addEventListener('input', (evento) => {
    const entrada = evento.target.closest('[data-campo]');
    if (entrada) {
      const valor = paraNumero(entrada.value);
      // Estados intermediários como "70," não devem zerar a receita.
      if (Number.isFinite(valor)) aplicarEntrada(entrada.dataset.campo, valor);
      return;
    }
    const arquivo = evento.target.closest('#arquivo-importar');
    if (arquivo && arquivo.files?.[0]) lerBackup(arquivo.files[0]);
  });

  render();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
}
