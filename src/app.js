/**
 * Interface: quatro abas sobre um motor de cálculo só.
 *
 * Regra de renderização: cada painel tem duas metades. As **saídas** são
 * redesenhadas por inteiro a cada tecla — é o que permite um ingrediente
 * aparecer e sumir da pesagem conforme o percentual sai do zero. As
 * **entradas** só são construídas em render(), nunca durante a digitação, que
 * é o que impede o campo de perder o foco.
 */

import { calcular, calibrarPerda, ENTRADAS_PADRAO } from './calc.js';
import { CAMPOS, CAMPO_POR_CHAVE, ESCALAS, GRUPOS_DE_ESCALA, MOLDE, formatarEntrada, formatarValor, paraArmazenamento } from './campos.js';
import { criarPersistencia, criarRegistro, diffDoRegistro, estadoInicial, exportar, gerarId, importar, novaReceita, receitaAtiva, registrosDaReceita } from './store.js';

const ABAS = [
  { id: 'starter', glifo: '🫧', rotulo: 'Starter' },
  { id: 'pao', glifo: '🍞', rotulo: 'Pão' },
  { id: 'custos', glifo: '💰', rotulo: 'Custos' },
  { id: 'diario', glifo: '📓', rotulo: 'Diário' },
];

const persistencia = criarPersistencia(
  typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
);

let estado = persistencia.carregar() ?? estadoInicial();
let abaAtiva = 'pao';
let filtroDiario = 'receita';
let objetivoAberto = false;
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
  return formatadores.get(casas).format(Number.isFinite(valor) ? valor : 0);
}

/**
 * Unidade que vem DEPOIS do número (g, %, cm, min) fica menor: lê-se como
 * anotação. Já o "R$" vem antes e faz parte do número — reduzi-lo quebra a
 * leitura, então acompanha o tamanho.
 */
const uni = (texto) => `<span class="unidade">${texto}</span>`;
const moeda = () => '<span class="moeda">R$</span>';

const g = (v) => `${fmtNum(v, 0)}${uni('g')}`;
const g1 = (v) => `${fmtNum(v, 1)}${uni('g')}`;
const pct = (v) => `${fmtNum(v * 100, 1)}${uni('%')}`;
const brl = (v) => `${moeda()}${fmtNum(v, 2)}`;
const cm = (v) => `${fmtNum(v, 1)}${uni('cm')}`;

/** Inteiro quando o valor é redondo; uma casa quando a divisão deixou resto. */
const redondo = (v) => Math.abs(v - Math.round(v)) < 0.05;
const gAuto = (v) => (redondo(v) ? g(v) : g1(v));
const horas = (v) => fmtNum(v, redondo(v) ? 0 : 1);

/** "90%" enxuto, para a legenda de uma linha do ticket. */
const pctCurto = (v) => `${fmtNum(v * 100, Number.isInteger(v * 100) ? 0 : 1)}% do pote`;

