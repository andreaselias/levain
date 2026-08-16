/**
 * Motor de cálculo do aplicativo de pão.
 *
 * Função pura, sem DOM e sem estado: recebe as entradas, devolve todos os
 * resultados das três abas de uma vez. As abas da interface são recortes deste
 * objeto — nenhum valor derivado é guardado em outro lugar.
 *
 * Fiel à planilha Tabela_de_pao.xlsx. Ver docs/superpowers/specs/ para a
 * referência de fórmulas e os valores que servem de critério de aceitação.
 */

/**
 * Proporções de cada formato, com a largura valendo 1.
 *
 * `preenchimento` é quanto do retângulo envolvente a massa de fato ocupa —
 * junta a folga da fôrma com o fato de um pão não ser um tijolo. Por isso é
 * alto na fôrma retangular, onde a massa encosta na parede, e baixo nos
 * formatos livres, que são arredondados e crescem sem parede que os contenha.
 */
export const FORMATOS = [
  { chave: 'batard', rotulo: 'Batard', razaoC: 2.2, razaoA: 0.85, preenchimento: 0.55 },
  { chave: 'boule', rotulo: 'Boule', razaoC: 1, razaoA: 0.7, preenchimento: 0.6 },
  { chave: 'baguete', rotulo: 'Baguete / filão', razaoC: 6, razaoA: 0.9, preenchimento: 0.55 },
  { chave: 'retangular', rotulo: 'Fôrma retangular', razaoC: 3.2, razaoA: 1, preenchimento: 0.8 },
];

export const FORMATO_POR_CHAVE = Object.fromEntries(FORMATOS.map((f) => [f.chave, f]));

export const ENTRADAS_PADRAO = {
  // Objetivo — muda a cada produção e dimensiona todo o resto
  pesoAssadoDesejado: 500,
  numeroPaes: 2,

  // Composição, em percentual sobre a farinha total adicionada
  hidratacao: 0.7,
  pctStarter: 0.2,
  pctSal: 0.02,

  /**
   * Catálogo de farinhas: só o que é da farinha em si, nome e preço. Quanto
   * entra na massa e quanto entra no pote são duas coisas independentes, e por
   * isso vivem em duas listas separadas — dá para ter centeio na massa sem ter
   * centeio no starter, que é o caso comum.
   */
  farinhas: [
    { id: 'f-branca', nome: 'Farinha branca', preco: 4.46 },
    { id: 'f-integral', nome: 'Farinha integral', preco: 11 },
    { id: 'f-centeio', nome: 'Farinha de centeio', preco: 9 },
  ],

  /**
   * Participação de cada farinha, em percentual sobre a farinha total. A
   * PRIMEIRA de cada lista é a base daquela composição: o percentual dela é
   * ignorado e vale o resto para fechar 100%. É como a planilha se comporta e
   * como o padeiro pensa — declara-se só a farinha especial.
   */
  composicaoPao: [
    { farinhaId: 'f-branca', pct: 0 },
    { farinhaId: 'f-integral', pct: 0.1 },
  ],
  composicaoStarter: [{ farinhaId: 'f-branca', pct: 0 }],

  // Entram na massa. `fracaoAgua` é quanto do líquido é água de fato:
  // azeite 0, melado 0,25, mel 0,18, leite 0,87.
  liquidos: [], // { id, nome, pct, fracaoAgua, preco }

  // Não mexem no equilíbrio farinha-água: somam depois, por pão.
  solidos: [], // { id, nome, gramasPorPao, preco }

  // Ajustes
  fatorArredondamento: 10,
  perdaForno: 0.11,
  // Quanto o pão cresce, em cm³ por grama de pão assado. É o que mais varia
  // com a receita — centeio pesado fica em 2,0-2,4, branco bem fermentado
  // passa de 3,5 — e o diário calibra a partir de um pão medido de verdade.
  volumeEspecifico: 2.7,
  formato: 'batard',
  paesPorFornada: 2,
  tempoPreAquecimento: 45,
  tempoCozimento: 40,

  // Starter
  hidratacaoMae: 1,
  propAtivacaoStarter: 1,
  propAtivacaoFarinha: 3,
  propAtivacaoAgua: 3,
  // Passo da balança para o que se pesa ao alimentar o pote. Separado do
  // arredondamento da massa porque a escala é outra: 10 g numa ativação de
  // 54 g destruiria a proporção.
  arredondamentoAtivacao: 1,

  // Custos
  precoSal: 2.5,
  precoKwh: 0.8653,
  potenciaForno: 0.6,
  embalagemExterna: 1.44,
  embalagemInterna: 0.63,
  etiqueta: 0.04,
};

