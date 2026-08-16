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

export const ENTRADAS_PADRAO = {
  // Objetivo — muda a cada produção e dimensiona todo o resto
  pesoAssadoDesejado: 500,
  numeroPaes: 2,

  // Composição, em percentual sobre a farinha total adicionada
  hidratacao: 0.7,
  pctStarter: 0.2,
  pctSal: 0.02,

  /**
   * Catálogo de farinhas. A PRIMEIRA da lista é a base: `pct` e `pctStarter`
   * dela são ignorados e valem o resto para fechar 100%. É como a planilha se
   * comporta e como o padeiro pensa — declara-se só a farinha especial.
   */
  farinhas: [
    { id: 'f-branca', nome: 'Farinha branca', preco: 4.46, pct: 0, pctStarter: 0 },
    { id: 'f-integral', nome: 'Farinha integral', preco: 11, pct: 0.1, pctStarter: 0 },
    { id: 'f-centeio', nome: 'Farinha de centeio', preco: 9, pct: 0, pctStarter: 0 },
  ],

  // Entram na massa. `fracaoAgua` é quanto do líquido é água de fato:
  // azeite 0, melado 0,25, mel 0,18, leite 0,87.
  liquidos: [], // { id, nome, pct, fracaoAgua, preco }

  // Não mexem no equilíbrio farinha-água: somam depois, por pão.
  solidos: [], // { id, nome, gramasPorPao, preco }

  // Ajustes
  fatorArredondamento: 10,
  perdaForno: 0.11,
  tempoPreAquecimento: 45,
  tempoCozimento: 40,

  // Starter
  hidratacaoMae: 1,
  propAtivacaoStarter: 1,
  propAtivacaoFarinha: 3,
  propAtivacaoAgua: 3,

  // Custos
  precoSal: 2.5,
  precoKwh: 0.8653,
  potenciaForno: 0.6,
  embalagemExterna: 1.44,
  embalagemInterna: 0.63,
  etiqueta: 0.04,
};

/** Campos que são listas — tratados à parte da cópia de escalares. */
export const LISTAS = ['farinhas', 'liquidos', 'solidos'];

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

export function calcular(entradas) {
  const avisos = [];
  const bruto = entradas && typeof entradas === 'object' ? entradas : {};

  const e = {};
  for (const [chave, padrao] of Object.entries(ENTRADAS_PADRAO)) {
    if (LISTAS.includes(chave)) continue;
    e[chave] = num(bruto[chave], padrao);
  }

  const farinhas = comoLista(bruto.farinhas ?? ENTRADAS_PADRAO.farinhas).map((f, i) => ({
    id: f.id ?? `f${i}`,
    nome: String(f.nome ?? 'Farinha'),
    preco: num(f.preco, 0),
    pct: num(f.pct, 0),
    pctStarter: num(f.pctStarter, 0),
  }));
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

  // --- 1. Percentuais das farinhas ----------------------------------------
  // A base fecha os 100%; as demais valem o que foi declarado.
  if (farinhas.length === 0) {
    avisos.push('A receita precisa de pelo menos uma farinha.');
  }
  const somaOutras = farinhas.slice(1).reduce((s, f) => s + Math.max(0, f.pct), 0);
  const somaOutrasSt = farinhas.slice(1).reduce((s, f) => s + Math.max(0, f.pctStarter), 0);
  if (somaOutras > 1) {
    avisos.push('As farinhas do pão somam mais de 100%. Reduza alguma para sobrar espaço para a base.');
  }
  if (somaOutrasSt > 1) {
    avisos.push('As farinhas do starter somam mais de 100%.');
  }
  const pctDe = (f, i) => (i === 0 ? Math.max(0, 1 - somaOutras) : Math.max(0, f.pct));
  const pctStarterDe = (f, i) => (i === 0 ? Math.max(0, 1 - somaOutrasSt) : Math.max(0, f.pctStarter));

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
  if (farinhas.length === 0) {
    farinhaTotal = 0;
  } else if (denom <= 0) {
    avisos.push('Os percentuais informados não fecham numa receita possível.');
  } else {
    farinhaTotal = snap(alvoMassa / denom);
  }

  // --- 4. Ingredientes -----------------------------------------------------
  // Cada linha arredonda por conta própria, como na planilha.
  const pesosFarinha = farinhas.map((f, i) => ({
    id: f.id,
    nome: f.nome,
    preco: f.preco,
    pct: pctDe(f, i),
    pctStarter: pctStarterDe(f, i),
    base: i === 0,
    gramas: snap(farinhaTotal * pctDe(f, i)),
  }));

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

  const largura = pesoAssado > 0 ? Math.cbrt((pesoAssado * 2.7) / 0.75) : 0;
  const comprimento = largura * 2.2;
  const altura = largura * 0.85;
  const fornadas = e.numeroPaes > 0 ? roundUp(e.numeroPaes / 2) : 0;
  const tempoTotal = e.tempoPreAquecimento + e.tempoCozimento * fornadas;

  // --- 6. Ativação do starter ---------------------------------------------
  let maeParaAtivar = 0;
  let farinhaAtivar = 0;
  let aguaAtivar = 0;
  if (rSt > 0 && somaProp > 0) {
    maeParaAtivar = roundUp((starter * rSt) / somaProp);
    farinhaAtivar = (maeParaAtivar * rFl) / rSt;
    aguaAtivar = (maeParaAtivar * rWa) / rSt;
  }
  const totalAtivado = maeParaAtivar + farinhaAtivar + aguaAtivar;
  const sobra = Math.max(totalAtivado - starter, 0);

  // A farinha embutida no starter, repartida pela composição dele — é o que
  // permite cobrar o preço certo de um starter de centeio.
  const farinhasDoStarter = pesosFarinha.map((f) => ({
    id: f.id,
    nome: f.nome,
    pct: f.pctStarter,
    gramas: farinhaNoStarter * f.pctStarter,
  }));

  // --- 7. Custos -----------------------------------------------------------
  // Preços de ingrediente são por quilo; embalagem e etiqueta, por unidade.
  const embalagem = e.embalagemExterna + e.embalagemInterna + e.etiqueta;
  const energia = (tempoTotal / 60) * e.potenciaForno * e.precoKwh;

  const custoFarinhas = pesosFarinha.reduce((soma, f, i) => {
    const noStarter = farinhasDoStarter[i]?.gramas ?? 0;
    return soma + f.preco * (f.gramas + noStarter);
  }, 0);
  const custoLiquidos = pesosLiquido.reduce((s, l) => s + l.preco * l.gramas, 0);
  const custoSolidos = pesosSolido.reduce((s, x) => s + x.preco * x.gramas, 0);
  const custoIngredientes =
    (custoFarinhas + custoLiquidos + custoSolidos + e.precoSal * sal) / 1000;

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
    },
    pao: {
      farinhas: limpar(pesosFarinha, ['pct', 'pctStarter', 'gramas', 'preco']),
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
      largura: fin(largura),
      comprimento: fin(comprimento),
      altura: fin(altura),
      fornadas: fin(fornadas),
      tempoTotal: fin(tempoTotal),
    },
    custos: {
      embalagem: fin(embalagem),
      embalagemTotal: fin(embalagemTotal),
      ingredientes: fin(custoIngredientes),
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