function formatarMinutos(minutos) {
  const total = Math.max(0, Math.round(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) return `${resto}${uni('min')}`;
  if (resto === 0) return `${horas}${uni('h')}`;
  return `${horas}${uni('h')} ${resto}${uni('min')}`;
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

function marcarAlterada() {
  receitaAtiva(estado).atualizadaEm = new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Blocos reutilizáveis
// ---------------------------------------------------------------------------

function linhaTicket(rotulo, valorHtml, detalhe) {
  return `<div class="ticket-linha">
    <span class="ticket-nome">${escapar(rotulo)}${detalhe ? `<span class="ticket-detalhe">${detalhe}</span>` : ''}</span>
    <span class="ticket-pontilhado"></span>
    <span class="ticket-valor">${valorHtml}</span>
  </div>`;
}

function metrica(rotulo, valorHtml, destaque) {
  return `<div class="metrica${destaque ? ' destaque' : ''}">
    <span class="rotulo">${rotulo}</span>
    <span class="valor">${valorHtml}</span>
  </div>`;
}

function blocoAvisos(resultado) {
  if (!resultado.avisos.length) return '';
  return resultado.avisos
    .map((a) => `<div class="aviso"><span>⚠</span><span>${escapar(a)}</span></div>`)
    .join('');
}

/** Grupo de controles [− valor unidade +] para um campo simples ou item de lista. */
function controleNumerico(molde, valor, atributos, rotuloAria) {
  const unidade = molde.unidade === '%' ? '%' : (molde.unidade ?? '').replace('R$/kg', '/kg').replace('R$', '').replace('g/pão', 'g');
  return `<span class="campo-controle">
    <button class="passo" data-acao="passo" ${atributos} data-sinal="-1" aria-label="Diminuir ${escapar(rotuloAria)}">−</button>
    <input type="text" inputmode="decimal" ${atributos} value="${formatarEntrada(molde, valor)}" aria-label="${escapar(rotuloAria)}">
    <span class="campo-unidade">${unidade}</span>
    <button class="passo" data-acao="passo" ${atributos} data-sinal="1" aria-label="Aumentar ${escapar(rotuloAria)}">+</button>
  </span>`;
}

/** O seletor mora na mesma moldura dos numéricos, só que sem os botões de passo. */
function controleOpcoes(campo, valor) {
  const conhecido = campo.opcoes.some((o) => o.valor === valor);
  const opcoes = campo.opcoes
    .map((o) => `<option value="${o.valor}"${o.valor === valor ? ' selected' : ''}>${escapar(o.rotulo)}</option>`)
    .join('');
  // Sem esta opção, um formato fora da tabela — só chega assim por importação
  // corrompida — deixaria nenhuma `selected`, e o navegador mostraria a
  // primeira como se fosse a escolhida. O travessão é o mesmo que o diário usa
  // para valor que ele não reconhece.
  const foraDaTabela = conhecido ? '' : '<option value="" selected>—</option>';
  return `<span class="campo-controle">
    <select data-campo="${campo.chave}" aria-label="${escapar(campo.rotulo)}">${foraDaTabela}${opcoes}</select>
  </span>`;
}

function campoEntrada(chave, entradas) {
  const campo = CAMPO_POR_CHAVE[chave];
  const controle =
    campo.tipo === 'opcoes'
      ? controleOpcoes(campo, entradas[chave])
      : controleNumerico(campo, entradas[chave], `data-campo="${chave}"`, campo.rotulo);
  return `<div class="campo">
    <span class="campo-texto">
      <span class="campo-rotulo">${campo.rotulo}</span>
      ${campo.dica ? `<span class="campo-dica">${campo.dica}</span>` : ''}
    </span>
    ${controle}
  </div>`;
}

function grupoDeCampos(aba, grupo, entradas, extra = '') {
  const chaves = CAMPOS.filter((c) => c.aba === aba && c.grupo === grupo).map((c) => c.chave);
  if (chaves.length === 0 && !extra) return '';
  return `<section class="secao">
    <h2 class="secao-titulo">${grupo}</h2>
    <div class="grupo">${chaves.map((k) => campoEntrada(k, entradas)).join('')}${extra}</div>
  </section>`;
}

/**
 * Linha editável de um item de lista: nome, o valor principal e, quando houver,
 * um valor secundário na linha de baixo.
 */
function itemDeLista(lista, item, principal, secundarios = [], podeApagar = true) {
  const alvo = (attr) => `data-lista="${lista}" data-id="${item.id}" data-attr="${attr}"`;
  return `<div class="item-lista">
    <div class="item-linha">
      <input type="text" class="item-nome" ${alvo('nome')} value="${escapar(item.nome)}" aria-label="Nome do ingrediente" placeholder="Nome">
      ${controleNumerico(principal.molde, item[principal.attr], alvo(principal.attr), `${item.nome}, ${principal.rotulo}`)}
      ${podeApagar
        ? `<button class="item-remover" data-acao="remover-item" data-lista="${lista}" data-id="${item.id}" aria-label="Remover ${escapar(item.nome)}">✕</button>`
        : '<span class="item-remover vazio"></span>'}
    </div>
    ${secundarios
      .map(
        (s) => `<div class="item-linha secundaria">
          <span class="item-rotulo-menor">${s.rotulo}</span>
          ${controleNumerico(s.molde, item[s.attr], alvo(s.attr), `${item.nome}, ${s.rotulo}`)}
        </div>`
      )
      .join('')}
  </div>`;
}

function listaEditavel(titulo, lista, itens, principal, secundarios, acaoAdicionar, rotuloAdicionar, nota) {
  return `<section class="secao">
    <h2 class="secao-titulo">${titulo}</h2>
    <div class="lista-itens">
      ${itens.map((item) => itemDeLista(lista, item, principal, secundarios)).join('')}
      ${itens.length === 0 ? `<p class="lista-vazia">Nenhum item.</p>` : ''}
    </div>
    <button class="botao-adicionar" data-acao="${acaoAdicionar}">+ ${rotuloAdicionar}</button>
    ${nota ? `<p class="nota-rodape">${nota}</p>` : ''}
  </section>`;
}

/**
 * Lista de composição: aponta para o catálogo por id. A massa e o starter têm
 * cada um a sua, e são de fato independentes — dá para ter centeio na massa e
 * não ter no pote.
 */
function listaDeComposicao(titulo, chave, entradas, marcaResto, nota) {
  const catalogo = new Map(entradas.farinhas.map((f) => [f.id, f]));
  const itens = entradas[chave].filter((c) => catalogo.has(c.farinhaId));
  const podeApagar = itens.length > 1;

  const linhas = itens
    .map((c, i) => {
      const farinha = catalogo.get(c.farinhaId);
      const ehBase = i === 0;
      const controle = ehBase
        ? `<span class="valor-resto" data-resto="${marcaResto}">—</span>`
        : controleNumerico(
            MOLDE.pct,
            c.pct,
            `data-lista="${chave}" data-id="${c.farinhaId}" data-attr="pct"`,
            `${farinha.nome}, percentual`
          );

      return `<div class="item-lista${ehBase ? ' base' : ''}">
        <div class="item-linha">
          <input type="text" class="item-nome" data-lista="farinhas" data-id="${farinha.id}" data-attr="nome"
                 value="${escapar(farinha.nome)}" aria-label="Nome da farinha" placeholder="Nome">
          ${controle}
          ${podeApagar
            ? `<button class="item-remover" data-acao="remover-item" data-lista="${chave}" data-id="${farinha.id}" aria-label="Tirar ${escapar(farinha.nome)}">✕</button>`
            : '<span class="item-remover vazio"></span>'}
        </div>
        ${ehBase ? '<p class="item-nota">Base: recebe o que sobrar para fechar 100%.</p>' : ''}
      </div>`;
    })
    .join('');

  return `<section class="secao">
    <h2 class="secao-titulo">${titulo}</h2>
    <div class="lista-itens">
      ${linhas || '<p class="lista-vazia">Nenhuma farinha.</p>'}
    </div>
    <button class="botao-adicionar" data-acao="escolher-farinha" data-alvo="${chave}">+ farinha</button>
    ${nota ? `<p class="nota-rodape">${nota}</p>` : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Aba Pão
// ---------------------------------------------------------------------------

function saidasPao(r) {
  const usados = r.pao.farinhas.filter((f) => f.gramas > 0);
  const liquidos = r.pao.liquidos.filter((l) => l.gramas > 0);
  const solidos = r.pao.solidos.filter((s) => s.gramas > 0);
  const temSolidos = r.pao.solidosPorPao > 0;

  const linhas = [
    ...usados.map((f) => linhaTicket(f.nome, g(f.gramas))),
    linhaTicket('Água', g(r.pao.agua)),
    linhaTicket('Starter ativado', g(r.pao.starter)),
    linhaTicket('Sal', g(r.pao.sal)),
    ...liquidos.map((l) => linhaTicket(l.nome, g(l.gramas))),
    ...solidos.map((s) =>
      linhaTicket(s.nome, g(s.gramas), `${fmtNum(s.gramasPorPao, 0)} g por pão`)
    ),
  ].join('');

  return `
    ${blocoAvisos(r)}
    <section class="secao">
      <h2 class="secao-titulo">Pesagem</h2>
      <div class="ticket">
        <div class="ticket-borda"></div>
        ${linhas}
        <div class="ticket-rodape">
          <span class="rotulo">${temSolidos ? 'Peso total' : 'Peso total da massa'}</span>
          <span class="valor">${g(r.pao.pesoTotal)}</span>
        </div>
      </div>
    </section>

    <section class="secao">
      <h2 class="secao-titulo">Resultado esperado</h2>
      <div class="metricas">
        ${metrica('Hidratação real', pct(r.pao.hidratacaoReal), true)}
        ${metrica('Cru por pão', g(r.pao.pesoPorPao))}
        ${metrica('Assado por pão', g1(r.pao.pesoAssado))}
        ${metrica('Fornadas', fmtNum(r.pao.fornadas, 0))}
        ${metrica('Tempo de forno', formatarMinutos(r.pao.tempoTotal))}
      </div>
      ${temSolidos
        ? `<p class="nota-rodape">O objetivo dimensiona a massa: ${fmtNum(r.pao.pesoAssadoMassa, 0)} g de massa assada + ${fmtNum(r.pao.solidosPorPao, 0)} g de extras sólidos por pão.</p>`
        : '<p class="nota-rodape">A hidratação real passa do valor pedido porque conta também a água que veio dentro do starter.</p>'}
    </section>

    <section class="secao">
      <h2 class="secao-titulo">Fôrma estimada</h2>
      <div class="metricas tres">
        ${metrica('Comprimento', cm(r.pao.comprimento))}
        ${metrica('Largura', cm(r.pao.largura))}
        ${metrica('Altura', cm(r.pao.altura))}
      </div>
    </section>`;
}

function entradasPao(entradas) {
  return `
    ${listaDeComposicao(
      'Farinhas da massa',
      'composicaoPao',
      entradas,
      'pao',
      'Percentuais sobre a farinha total. Só do pão — o starter tem a composição dele, na aba ao lado.'
    )}
    ${grupoDeCampos('pao', 'Proporções', entradas)}
    ${listaEditavel(
      'Líquidos',
      'liquidos',
      entradas.liquidos,
      { attr: 'pct', molde: MOLDE.pct, rotulo: 'percentual' },
      [{ attr: 'fracaoAgua', molde: MOLDE.fracaoAgua, rotulo: 'Quanto é água' }],
      'add-liquido',
      'líquido',
      'Entram na massa. A fração de água é descontada da água pura: azeite 0%, melado 25%, mel 18%, leite 87%.'
    )}
    ${listaEditavel(
      'Extras sólidos',
      'solidos',
      entradas.solidos,
      { attr: 'gramasPorPao', molde: MOLDE.gramasPorPao, rotulo: 'gramas por pão' },
      [],
      'add-solido',
      'sólido',
      'Somam no peso do pão sem alterar o equilíbrio farinha-água. A perda no forno não se aplica a eles.'
    )}
    ${grupoDeCampos('pao', 'Ajustes', entradas)}`;
}

// ---------------------------------------------------------------------------
// Aba Starter
// ---------------------------------------------------------------------------

function saidasStarter(r) {
  const composicao = r.starter.farinhas.filter((f) => f.gramas > 0.05);
  // A farinha que se pesa para alimentar o pote, nomeada uma a uma: num pote
  // misto, "farinha: 54 g" não diz quanto pôr de cada.
  const paraPesar = r.starter.farinhasAtivar.filter((f) => f.gramas > 0.05);
  const misturado = paraPesar.length > 1;
  const linhasDeFarinha = paraPesar.length
    ? paraPesar.map((f) => linhaTicket(f.nome, gAuto(f.gramas), misturado ? pctCurto(f.pct) : '')).join('')
    : linhaTicket('Farinha', g(r.starter.farinhaAtivar));

  return `
    ${blocoAvisos(r)}
    <section class="secao">
      <h2 class="secao-titulo">Ativação para esta receita</h2>
      <div class="ticket">
        <div class="ticket-borda"></div>
        ${linhaTicket('Starter-mãe do pote', g(r.starter.maeParaAtivar))}
        ${linhasDeFarinha}
        ${linhaTicket('Água', g(r.starter.aguaAtivar))}
        <div class="ticket-rodape">
          <span class="rotulo">Starter ativado</span>
          <span class="valor">${g(r.starter.totalAtivado)}</span>
        </div>
      </div>
      <p class="nota-rodape">As quantidades saem da necessidade de starter da receita, arredondada para cima — por isso costuma sobrar um pouco.</p>
    </section>

    <section class="secao">
      <h2 class="secao-titulo">O que o starter carrega</h2>
      <div class="metricas">
        ${metrica('Hidratação do ativado', pct(r.starter.hidratacaoAtivado), true)}
        ${metrica('Sobra', g(r.starter.sobra))}
        ${metrica('Farinha embutida', gAuto(r.starter.farinhaNoStarter))}
        ${metrica('Água embutida', gAuto(r.starter.aguaNoStarter))}
      </div>
      ${composicao.length
        ? `<p class="nota-rodape">Da farinha já embutida no starter: ${composicao
            .map((f) => `${gAuto(f.gramas)} de ${escapar(f.nome.toLowerCase())}`)
            .join(', ')}.</p>`
        : ''}
    </section>`;
}

function entradasStarter(entradas) {
  return `
    ${listaDeComposicao(
      'Farinhas do pote',
      'composicaoStarter',
      entradas,
      'starter',
      'De que farinha o seu starter é alimentado. É uma lista à parte da massa: dá para ter centeio no pão sem ter centeio no pote, e vice-versa.'
    )}
    ${grupoDeCampos('starter', 'Starter-mãe', entradas)}
    ${grupoDeCampos('starter', 'Ativação', entradas)}`;
}

// ---------------------------------------------------------------------------
// Aba Custos
// ---------------------------------------------------------------------------

/** "Azeite", "Azeite e Nozes", "Azeite, Nozes e Mel". */
function juntarNomes(nomes) {
  if (nomes.length <= 1) return escapar(nomes[0] ?? '');
  return `${nomes.slice(0, -1).map(escapar).join(', ')} e ${escapar(nomes[nomes.length - 1])}`;
}

function linhaSoma(rotulo, detalhe, valorHtml) {
  return `<div class="ticket-soma">
    <span class="ticket-nome">${rotulo}${detalhe ? `<span class="ticket-detalhe">${detalhe}</span>` : ''}</span>
    <span class="ticket-pontilhado"></span>
    <span class="ticket-valor">${valorHtml}</span>
  </div>`;
}

function linhaDeCusto(item) {
  const semPreco = !(item.preco > 0);
  const detalhes = [`${fmtNum(item.gramas, 0)} g`];
  if (item.gramasStarter > 0.05) {
    detalhes.push(`${fmtNum(item.gramasPao, 0)} na massa + ${fmtNum(item.gramasStarter, 0)} no starter`);
  }
  if (item.gramasPorPao > 0) detalhes.push(`${fmtNum(item.gramasPorPao, 0)} g por pão`);
  detalhes.push(semPreco ? 'sem preço' : `R$ ${fmtNum(item.preco, 2)}/kg`);

  return `<div class="ticket-linha${semPreco ? ' sem-preco' : ''}">
    <span class="ticket-nome">${escapar(item.nome)}<span class="ticket-detalhe">${detalhes.join(' · ')}</span></span>
    <span class="ticket-pontilhado"></span>
    <span class="ticket-valor">${semPreco ? `${moeda()}—` : brl(item.custo)}</span>
  </div>`;
}

function saidasCustos(r, entradas) {
  const paes = Math.max(0, Math.round(entradas.numeroPaes));
  return `
    ${blocoAvisos(r)}
    <section class="secao">
      <div class="heroi">
        <div>
          <span class="rotulo">Custo por pão embalado</span>
          <span class="valor">${brl(r.custos.porPaoEmbalado)}</span>
        </div>
        <div class="lateral">
          <div>pão só: ${brl(r.custos.porPao)}</div>
          <div>fornada: ${brl(r.custos.producao)}</div>
        </div>
      </div>
    </section>

    ${r.custos.semPreco.length
      ? `<div class="aviso"><span>⚠</span><span>${juntarNomes(r.custos.semPreco)} ${
          r.custos.semPreco.length === 1 ? 'está' : 'estão'
        } na receita sem preço, então ${r.custos.semPreco.length === 1 ? 'sai' : 'saem'} de graça nesta conta.</span></div>`
      : ''}

    <section class="secao">
      <h2 class="secao-titulo">De onde vem o custo</h2>
      <div class="ticket ticket-custo">
        <div class="ticket-borda"></div>
        ${r.custos.itens.length
          ? r.custos.itens.map(linhaDeCusto).join('')
          : '<p class="lista-vazia">Nenhum ingrediente na receita.</p>'}
        ${linhaSoma('Ingredientes', '', brl(r.custos.ingredientes))}
        ${linhaSoma('Embalagem', paes ? `${fmtNum(paes, 0)} × ${brl(r.custos.embalagem)}` : '', brl(r.custos.embalagemTotal))}
        ${linhaSoma('Energia', formatarMinutos(r.pao.tempoTotal), brl(r.custos.energia))}
        <div class="ticket-rodape">
          <span class="rotulo">Total da fornada</span>
          <span class="valor">${brl(r.custos.producao)}</span>
        </div>
      </div>
      <p class="nota-rodape">A farinha que vem dentro do starter é cobrada pelo preço da farinha dele. A água não entra no custo.</p>
    </section>`;
}

/**
 * `data-preco-de` marca a linha para que atualizar() consiga acender e apagar
 * o alerta de "sem preço" enquanto se digita, sem reconstruir o formulário —
 * o que apagaria o campo debaixo do dedo.
 */
function linhaDePreco(id, nome, controle, semPreco) {
  return `<div class="campo${semPreco ? ' precisa-preco' : ''}" data-preco-de="${id}">
    <span class="campo-texto"><span class="campo-rotulo">${escapar(nome)}</span></span>
    ${controle}
  </div>`;
}

function precoDeItem(lista, item, semPreco) {
  const controle = controleNumerico(
    MOLDE.preco,
    item.preco,
    `data-lista="${lista}" data-id="${item.id}" data-attr="preco"`,
    `Preço de ${item.nome}`
  );
  return linhaDePreco(item.id, item.nome, controle, semPreco);
}

function entradasCustos(entradas, r) {
  const semPreco = new Set(r.custos.itens.filter((i) => !(i.preco > 0)).map((i) => i.id));

  // Só o que pertence a esta receita. Uma farinha que está no catálogo mas fora
  // das duas composições não custa nada aqui, e listar o preço dela seria pedir
  // atenção para um número que não entra em conta nenhuma. Ela continua
  // guardada, com o preço, no seletor "+ farinha".
  const naReceita = new Set([
    ...entradas.composicaoPao.map((c) => c.farinhaId),
    ...entradas.composicaoStarter.map((c) => c.farinhaId),
  ]);

  const campoSal = CAMPO_POR_CHAVE.precoSal;
  const linhas = [
    // Farinhas primeiro, sal depois: é a ordem da pesagem e a do próprio ticket.
    ...entradas.farinhas
      .filter((f) => naReceita.has(f.id))
      .map((f) => precoDeItem('farinhas', f, semPreco.has(f.id))),
    linhaDePreco(
      'sal',
      campoSal.rotulo,
      controleNumerico(campoSal, entradas.precoSal, 'data-campo="precoSal"', campoSal.rotulo),
      semPreco.has('sal')
    ),
    ...entradas.liquidos.map((l) => precoDeItem('liquidos', l, semPreco.has(l.id))),
    ...entradas.solidos.map((s) => precoDeItem('solidos', s, semPreco.has(s.id))),
  ];

  return `
    <section class="secao">
      <h2 class="secao-titulo">Preço por quilo</h2>
      <div class="grupo">${linhas.join('')}</div>
    </section>
    ${grupoDeCampos('custos', 'Energia', entradas)}
    ${grupoDeCampos('custos', 'Embalagem (por pão)', entradas)}`;
}

// ---------------------------------------------------------------------------
// Aba Diário
// ---------------------------------------------------------------------------

function pontos(valor) {
  let html = '<span class="pontos">';
  for (let i = 1; i <= 5; i += 1) html += `<span class="ponto${valor >= i ? ' cheio' : ''}"></span>`;
  return `${html}</span>`;
}

function blocoPesagem(registro) {
  if (!(Number(registro.pesoRealAssado) > 0)) return '';
  const r = calcular(registro.snapshot);
  const perda = calibrarPerda(r.pao.massaPorPao, Number(registro.pesoRealAssado), r.pao.solidosPorPao);
  return `<div class="pesagem-real">
    <span class="sep">estimado</span> ${fmtNum(r.pao.pesoAssado, 0)} g
    <span class="sep">·</span>
    <span class="sep">real</span> <span class="real">${fmtNum(Number(registro.pesoRealAssado), 0)} g</span>
    ${perda === null ? '' : `<button class="calibrar" data-acao="calibrar" data-id="${registro.id}">calibrar perda → ${fmtNum(perda * 100, 1)}%</button>`}
  </div>`;
}

function blocoRetrato(registro) {
  const e = registro.snapshot;
  const nomeFarinha = (id) => e.farinhas?.find((f) => f.id === id)?.nome ?? 'Farinha';
  const linhas = [];
  for (const c of CAMPOS) linhas.push([c.rotulo, formatarValor(c, e[c.chave])]);
  for (const c of e.composicaoPao ?? []) {
    linhas.push([`${nomeFarinha(c.farinhaId)} — na massa`, formatarValor(MOLDE.pct, c.pct)]);
  }
  for (const c of e.composicaoStarter ?? []) {
    linhas.push([`${nomeFarinha(c.farinhaId)} — no starter`, formatarValor(MOLDE.pct, c.pct)]);
  }
  for (const l of e.liquidos ?? []) linhas.push([l.nome, formatarValor(MOLDE.pct, l.pct)]);
  for (const s of e.solidos ?? []) linhas.push([s.nome, formatarValor(MOLDE.gramasPorPao, s.gramasPorPao)]);

  return `<details class="retrato">
    <summary>Parâmetros desta fornada</summary>
    <dl class="retrato-lista">${linhas.map(([k, v]) => `<dt>${escapar(k)}</dt><dd>${v}</dd>`).join('')}</dl>
  </details>`;
}

function cartaoRegistro(registro, mostrarReceita) {
  const diffs = diffDoRegistro(estado, registro);
  const receita = estado.receitas.find((r) => r.id === registro.receitaId);

  // Diff vazio tem dois significados diferentes, e confundi-los engana quem lê:
  // ou nada mudou, ou esta é a fornada mais antiga e não há com o que comparar.
  const daReceita = registrosDaReceita(estado, registro.receitaId);
  const ehAPrimeira = daReceita.length > 0 && daReceita[daReceita.length - 1].id === registro.id;

  // Numa escala descritiva, cinco pontinhos não dizem qual ponta é qual. A
  // palavra do extremo resolve isso para quem reler o diário daqui a meses.
  const palavraDoExtremo = (escala, nota) => {
    if (!escala.extremos) return '';
    if (nota <= 2) return `<em>${escapar(escala.extremos[0])}</em>`;
    if (nota >= 4) return `<em>${escapar(escala.extremos[1])}</em>`;
    return '';
  };

  const notas = ESCALAS.filter((e) => Number(registro.notas?.[e.chave]) > 0)
    .map((e) => {
      const nota = Number(registro.notas[e.chave]);
      return `<span class="nota-item">${e.rotulo} ${pontos(nota)} ${palavraDoExtremo(e, nota)}</span>`;
    })
    .join('');

  const proc = registro.processo ?? {};
  const partesProcesso = [
    Number(proc.fermentacaoH) > 0 ? `${horas(Number(proc.fermentacaoH))} h de fermentação` : '',
    Number(proc.geladeiraH) > 0 ? `${horas(Number(proc.geladeiraH))} h de geladeira` : '',
    Number(proc.temperaturaC) > 0 ? `${fmtNum(Number(proc.temperaturaC), 0)} °C na cozinha` : '',
  ].filter(Boolean);

  return `<article class="registro">
    <div class="registro-topo">
      <span class="registro-data">${dataLegivel(registro.quando)}</span>
      ${mostrarReceita && receita ? `<span class="registro-receita">${escapar(receita.nome)}</span>` : ''}
    </div>
    ${diffs.length
      ? `<div class="diffs">${diffs
          .map(
            (d) =>
              `<span class="diff">${escapar(d.rotulo)} <span class="de">${escapar(d.de)}</span> → <span class="para">${escapar(d.para)}</span></span>`
          )
          .join('')}</div>`
      : `<p class="diff-vazio">${ehAPrimeira ? 'Primeira fornada registrada desta receita.' : 'Sem alterações nos parâmetros desde a fornada anterior.'}</p>`}
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

function saidasDiario() {
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
    <section class="secao">${corpo}</section>`;
}

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------

function cabecalho(ativa) {
  return `
    <div class="topo-interno">
      <span class="topo-marca">Levain</span>
      <button class="seletor-receita" data-acao="abrir-receitas">
        <span class="nome">${escapar(ativa.nome)}</span>
        <span class="seta">▼</span>
      </button>
      <button class="botao-icone" data-acao="abrir-receitas" aria-label="Receitas e backup">☰</button>
    </div>
    <div class="faixa-objetivo">
      <button class="objetivo-resumo" data-acao="alternar-objetivo" aria-expanded="${objetivoAberto}">
        <span id="resumo-objetivo"></span>
        <span class="seta">${objetivoAberto ? '⌃' : '⌄'}</span>
      </button>
      ${objetivoAberto
        ? `<div class="objetivo-campos">
             ${CAMPOS.filter((c) => c.aba === 'objetivo').map((c) => campoEntrada(c.chave, ativa.entradas)).join('')}
           </div>`
        : ''}
    </div>`;
}

function render() {
  const ativa = receitaAtiva(estado);
  document.getElementById('topo').innerHTML = cabecalho(ativa);

  const entradasHtml =
    abaAtiva === 'starter'
      ? entradasStarter(ativa.entradas)
      : abaAtiva === 'pao'
        ? entradasPao(ativa.entradas)
        : abaAtiva === 'custos'
          ? entradasCustos(ativa.entradas, calcular(ativa.entradas))
          : '';

  document.getElementById('painel').innerHTML = `<div id="saidas"></div><div id="entradas">${entradasHtml}</div>`;

  document.querySelectorAll('.aba').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.aba === abaAtiva));
  });

  atualizar();
}

function atualizar() {
  const ativa = receitaAtiva(estado);
  const r = calcular(ativa.entradas);

  document.getElementById('saidas').innerHTML =
    abaAtiva === 'starter'
      ? saidasStarter(r)
      : abaAtiva === 'pao'
        ? saidasPao(r)
        : abaAtiva === 'custos'
          ? saidasCustos(r, ativa.entradas)
          : saidasDiario();

  const resumo = document.getElementById('resumo-objetivo');
  if (resumo) {
    const paes = ativa.entradas.numeroPaes;
    resumo.textContent = `${fmtNum(ativa.entradas.pesoAssadoDesejado, 0)} g × ${fmtNum(paes, 0)} ${paes === 1 ? 'pão' : 'pães'}`;
  }

  // O percentual da farinha base é calculado, não digitado. Cada composição
  // tem a sua.
  document.querySelectorAll('[data-resto]').forEach((el) => {
    const base = el.dataset.resto === 'starter' ? r.starter.farinhas[0] : r.pao.farinhas[0];
    el.textContent = base ? formatarValor(MOLDE.pct, base.pct) : '—';
  });

  // O alerta de preço faltando acende e apaga junto com a digitação.
  const semPreco = new Set(r.custos.itens.filter((i) => !(i.preco > 0)).map((i) => i.id));
  document.querySelectorAll('[data-preco-de]').forEach((el) => {
    el.classList.toggle('precisa-preco', semPreco.has(el.dataset.precoDe));
  });
}

// ---------------------------------------------------------------------------
// Folhas modais
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Diálogos próprios
//
// `confirm()` e `alert()` nativos são IGNORADOS quando a página roda dentro de
// um iframe com sandbox — que é o caso do link publicado. O navegador devolve
// `false` sem mostrar nada, e toda ação protegida por confirmação simplesmente
// não acontecia. Por isso a confirmação é desenhada na própria página.
// ---------------------------------------------------------------------------

let resolverDialogo = null;
let temporizadorRecado = null;

function confirmar({ titulo, mensagem = '', rotulo = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    // Se já houver um diálogo aberto, o anterior responde "não" e sai.
    if (resolverDialogo) fecharDialogo(false);
    resolverDialogo = resolve;
    const el = document.getElementById('dialogo');
    el.innerHTML = `<div class="folha-fundo" data-acao="dialogo-nao"></div>
      <div class="dialogo-corpo" role="alertdialog" aria-modal="true">
        <h2 class="dialogo-titulo">${escapar(titulo)}</h2>
        ${mensagem ? `<p class="dialogo-texto">${escapar(mensagem)}</p>` : ''}
        <div class="folha-acoes">
          <button class="botao-principal${perigo ? ' perigo' : ''}" data-acao="dialogo-sim">${escapar(rotulo)}</button>
          <button class="botao-secundario" data-acao="dialogo-nao">Cancelar</button>
        </div>
      </div>`;
    el.hidden = false;
    el.querySelector('[data-acao="dialogo-sim"]').focus();
  });
}

function fecharDialogo(resposta) {
  const el = document.getElementById('dialogo');
  el.hidden = true;
  el.innerHTML = '';
  const responder = resolverDialogo;
  resolverDialogo = null;
  if (responder) responder(resposta);
}

/** Recado passageiro, no lugar do alert() que o sandbox engole. */
function avisar(mensagem) {
  const el = document.getElementById('recado');
  el.textContent = mensagem;
  el.hidden = false;
  clearTimeout(temporizadorRecado);
  temporizadorRecado = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}

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
      const n = estado.registros.filter((x) => x.receitaId === r.id).length;
      const atual = r.id === estado.receitaAtivaId;
      return `<div class="item-receita" aria-current="${atual}">
        <button class="linha-receita" data-acao="trocar-receita" data-id="${r.id}">
          <span class="marca">${atual ? '●' : '○'}</span>
          <span class="nome">${escapar(r.nome)}</span>
          <span class="contagem">${n} ${n === 1 ? 'fornada' : 'fornadas'}</span>
        </button>
        <span class="acoes-receita">
          <button data-acao="renomear-receita" data-id="${r.id}" aria-label="Renomear ${escapar(r.nome)}" title="Renomear">✎</button>
          <button data-acao="duplicar-receita" data-id="${r.id}" aria-label="Duplicar ${escapar(r.nome)}" title="Duplicar">⧉</button>
          <button data-acao="apagar-receita" data-id="${r.id}" aria-label="Apagar ${escapar(r.nome)}" title="Apagar">🗑</button>
        </span>
      </div>`;
    })
    .join('');

  abrirFolha(`
    <h2 class="folha-titulo">Receitas</h2>
    <div class="lista-receitas">${itens}</div>
    <button class="botao-adicionar" data-acao="nova-receita">+ Nova receita</button>
    <div class="folha-acoes">
      <button class="botao-principal" data-acao="abrir-backup">Backup</button>
      <button class="botao-secundario" data-acao="fechar-folha">Fechar</button>
    </div>
  `);
}

function folhaNomeReceita(titulo, valorInicial, acao, id) {
  abrirFolha(`
    <h2 class="folha-titulo">${titulo}</h2>
    <label class="campo-livre">
      <span>Nome da receita</span>
      <input type="text" id="nome-receita" value="${escapar(valorInicial)}" placeholder="Integral 500 g">
    </label>
    <div class="folha-acoes">
      <button class="botao-principal" data-acao="${acao}" ${id ? `data-id="${id}"` : ''}>Salvar</button>
      <button class="botao-secundario" data-acao="abrir-receitas">Cancelar</button>
    </div>
  `);
  const campo = document.getElementById('nome-receita');
  campo.focus();
  campo.select();
}

function folhaBackup() {
  const json = exportar(estado);
  const dentroDeIframe = window.self !== window.top;
  abrirFolha(`
    <h2 class="folha-titulo">Backup</h2>
    <p class="nota-rodape" style="margin-bottom:14px">O aplicativo guarda tudo só neste aparelho. Limpar os dados do navegador apaga o diário.${
      dentroDeIframe
        ? ' Esta página está aberta dentro de outra, onde o navegador costuma bloquear download — se o botão não fizer nada, use copiar.'
        : ''
    }</p>

    <div class="folha-acoes" style="margin-top:0">
      <button class="botao-principal" data-acao="exportar">Baixar arquivo</button>
      <button class="botao-secundario" data-acao="copiar">Copiar</button>
    </div>
    <label class="campo-livre" style="margin-top:14px">
      <span>Ou selecione e copie daqui</span>
      <textarea id="json-saida" readonly rows="5">${escapar(json)}</textarea>
    </label>

    <h2 class="folha-titulo" style="margin-top:26px">Restaurar</h2>
    <div class="folha-acoes" style="margin-top:0">
      <button class="botao-secundario" style="flex:1" data-acao="importar">Escolher arquivo…</button>
    </div>
    <label class="campo-livre" style="margin-top:14px">
      <span>Ou cole aqui o conteúdo do backup</span>
      <textarea id="json-entrada" rows="5" placeholder='{"app":"aplicativo-pao", …}'></textarea>
    </label>
    <button class="botao-principal" data-acao="importar-texto">Restaurar do texto</button>
    <input type="file" id="arquivo-importar" accept="application/json,.json" hidden>
  `);
}

function folhaEscolherFarinha(alvo) {
  const ativa = receitaAtiva(estado);
  const jaTem = new Set(ativa.entradas[alvo].map((c) => c.farinhaId));
  const disponiveis = ativa.entradas.farinhas.filter((f) => !jaTem.has(f.id));
  const onde = alvo === 'composicaoPao' ? 'à massa' : 'ao starter';

  abrirFolha(`
    <h2 class="folha-titulo">Acrescentar farinha ${onde}</h2>
    ${disponiveis.length
      ? `<div class="lista-receitas">
           ${disponiveis
             .map(
               (f) => `<div class="item-receita">
                 <button class="linha-receita" data-acao="usar-farinha" data-alvo="${alvo}" data-id="${f.id}">
                   <span class="marca">+</span>
                   <span class="nome">${escapar(f.nome)}</span>
                   <span class="contagem">${f.preco > 0 ? `R$ ${fmtNum(f.preco, 2)}/kg` : 'sem preço'}</span>
                 </button>
               </div>`
             )
             .join('')}
         </div>
         <p class="nota-rodape">Já no seu catálogo. Escolher aqui não mexe na outra composição.</p>`
      : '<p class="nota-rodape">Todas as farinhas do catálogo já estão nesta composição.</p>'}

    <h2 class="folha-titulo" style="margin-top:26px">Ou crie uma nova</h2>
    <label class="campo-livre">
      <span>Nome da farinha</span>
      <input type="text" id="nome-farinha" placeholder="Espelta, trigo sarraceno…">
    </label>
    <div class="folha-acoes">
      <button class="botao-principal" data-acao="nova-farinha" data-alvo="${alvo}">Criar e acrescentar</button>
      <button class="botao-secundario" data-acao="fechar-folha">Cancelar</button>
    </div>
  `);
}

function folhaFornada() {
  const r = calcular(receitaAtiva(estado).entradas);
  abrirFolha(`
    <h2 class="folha-titulo">Registrar fornada</h2>

    <label class="campo-livre">
      <span>Quando</span>
      <input type="datetime-local" id="f-quando" value="${paraCampoDataHora(new Date().toISOString())}">
    </label>

    <label class="campo-livre">
      <span>Observação</span>
      <textarea id="f-obs" rows="4" placeholder="O que você mudou, o que reparou, o que tentaria da próxima vez."></textarea>
    </label>

    <label class="campo-livre">
      <span>Peso real assado, por pão — estimado ${fmtNum(r.pao.pesoAssado, 0)} g</span>
      <input type="text" inputmode="decimal" id="f-peso" placeholder="pese um pão e anote">
    </label>

    ${GRUPOS_DE_ESCALA.map(
      (grupo) => `<div class="escalas">
        <span class="escalas-titulo">${grupo}</span>
        ${ESCALAS.filter((e) => e.grupo === grupo)
          .map(
            (e) => `<div class="escala">
              <span class="escala-texto">
                <span class="escala-nome">${e.rotulo}</span>
                ${e.extremos ? `<span class="escala-extremos">${escapar(e.extremos[0])} <span class="seta">→</span> ${escapar(e.extremos[1])}</span>` : ''}
              </span>
              <span class="escala-botoes">
                ${[1, 2, 3, 4, 5]
                  .map((n) => `<button type="button" data-acao="escala" data-chave="${e.chave}" data-nota="${n}" aria-pressed="false">${n}</button>`)
                  .join('')}
              </span>
            </div>`
          )
          .join('')}
      </div>`
    ).join('')}

    <div class="trio">
      <label class="campo-livre"><span>Fermentação (h)</span><input type="text" inputmode="decimal" id="f-fermentacao"></label>
      <label class="campo-livre"><span>Geladeira (h)</span><input type="text" inputmode="decimal" id="f-geladeira"></label>
      <label class="campo-livre"><span>Ambiente (°C)</span><input type="text" inputmode="decimal" id="f-temp"></label>
    </div>
    <p class="nota-rodape" style="margin-top:-4px">
      <strong>Fermentação</strong> é o tempo em massa, da mistura até dividir e modelar.
      <strong>Geladeira</strong> é o retardo a frio depois de modelado.
      <strong>Ambiente</strong> é a temperatura da cozinha — é ela que faz a mesma
      receita levar 4 h no verão e 8 h no inverno. Deixe em branco o que não usou.
    </p>

    <div class="folha-acoes">
      <button class="botao-principal" data-acao="salvar-fornada">Salvar fornada</button>
      <button class="botao-secundario" data-acao="fechar-folha">Cancelar</button>
    </div>
  `);
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function aplicarBackup(texto) {
  const resultado = importar(texto);
  if (!resultado.ok) {
    avisar(`Não deu para importar: ${resultado.erro}`);
    return;
  }
  const n = resultado.estado.receitas.length;
  const f = resultado.estado.registros.length;
  const ok = await confirmar({
    titulo: 'Restaurar backup?',
    mensagem: `Isto substitui tudo que está neste aparelho por ${n} receita${n === 1 ? '' : 's'} e ${f} fornada${f === 1 ? '' : 's'} do arquivo.`,
    rotulo: 'Restaurar',
    perigo: true,
  });
  if (!ok) return;
  estado = resultado.estado;
  persistencia.salvar(estado);
  fecharFolha();
  render();
  avisar('Backup restaurado.');
}

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

function baixarBackup() {
  try {
    const blob = new Blob([exportar(estado)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    avisar('O navegador bloqueou o download. Use "Copiar" e guarde o texto num arquivo.');
  }
}

async function copiarBackup(botao) {
  const texto = exportar(estado);
  const avisar = (msg) => {
    botao.textContent = msg;
    setTimeout(() => { botao.textContent = 'Copiar'; }, 1800);
  };
  try {
    await navigator.clipboard.writeText(texto);
    avisar('Copiado ✓');
  } catch {
    // Sem permissão de área de transferência: seleciona o texto para o usuário
    // copiar na mão, que é o único caminho que sempre funciona.
    const caixa = document.getElementById('json-saida');
    caixa.focus();
    caixa.select();
    avisar('Selecionado');
  }
}

function novoItem(lista) {
  const ativa = receitaAtiva(estado);
  const modelos = {
    liquidos: { nome: 'Novo líquido', pct: 0, fracaoAgua: 0, preco: 0 },
    solidos: { nome: 'Novo sólido', gramasPorPao: 0, preco: 0 },
  };
  ativa.entradas[lista] = [...ativa.entradas[lista], { id: gerarId(lista[0]), ...modelos[lista] }];
  marcarAlterada();
  salvar();
  render();
}

/** Composições referenciam o catálogo por farinhaId; as demais listas têm id próprio. */
function itemPorId(lista, id) {
  const itens = receitaAtiva(estado).entradas[lista];
  if (!Array.isArray(itens)) return null;
  return itens.find((x) => x.id === id || x.farinhaId === id) ?? null;
}

function moldeDe(lista, attr) {
  if (attr === 'preco') return MOLDE.preco;
  if (attr === 'gramasPorPao') return MOLDE.gramasPorPao;
  if (attr === 'fracaoAgua') return MOLDE.fracaoAgua;
  return MOLDE.pct;
}

function aplicarEntrada(chave, valorExibido) {
  const campo = CAMPO_POR_CHAVE[chave];
  const ativa = receitaAtiva(estado);
  // Opção é guardada como veio: `paraArmazenamento` divide pelo fator e
  // transformaria 'boule' em NaN.
  const valor = campo.tipo === 'opcoes' ? valorExibido : paraArmazenamento(campo, valorExibido);
  ativa.entradas = { ...ativa.entradas, [chave]: valor };
  marcarAlterada();
  atualizar();
  salvar();
}

function aplicarItem(lista, id, attr, valorExibido) {
  const item = itemPorId(lista, id);
  if (!item) return;
  item[attr] = paraArmazenamento(moldeDe(lista, attr), valorExibido);
  marcarAlterada();
  atualizar();
  salvar();
}

const ACOES = {
  'dialogo-sim': () => fecharDialogo(true),
  'dialogo-nao': () => fecharDialogo(false),

  'abrir-receitas': folhaReceitas,
  'abrir-backup': folhaBackup,
  'fechar-folha': fecharFolha,
  'nova-fornada': folhaFornada,
  'salvar-fornada': salvarFornada,
  exportar: baixarBackup,
  copiar: copiarBackup,

  importar() {
    document.getElementById('arquivo-importar').click();
  },

  'importar-texto'() {
    const texto = document.getElementById('json-entrada').value.trim();
    if (!texto) {
      avisar('Cole o conteúdo do backup na caixa antes de restaurar.');
      return;
    }
    return aplicarBackup(texto);
  },

  'alternar-objetivo'() {
    objetivoAberto = !objetivoAberto;
    render();
  },

  filtro(el) {
    filtroDiario = el.dataset.valor;
    render();
  },

  'add-liquido': () => novoItem('liquidos'),
  'add-solido': () => novoItem('solidos'),

  'escolher-farinha'(el) {
    folhaEscolherFarinha(el.dataset.alvo);
  },

  'usar-farinha'(el) {
    const { alvo, id } = el.dataset;
    const ativa = receitaAtiva(estado);
    if (ativa.entradas[alvo].some((c) => c.farinhaId === id)) return;
    ativa.entradas[alvo] = [...ativa.entradas[alvo], { farinhaId: id, pct: 0 }];
    marcarAlterada();
    salvar();
    fecharFolha();
    render();
  },

  'nova-farinha'(el) {
    const { alvo } = el.dataset;
    const nome = document.getElementById('nome-farinha')?.value.trim();
    if (!nome) return;
    const ativa = receitaAtiva(estado);
    const farinha = { id: gerarId('f'), nome, preco: 0 };
    ativa.entradas.farinhas = [...ativa.entradas.farinhas, farinha];
    ativa.entradas[alvo] = [...ativa.entradas[alvo], { farinhaId: farinha.id, pct: 0 }];
    marcarAlterada();
    salvar();
    fecharFolha();
    render();
  },

  async 'remover-item'(el) {
    const { lista, id } = el.dataset;
    const ativa = receitaAtiva(estado);
    const ehComposicao = lista === 'composicaoPao' || lista === 'composicaoStarter';

    if (ehComposicao) {
      if (ativa.entradas[lista].length <= 1) {
        avisar('Precisa sobrar pelo menos uma farinha. Acrescente outra antes de tirar esta.');
        return;
      }
      const nome = ativa.entradas.farinhas.find((f) => f.id === id)?.nome ?? 'esta farinha';
      const onde = lista === 'composicaoPao' ? 'da massa' : 'do starter';
      const ok = await confirmar({
        titulo: `Tirar ${nome} ${onde}?`,
        mensagem: 'Ela continua no catálogo, com o preço guardado, e pode voltar quando você quiser.',
        rotulo: 'Tirar',
      });
      if (!ok) return;
      ativa.entradas[lista] = ativa.entradas[lista].filter((c) => c.farinhaId !== id);
    } else {
      const item = itemPorId(lista, id);
      if (!item) return;
      const ok = await confirmar({
        titulo: `Remover ${item.nome}?`,
        mensagem: 'O ingrediente sai da receita junto com o preço dele.',
        rotulo: 'Remover',
        perigo: true,
      });
      if (!ok) return;
      ativa.entradas[lista] = ativa.entradas[lista].filter((x) => x.id !== id);
    }

    marcarAlterada();
    salvar();
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

  'renomear-receita'(el) {
    const receita = estado.receitas.find((r) => r.id === el.dataset.id);
    if (receita) folhaNomeReceita('Renomear receita', receita.nome, 'confirmar-renomear', receita.id);
  },

  'confirmar-renomear'(el) {
    const nome = document.getElementById('nome-receita').value.trim();
    const receita = estado.receitas.find((r) => r.id === el.dataset.id);
    if (!nome || !receita) return;
    receita.nome = nome;
    salvar();
    folhaReceitas();
    render();
  },

  'duplicar-receita'(el) {
    const origem = estado.receitas.find((r) => r.id === el.dataset.id);
    if (!origem) return;
    const copia = novaReceita(`${origem.nome} (cópia)`, { entradas: origem.entradas });
    estado.receitas.push(copia);
    estado.receitaAtivaId = copia.id;
    salvar();
    fecharFolha();
    render();
  },

  async 'apagar-receita'(el) {
    if (estado.receitas.length === 1) {
      avisar('Esta é a única receita. Crie outra antes de apagar esta.');
      return;
    }
    const receita = estado.receitas.find((r) => r.id === el.dataset.id);
    if (!receita) return;
    const n = estado.registros.filter((r) => r.receitaId === receita.id).length;
    const ok = await confirmar({
      titulo: `Apagar ${receita.nome}?`,
      mensagem: n
        ? `Isto apaga também ${n} fornada${n === 1 ? '' : 's'} do diário. Não dá para desfazer.`
        : 'Não dá para desfazer.',
      rotulo: 'Apagar',
      perigo: true,
    });
    if (!ok) return;

    estado.receitas = estado.receitas.filter((r) => r.id !== receita.id);
    estado.registros = estado.registros.filter((r) => r.receitaId !== receita.id);
    if (!estado.receitas.some((r) => r.id === estado.receitaAtivaId)) {
      estado.receitaAtivaId = estado.receitas[0].id;
    }
    salvar();
    folhaReceitas();
    render();
  },

  async 'apagar-registro'(el) {
    const ok = await confirmar({
      titulo: 'Apagar esta fornada?',
      mensagem: 'A observação e o retrato de parâmetros somem junto. Não dá para desfazer.',
      rotulo: 'Apagar',
      perigo: true,
    });
    if (!ok) return;
    estado.registros = estado.registros.filter((r) => r.id !== el.dataset.id);
    salvar();
    render();
  },

  async calibrar(el) {
    const registro = estado.registros.find((r) => r.id === el.dataset.id);
    if (!registro) return;
    const r = calcular(registro.snapshot);
    const perda = calibrarPerda(r.pao.massaPorPao, Number(registro.pesoRealAssado), r.pao.solidosPorPao);
    if (perda === null) return;

    const ativa = receitaAtiva(estado);
    const ok = await confirmar({
      titulo: 'Calibrar a perda no forno?',
      mensagem: `Troca de ${fmtNum(ativa.entradas.perdaForno * 100, 1)}% para ${fmtNum(perda * 100, 1)}% na receita "${ativa.nome}", medido a partir deste pão.`,
      rotulo: 'Calibrar',
    });
    if (!ok) return;
    ativa.entradas = { ...ativa.entradas, perdaForno: perda };
    marcarAlterada();
    salvar();
    render();
    avisar(`Perda no forno agora é ${fmtNum(perda * 100, 1)}%.`);
  },

  escala(el) {
    const jaMarcado = el.getAttribute('aria-pressed') === 'true';
    el.closest('.escala-botoes').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    el.setAttribute('aria-pressed', String(!jaMarcado));
  },

  passo(el) {
    const { campo: chaveCampo, lista, id, attr, sinal } = el.dataset;
    const molde = chaveCampo ? CAMPO_POR_CHAVE[chaveCampo] : moldeDe(lista, attr);
    const seletor = chaveCampo
      ? `input[data-campo="${chaveCampo}"]`
      : `input[data-lista="${lista}"][data-id="${id}"][data-attr="${attr}"]`;
    const entrada = document.querySelector(seletor);
    if (!entrada) return;

    const atual = paraNumero(entrada.value);
    const proximo = Math.max(0, (Number.isFinite(atual) ? atual : 0) + Number(sinal) * (molde.passo ?? 1));
    // Passos fracionários acumulam ruído binário; a casa decimal do campo corta.
    const limpo = Number(proximo.toFixed(molde.casas ?? 0));

    entrada.value = formatarEntrada(molde, paraArmazenamento(molde, limpo));
    if (chaveCampo) aplicarEntrada(chaveCampo, limpo);
    else aplicarItem(lista, id, attr, limpo);
  },
};

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
    <div class="folha" id="folha" hidden></div>
    <div class="folha dialogo" id="dialogo" hidden></div>
    <div class="recado" id="recado" role="status" hidden></div>`;

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
      // Boa parte das ações é assíncrona por causa dos diálogos próprios; uma
      // rejeição solta não pode derrubar o resto da interface em silêncio.
      Promise.resolve(ACOES[alvo.dataset.acao](alvo)).catch((erro) => {
        avisar('Alguma coisa deu errado nesta ação.');
        console.error(erro);
      });
    }
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    if (resolverDialogo) fecharDialogo(false);
    else if (!document.getElementById('folha').hidden) fecharFolha();
  });

  document.addEventListener('input', (evento) => {
    const alvo = evento.target;

    // Só `input` de verdade: os botões de passo carregam os mesmos data-attrs
    // e não devem ser lidos como fonte de valor.
    if (alvo.matches?.('input[data-campo]')) {
      const valor = paraNumero(alvo.value);
      // Estados intermediários como "70," não devem zerar a receita.
      if (Number.isFinite(valor)) aplicarEntrada(alvo.dataset.campo, valor);
      return;
    }

    if (alvo.matches?.('select[data-campo]')) {
      aplicarEntrada(alvo.dataset.campo, alvo.value);
      return;
    }

    if (alvo.matches?.('input[data-lista][data-attr]')) {
      const { lista, id, attr } = alvo.dataset;
      if (attr === 'nome') {
        const item = itemPorId(lista, id);
        if (item) {
          item.nome = alvo.value;
          marcarAlterada();
          atualizar();
          salvar();
        }
        return;
      }
      const valor = paraNumero(alvo.value);
      if (Number.isFinite(valor)) aplicarItem(lista, id, attr, valor);
    }
  });

  // Input de arquivo dispara `change`, não `input` — escutar o evento errado
  // fazia a importação nunca acontecer.
  document.addEventListener('change', (evento) => {
    const arquivo = evento.target.closest?.('#arquivo-importar');
    if (!arquivo || !arquivo.files?.[0]) return;
    const leitor = new FileReader();
    leitor.onload = () => aplicarBackup(String(leitor.result));
    leitor.onerror = () => avisar('Não deu para ler o arquivo.');
    leitor.readAsText(arquivo.files[0]);
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