/** Campos que são listas — tratados à parte da cópia de escalares. */
export const LISTAS = ['farinhas', 'composicaoPao', 'composicaoStarter', 'liquidos', 'solidos'];

/**
 * Campos escalares que guardam texto, não número. Existem para serem pulados
 * pelos laços que coagem tudo com `num()` — sem isso, 'boule' vira o padrão
 * numérico silenciosamente.
 */
export const TEXTOS = ['formato'];

/**
 * O Excel normaliza para 15 dígitos significativos antes de arredondar. Sem
 * isso, (590+60)*0,7 vale 454,99999999999994 em ponto flutuante e a água sai
 * 390 g em vez de 400 g — a planilha dá 400.
 */
function precisao15(x) {
  if (!Number.isFinite(x) || x === 0) return x;
  return Number(x.toPrecision(15));
}

/** Arredondamento do Excel: metade para longe do zero (JS arredonda para +∞). */
function excelRound(x) {
  const v = precisao15(x);
  return v < 0 ? -Math.round(-v) : Math.round(v);
}

/** ROUNDUP do Excel: teto em valor absoluto. */
function roundUp(x) {
  const v = precisao15(x);
  return v < 0 ? -Math.ceil(-v) : Math.ceil(v);
}

function num(valor, padrao) {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

const fin = (x) => (Number.isFinite(x) ? x : 0);

function comoLista(valor) {
  return Array.isArray(valor) ? valor.filter((x) => x && typeof x === 'object') : [];
}

/**
 * Reparte um total entre pesos mantendo cada parte num múltiplo do passo e a
 * soma exatamente igual ao total.
 *
 * Usa maior resto: arredonda todas as partes para baixo e distribui as unidades
 * que sobraram para quem tinha a maior fração. Arredondar cada parte por conta
 * própria pareceria mais simples, mas aí a soma não fecha — e na cozinha isso
 * vira uma grama a mais ou a menos de farinha sem explicação.
 *
 * A conta é feita em unidades inteiras do passo, o que também evita o ruído de
 * ponto flutuante de somar 32,4 + 13,5 + 8,1.
 */
function repartirEmPassos(total, pesos, passo) {
  if (pesos.length === 0) return [];
  if (!(passo > 0)) return pesos.map((p) => total * p);

  const unidades = Math.round(total / passo);
  const ideais = pesos.map((p) => unidades * p);
  const partes = ideais.map((v) => Math.floor(v + 1e-9));

  let sobra = unidades - partes.reduce((soma, v) => soma + v, 0);
  const porResto = ideais
    .map((v, i) => ({ i, resto: v - Math.floor(v + 1e-9) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);

  let k = 0;
  while (sobra > 0 && porResto.length > 0) {
    partes[porResto[k % porResto.length].i] += 1;
    sobra -= 1;
    k += 1;
  }
  return partes.map((u) => u * passo);
}

export function calcular(entradas) {
  const avisos = [];
  const bruto = entradas && typeof entradas === 'object' ? entradas : {};

  const e = {};
  for (const [chave, padrao] of Object.entries(ENTRADAS_PADRAO)) {
    if (LISTAS.includes(chave) || TEXTOS.includes(chave)) continue;
    e[chave] = num(bruto[chave], padrao);
  }
  // Formato desconhecido cai no padrão: o resto da conta lê as razões da tabela
  // e não tem como seguir sem elas.
  e.formato = Object.hasOwn(FORMATO_POR_CHAVE, bruto.formato) ? bruto.formato : ENTRADAS_PADRAO.formato;

  const farinhas = comoLista(bruto.farinhas ?? ENTRADAS_PADRAO.farinhas).map((f, i) => ({
    id: f.id ?? `f${i}`,
    nome: String(f.nome ?? 'Farinha'),
    preco: num(f.preco, 0),
  }));
  const catalogo = new Map(farinhas.map((f) => [f.id, f]));
  const liquidos = comoLista(bruto.liquidos).map((l, i) => ({
    id: l.id ?? `l${i}`,
    nome: String(l.nome ?? 'Líquido'),
    pct: Math.max(0, num(l.pct, 0)),
    fracaoAgua: Math.min(1, Math.max(0, num(l.fracaoAgua, 0))),
    preco: num(l.preco, 0),
  }));
  const solidos = comoLista(bruto.solidos).map((s, i) => ({
    id: s.id ?? `s${i}`,
    nome: String(s.nome ?? 'Sólido'),
    gramasPorPao: Math.max(0, num(s.gramasPorPao, 0)),
    preco: num(s.preco, 0),
  }));

  const R = e.fatorArredondamento;
  // Fator de arredondamento zero ou negativo significa "não arredondar".
  const snap = (x) => (R > 0 ? excelRound(x / R) * R : x);

  // --- 1. Composições ------------------------------------------------------
  // Cada composição é uma lista própria com a sua própria base, que fecha os
  // 100%. Entrada apontando para farinha que não existe mais é descartada.
  function resolverComposicao(bruta, ondeErro) {
    const itens = comoLista(bruta)
      .filter((c) => catalogo.has(c.farinhaId))
      .map((c) => ({ farinha: catalogo.get(c.farinhaId), pct: Math.max(0, num(c.pct, 0)) }));
    if (itens.length === 0) return [];

    const somaOutras = itens.slice(1).reduce((s, c) => s + c.pct, 0);
    if (somaOutras > 1) {
      avisos.push(`As farinhas ${ondeErro} somam mais de 100%. Reduza alguma para sobrar espaço para a base.`);
    }
    return itens.map((c, i) => ({
      id: c.farinha.id,
      nome: c.farinha.nome,
      preco: c.farinha.preco,
      base: i === 0,
      pct: i === 0 ? Math.max(0, 1 - somaOutras) : c.pct,
    }));
  }

  const composicaoPao = resolverComposicao(
    bruto.composicaoPao ?? ENTRADAS_PADRAO.composicaoPao,
    'da massa'
  );
  const composicaoStarter = resolverComposicao(
    bruto.composicaoStarter ?? ENTRADAS_PADRAO.composicaoStarter,
    'do starter'
  );
  if (composicaoPao.length === 0) {
    avisos.push('A massa precisa de pelo menos uma farinha.');
  }

  // --- 2. Starter ativado --------------------------------------------------
  // Precisa vir antes da farinha: a hidratação do starter entra no denominador.
  const rSt = e.propAtivacaoStarter;
  const rFl = e.propAtivacaoFarinha;
  const rWa = e.propAtivacaoAgua;
  const somaProp = rSt + rFl + rWa;
  const divisorMae = 1 + e.hidratacaoMae;

  let hAct = 0;
  if (rSt <= 0) {
    avisos.push('A proporção de starter na ativação precisa ser maior que zero.');
  } else if (divisorMae <= 0) {
    avisos.push('A hidratação do starter-mãe precisa ser maior que -100%.');
  } else {
    const farinhaDaProporcao = rFl + rSt / divisorMae;
    if (farinhaDaProporcao === 0) {
      avisos.push('As proporções de ativação não produzem farinha alguma.');
    } else {
      hAct = (rWa + (rSt * e.hidratacaoMae) / divisorMae) / farinhaDaProporcao;
    }
  }
  const divisorAtivado = 1 + hAct;

  // --- 3. Peso-alvo da massa e farinha total ------------------------------
  let alvoMassa = 0;
  if (e.numeroPaes <= 0) {
    avisos.push('O número de pães precisa ser maior que zero.');
  } else if (e.perdaForno >= 1) {
    avisos.push('A perda no forno precisa ser menor que 100%.');
  } else {
    alvoMassa = (e.pesoAssadoDesejado * e.numeroPaes) / (1 - e.perdaForno);
  }

  const somaLiquidos = liquidos.reduce((s, l) => s + l.pct, 0);
  const somaLiquidosAgua = liquidos.reduce((s, l) => s + l.pct * l.fracaoAgua, 0);

  // Soma dos percentuais em função da farinha adicionada, descontando a farinha
  // e a água que já chegam dentro do starter e a água que vem nos líquidos.
  const denom =
    divisorAtivado === 0
      ? 0
      : 1 +
        e.pctStarter +
        e.pctSal +
        somaLiquidos +
        e.hidratacao * (1 + e.pctStarter / divisorAtivado) -
        (e.pctStarter * hAct) / divisorAtivado -
        somaLiquidosAgua;

  let farinhaTotal = 0;
  if (composicaoPao.length === 0) {
    farinhaTotal = 0;
  } else if (denom <= 0) {
    avisos.push('Os percentuais informados não fecham numa receita possível.');
  } else {
    farinhaTotal = snap(alvoMassa / denom);
  }

  // --- 4. Ingredientes -----------------------------------------------------
  // Cada linha arredonda por conta própria, como na planilha.
  const pesosFarinha = composicaoPao.map((f) => ({ ...f, gramas: snap(farinhaTotal * f.pct) }));

  const starter = snap(farinhaTotal * e.pctStarter);
  const farinhaNoStarter = divisorAtivado === 0 ? 0 : starter / divisorAtivado;
  const aguaNoStarter = divisorAtivado === 0 ? 0 : (starter * hAct) / divisorAtivado;

  const pesosLiquido = liquidos.map((l) => {
    const g = snap(farinhaTotal * l.pct);
    return { id: l.id, nome: l.nome, preco: l.preco, pct: l.pct, fracaoAgua: l.fracaoAgua, gramas: g, agua: g * l.fracaoAgua };
  });
  const aguaDosLiquidos = pesosLiquido.reduce((s, l) => s + l.agua, 0);

  const agua = snap((farinhaTotal + farinhaNoStarter) * e.hidratacao - aguaNoStarter - aguaDosLiquidos);
  const sal = snap(farinhaTotal * e.pctSal);

  const pesosSolido = solidos.map((s) => ({
    id: s.id,
    nome: s.nome,
    preco: s.preco,
    gramasPorPao: s.gramasPorPao,
    gramas: s.gramasPorPao * Math.max(0, e.numeroPaes),
  }));

  // --- 5. Métricas ---------------------------------------------------------
  const somaFarinhas = pesosFarinha.reduce((s, f) => s + f.gramas, 0);
  const somaLiquidosGramas = pesosLiquido.reduce((s, l) => s + l.gramas, 0);
  const massaTotal = somaFarinhas + agua + starter + sal + somaLiquidosGramas;
  const massaPorPao = e.numeroPaes > 0 ? excelRound(massaTotal / e.numeroPaes) : 0;

  const solidosPorPao = pesosSolido.reduce((s, x) => s + x.gramasPorPao, 0);
  const solidosTotal = pesosSolido.reduce((s, x) => s + x.gramas, 0);
  const pesoTotal = massaTotal + solidosTotal;
  const pesoPorPao = massaPorPao + solidosPorPao;

  const farinhaParaHidratacao = somaFarinhas + farinhaNoStarter;
  const hidratacaoReal =
    farinhaParaHidratacao > 0 ? (agua + aguaNoStarter + aguaDosLiquidos) / farinhaParaHidratacao : 0;

  // A perda vale só para a massa: castanha e semente não perdem água no forno.
  const pesoAssadoMassa = massaPorPao * (1 - e.perdaForno);
  const pesoAssado = pesoAssadoMassa + solidosPorPao;

  // A ordem importa: o volume é dividido pelas razões ANTES da raiz cúbica.
  // Fazer o contrário — que era o que esta conta fazia — infla a caixa pelo
  // produto das razões e faz o volume específico significar outra coisa.
  // `e.formato` já saiu validado da normalização, então a busca direta basta.
  const fmt = FORMATO_POR_CHAVE[e.formato];
  // Volume específico negativo não devia existir, mas a entrada não é
  // validada antes daqui — sem o segundo termo da guarda, a fôrma sairia com
  // volume negativo enquanto as dimensões, protegidas por `volumeForma > 0`,
  // zerariam. Melhor as duas coisas zeradas juntas do que uma se contradizendo.
  const volumeForma =
    pesoAssado > 0 && e.volumeEspecifico > 0 ? (pesoAssado * e.volumeEspecifico) / fmt.preenchimento : 0;
  const largura = volumeForma > 0 ? Math.cbrt(volumeForma / (fmt.razaoC * fmt.razaoA)) : 0;
  const comprimento = largura * fmt.razaoC;
  const altura = largura * fmt.razaoA;
  if (!(e.paesPorFornada > 0)) {
    avisos.push('Quantos pães cabem por fornada precisa ser maior que zero.');
  }
  const fornadas = e.numeroPaes > 0 && e.paesPorFornada > 0 ? roundUp(e.numeroPaes / e.paesPorFornada) : 0;
  const tempoTotal = e.tempoPreAquecimento + e.tempoCozimento * fornadas;

  // --- 6. Ativação do starter ---------------------------------------------
  // Tudo que se pesa ao alimentar o pote cai no passo da balança: as
  // proporções sozinhas produzem valores como 46,667 g, que ninguém mede.
  const passoAtivacao = e.arredondamentoAtivacao;
  const snapAtivacao = (x) => (passoAtivacao > 0 ? excelRound(x / passoAtivacao) * passoAtivacao : x);

  let maeParaAtivar = 0;
  let farinhaAtivar = 0;
  let aguaAtivar = 0;
  if (rSt > 0 && somaProp > 0) {
    maeParaAtivar = roundUp((starter * rSt) / somaProp);
    farinhaAtivar = snapAtivacao((maeParaAtivar * rFl) / rSt);
    aguaAtivar = snapAtivacao((maeParaAtivar * rWa) / rSt);
  }
  const totalAtivado = maeParaAtivar + farinhaAtivar + aguaAtivar;
  const sobra = Math.max(totalAtivado - starter, 0);

  // A farinha embutida no starter, repartida pela composição DELE — que é
  // independente da massa. É o que permite cobrar o preço certo de um starter
  // de centeio dentro de um pão branco.
  const farinhasDoStarter = composicaoStarter.map((f) => ({
    id: f.id,
    nome: f.nome,
    pct: f.pct,
    gramas: farinhaNoStarter * f.pct,
  }));

  // A farinha que se PESA para alimentar o pote, repartida pela mesma
  // composição. Sem isto o ticket de ativação diz só "farinha: 54 g" e quem
  // tem um pote misto não sabe quanto pôr de cada uma. As partes caem no passo
  // da balança e ainda assim somam o total exato.
  const gramasParaAtivar = repartirEmPassos(
    farinhaAtivar,
    composicaoStarter.map((f) => f.pct),
    passoAtivacao
  );
  const farinhasParaAtivar = composicaoStarter.map((f, i) => ({
    id: f.id,
    nome: f.nome,
    pct: f.pct,
    gramas: gramasParaAtivar[i] ?? 0,
  }));

  // --- 7. Custos -----------------------------------------------------------
  // Preços de ingrediente são por quilo; embalagem e etiqueta, por unidade.
  const embalagem = e.embalagemExterna + e.embalagemInterna + e.etiqueta;
  const energia = (tempoTotal / 60) * e.potenciaForno * e.precoKwh;

  /**
   * Uma linha por ingrediente que está de fato na receita. Existe porque
   * ingrediente é opcional: sem enxergar item a item, um extra sem preço sai
   * de graça e o custo total mente sem dar sinal.
   */
  const itensDeCusto = [];

  // Uma farinha pode estar nas duas composições, e aí é uma compra só: os
  // gramas se somam numa linha, não em duas.
  const gramasPorFarinha = new Map();
  const somarGramas = (id, chave, valor) => {
    if (!gramasPorFarinha.has(id)) gramasPorFarinha.set(id, { gramasPao: 0, gramasStarter: 0 });
    gramasPorFarinha.get(id)[chave] += valor;
  };
  for (const f of pesosFarinha) somarGramas(f.id, 'gramasPao', f.gramas);
  for (const f of farinhasDoStarter) somarGramas(f.id, 'gramasStarter', f.gramas);

  for (const f of farinhas) {
    const parcelas = gramasPorFarinha.get(f.id);
    if (!parcelas) continue;
    const gramas = parcelas.gramasPao + parcelas.gramasStarter;
    if (gramas <= 0) continue;
    itensDeCusto.push({
      id: f.id,
      nome: f.nome,
      tipo: 'farinha',
      gramas: fin(gramas),
      gramasPao: fin(parcelas.gramasPao),
      gramasStarter: fin(parcelas.gramasStarter),
      preco: fin(f.preco),
      custo: fin((f.preco * gramas) / 1000),
    });
  }
  if (sal > 0) {
    itensDeCusto.push({
      id: 'sal',
      nome: 'Sal',
      tipo: 'sal',
      gramas: fin(sal),
      preco: fin(e.precoSal),
      custo: fin((e.precoSal * sal) / 1000),
    });
  }
  for (const l of pesosLiquido) {
    if (l.gramas <= 0) continue;
    itensDeCusto.push({
      id: l.id,
      nome: l.nome,
      tipo: 'liquido',
      gramas: fin(l.gramas),
      preco: fin(l.preco),
      custo: fin((l.preco * l.gramas) / 1000),
    });
  }
  for (const s of pesosSolido) {
    if (s.gramas <= 0) continue;
    itensDeCusto.push({
      id: s.id,
      nome: s.nome,
      tipo: 'solido',
      gramas: fin(s.gramas),
      gramasPorPao: fin(s.gramasPorPao),
      preco: fin(s.preco),
      custo: fin((s.preco * s.gramas) / 1000),
    });
  }

  const custoIngredientes = itensDeCusto.reduce((soma, i) => soma + i.custo, 0);
  const semPreco = itensDeCusto.filter((i) => !(i.preco > 0)).map((i) => i.nome);

  const embalagemTotal = embalagem * Math.max(0, e.numeroPaes);
  const producao = embalagemTotal + custoIngredientes + energia;
  const porPaoEmbalado = e.numeroPaes > 0 ? producao / e.numeroPaes : 0;
  const porPao = e.numeroPaes > 0 ? porPaoEmbalado - embalagem : 0;

  const limpar = (lista, campos) =>
    lista.map((item) => {
      const saida = { ...item };
      for (const c of campos) saida[c] = fin(saida[c]);
      return saida;
    });

  return {
    starter: {
      hidratacaoAtivado: fin(hAct),
      maeParaAtivar: fin(maeParaAtivar),
      farinhaAtivar: fin(farinhaAtivar),
      aguaAtivar: fin(aguaAtivar),
      farinhaNoStarter: fin(farinhaNoStarter),
      aguaNoStarter: fin(aguaNoStarter),
      totalAtivado: fin(totalAtivado),
      sobra: fin(sobra),
      farinhas: limpar(farinhasDoStarter, ['pct', 'gramas']),
      farinhasAtivar: limpar(farinhasParaAtivar, ['pct', 'gramas']),
    },
    pao: {
      farinhas: limpar(pesosFarinha, ['pct', 'gramas', 'preco']),
      liquidos: limpar(pesosLiquido, ['pct', 'fracaoAgua', 'gramas', 'agua', 'preco']),
      solidos: limpar(pesosSolido, ['gramasPorPao', 'gramas', 'preco']),
      agua: fin(agua),
      starter: fin(starter),
      sal: fin(sal),
      farinhaTotal: fin(farinhaTotal),
      alvoMassa: fin(alvoMassa),
      massaTotal: fin(massaTotal),
      massaPorPao: fin(massaPorPao),
      solidosPorPao: fin(solidosPorPao),
      solidosTotal: fin(solidosTotal),
      pesoTotal: fin(pesoTotal),
      pesoPorPao: fin(pesoPorPao),
      hidratacaoReal: fin(hidratacaoReal),
      pesoAssadoMassa: fin(pesoAssadoMassa),
      pesoAssado: fin(pesoAssado),
      formato: e.formato,
      largura: fin(largura),
      comprimento: fin(comprimento),
      altura: fin(altura),
      volumeForma: fin(volumeForma),
      fornadas: fin(fornadas),
      tempoTotal: fin(tempoTotal),
    },
    custos: {
      embalagem: fin(embalagem),
      embalagemTotal: fin(embalagemTotal),
      ingredientes: fin(custoIngredientes),
      itens: itensDeCusto,
      semPreco,
      energia: fin(energia),
      producao: fin(producao),
      porPao: fin(porPao),
      porPaoEmbalado: fin(porPaoEmbalado),
    },
    avisos,
  };
}

/**
 * Resolve a perda real no forno a partir de um pão que foi de fato pesado.
 * Os sólidos são descontados dos dois lados: eles não perdem água, então
 * incluí-los faria a perda parecer menor do que é.
 */
export function calibrarPerda(massaPorPao, pesoRealAssado, solidosPorPao = 0) {
  const massaAssada = Number(pesoRealAssado) - Number(solidosPorPao || 0);
  if (!(massaPorPao > 0) || !(massaAssada > 0)) return null;
  const perda = 1 - massaAssada / massaPorPao;
  if (!Number.isFinite(perda) || perda < 0 || perda >= 1) return null;
  return perda;
}

/**
 * Resolve o volume específico a partir da altura de um pão medido de verdade,
 * invertendo a geometria da fôrma.
 *
 * Mede-se a altura e não o comprimento porque é ela que responde ao
 * crescimento: o comprimento de um batard quem define é o shaping.
 *
 * Quem chama passa o peso assado REAL quando houver um pão pesado. Usar o
 * estimado faria o erro da perda no forno entrar aqui dentro, e os dois
 * parâmetros passariam a se contaminar a cada calibração.
 */
export function calibrarVolumeEspecifico(pesoRealAssado, alturaReal, formato) {
  // Busca por propriedade própria: a chave vem de fora e `[formato]` num
  // objeto comum aprovaria 'constructor' como se fosse formato.
  const fmt = Object.hasOwn(FORMATO_POR_CHAVE, formato) ? FORMATO_POR_CHAVE[formato] : null;
  const peso = Number(pesoRealAssado);
  const altura = Number(alturaReal);
  if (!fmt || !(peso > 0) || !(altura > 0)) return null;

  const largura = altura / fmt.razaoA;
  const volumeForma = fmt.razaoC * fmt.razaoA * largura ** 3;
  const volumeEspecifico = (volumeForma * fmt.preenchimento) / peso;

  // Fora desta faixa não é pão: ou a régua mediu outra coisa, ou o peso
  // anotado é de outra fornada. A faixa é deliberadamente mais larga que a
  // variação típica de receita descrita em `ENTRADAS_PADRAO.volumeEspecifico`
  // (2,0-3,5+) — aqui o objetivo é pegar medida errada, não julgar a receita.
  if (!Number.isFinite(volumeEspecifico) || volumeEspecifico < 1.5 || volumeEspecifico > 5) return null;
  return volumeEspecifico;
}
