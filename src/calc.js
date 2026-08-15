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
  // Pão
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
  tempoPreAquecimento: 45,
  tempoCozimento: 40,
  // Starter
  hidratacaoMae: 1,
  propAtivacaoStarter: 1,
  propAtivacaoFarinha: 3,
  propAtivacaoAgua: 3,
  // Custos
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

export function calcular(entradas = {}) {
  const avisos = [];
  const e = {};
  for (const [chave, padrao] of Object.entries(ENTRADAS_PADRAO)) {
    e[chave] = num(entradas?.[chave], padrao);
  }

  const R = e.fatorArredondamento;
  // Fator de arredondamento zero ou negativo significa "não arredondar".
  const snap = (x) => (R > 0 ? excelRound(x / R) * R : x);

  // --- 1. Starter ativado -------------------------------------------------
  // Precisa vir primeiro: a hidratação do starter entra na conta da farinha.
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

  // --- 2. Peso-alvo da massa e farinha total ------------------------------
  let alvoMassa = 0;
  if (e.numeroPaes <= 0) {
    avisos.push('O número de pães precisa ser maior que zero.');
  } else if (e.perdaForno >= 1) {
    avisos.push('A perda no forno precisa ser menor que 100%.');
  } else {
    alvoMassa = (e.pesoAssadoDesejado * e.numeroPaes) / (1 - e.perdaForno);
  }

  // Soma dos percentuais expressa em função da farinha adicionada, descontando
  // a farinha e a água que já chegam dentro do starter.
  const denom =
    divisorAtivado === 0
      ? 0
      : 1 +
        e.pctStarter +
        e.pctSal +
        e.pctMelado +
        e.hidratacao * (1 + e.pctStarter / divisorAtivado) -
        (e.pctStarter * hAct) / divisorAtivado;

  let farinhaTotal = 0;
  if (denom <= 0) {
    avisos.push('Os percentuais informados não fecham numa receita possível.');
  } else {
    farinhaTotal = snap(alvoMassa / denom);
  }

  // --- 3. Ingredientes ----------------------------------------------------
  // Cada linha arredonda por conta própria, como na planilha — a soma das
  // farinhas pode não bater exatamente com a farinha total.
  const farinhaBranca = snap(farinhaTotal * (1 - e.pctIntegral - e.pctCenteio));
  const integral = snap(farinhaTotal * e.pctIntegral);
  const centeio = snap(farinhaTotal * e.pctCenteio);
  const starter = snap(farinhaTotal * e.pctStarter);
  const farinhaNoStarter = divisorAtivado === 0 ? 0 : starter / divisorAtivado;
  const aguaNoStarter = divisorAtivado === 0 ? 0 : (starter * hAct) / divisorAtivado;
  const agua = snap((farinhaTotal + farinhaNoStarter) * e.hidratacao - aguaNoStarter);
  const sal = snap(farinhaTotal * e.pctSal);
  const melado = snap(farinhaTotal * e.pctMelado);

  // --- 4. Métricas --------------------------------------------------------
  // Extras ficam de fora do peso, como na planilha: entram só no custo.
  const pesoTotal = farinhaBranca + integral + centeio + agua + starter + sal + melado;
  const pesoPorPao = e.numeroPaes > 0 ? excelRound(pesoTotal / e.numeroPaes) : 0;

  const farinhaParaHidratacao = farinhaBranca + integral + centeio + farinhaNoStarter;
  const hidratacaoReal =
    farinhaParaHidratacao > 0 ? (agua + aguaNoStarter) / farinhaParaHidratacao : 0;

  const pesoAssado = pesoPorPao * (1 - e.perdaForno);
  const largura = pesoAssado > 0 ? Math.cbrt((pesoAssado * 2.7) / 0.75) : 0;
  const comprimento = largura * 2.2;
  const altura = largura * 0.85;
  const fornadas = e.numeroPaes > 0 ? roundUp(e.numeroPaes / 2) : 0;

  // --- 5. Ativação do starter ---------------------------------------------
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

  // --- 6. Custos ----------------------------------------------------------
  // Preços de ingredientes são por quilo; embalagens e etiqueta, por unidade.
  const embalagem = e.embalagemExterna + e.embalagemInterna + e.etiqueta;
  const energia =
    ((e.tempoPreAquecimento + e.tempoCozimento * fornadas) / 60) * e.potenciaForno * e.precoKwh;
  // A farinha que vem no starter é cobrada ao preço da branca, como na planilha.
  const custoIngredientes =
    (e.precoFarinha * (farinhaBranca + farinhaNoStarter) +
      e.precoIntegral * integral +
      e.precoCenteio * centeio +
      e.precoSal * sal +
      e.precoMelado * melado +
      e.precoExtras * e.extras) /
    1000;
  const producao = embalagem * e.numeroPaes + custoIngredientes + energia;
  const porPaoEmbalado = e.numeroPaes > 0 ? producao / e.numeroPaes : 0;
  const porPao = e.numeroPaes > 0 ? porPaoEmbalado - embalagem : 0;

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
    },
    pao: {
      farinhaBranca: fin(farinhaBranca),
      integral: fin(integral),
      centeio: fin(centeio),
      agua: fin(agua),
      starter: fin(starter),
      sal: fin(sal),
      melado: fin(melado),
      farinhaTotal: fin(farinhaTotal),
      alvoMassa: fin(alvoMassa),
      pesoTotal: fin(pesoTotal),
      pesoPorPao: fin(pesoPorPao),
      hidratacaoReal: fin(hidratacaoReal),
      pesoAssado: fin(pesoAssado),
      largura: fin(largura),
      comprimento: fin(comprimento),
      altura: fin(altura),
      fornadas: fin(fornadas),
    },
    custos: {
      embalagem: fin(embalagem),
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
 * É o que substitui o chute de 11% por medição.
 */
export function calibrarPerda(pesoPorPao, pesoRealAssado) {
  if (!(pesoPorPao > 0) || !(pesoRealAssado > 0)) return null;
  const perda = 1 - pesoRealAssado / pesoPorPao;
  if (!Number.isFinite(perda) || perda < 0 || perda >= 1) return null;
  return perda;
}
