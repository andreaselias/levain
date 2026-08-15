/**
 * Metadados dos campos de entrada: rótulo, aba, unidade e formatação.
 *
 * Uma definição só, usada em três lugares — para desenhar os formulários, para
 * escrever o diff do diário em português e para formatar os retratos de
 * parâmetros. Acrescentar um campo aqui o faz aparecer nos três.
 *
 * `fator` converte entre o valor guardado e o exibido: percentuais são
 * guardados como fração (0,7) e mostrados como número (70).
 */

export const CAMPOS = [
  // --- Pão ---------------------------------------------------------------
  { chave: 'pesoAssadoDesejado', rotulo: 'Peso assado desejado por pão', aba: 'pao', grupo: 'Objetivo', unidade: 'g', passo: 10, dica: 'Peso desejado do pão depois de assado.' },
  { chave: 'numeroPaes', rotulo: 'Número de pães', aba: 'pao', grupo: 'Objetivo', unidade: '', passo: 1, casas: 0 },

  { chave: 'pctIntegral', rotulo: 'Farinha integral', aba: 'pao', grupo: 'Percentuais de padeiro', unidade: '%', fator: 100, passo: 1, casas: 1 },
  { chave: 'pctCenteio', rotulo: 'Farinha de centeio', aba: 'pao', grupo: 'Percentuais de padeiro', unidade: '%', fator: 100, passo: 1, casas: 1 },
  { chave: 'hidratacao', rotulo: 'Hidratação', aba: 'pao', grupo: 'Percentuais de padeiro', unidade: '%', fator: 100, passo: 1, casas: 1 },
  { chave: 'pctStarter', rotulo: 'Starter', aba: 'pao', grupo: 'Percentuais de padeiro', unidade: '%', fator: 100, passo: 1, casas: 1 },
  { chave: 'pctSal', rotulo: 'Sal', aba: 'pao', grupo: 'Percentuais de padeiro', unidade: '%', fator: 100, passo: 0.1, casas: 2 },
  { chave: 'pctMelado', rotulo: 'Melado', aba: 'pao', grupo: 'Percentuais de padeiro', unidade: '%', fator: 100, passo: 0.5, casas: 1 },
  { chave: 'extras', rotulo: 'Extras', aba: 'pao', grupo: 'Percentuais de padeiro', unidade: 'g', passo: 10, dica: 'Entra no custo, mas não no peso da massa — igual à planilha.' },

  { chave: 'fatorArredondamento', rotulo: 'Fator de arredondamento', aba: 'pao', grupo: 'Ajustes', unidade: 'g', passo: 1, dica: 'Arredonda cada ingrediente para múltiplos deste valor. Zero desliga o arredondamento.' },
  { chave: 'perdaForno', rotulo: 'Perda estimada no forno', aba: 'pao', grupo: 'Ajustes', unidade: '%', fator: 100, passo: 0.5, casas: 1, dica: 'Percentual de peso perdido no forno. O diário calibra este valor a partir de pães pesados de verdade.' },
  { chave: 'tempoPreAquecimento', rotulo: 'Pré-aquecimento', aba: 'pao', grupo: 'Ajustes', unidade: 'min', passo: 5, casas: 0 },
  { chave: 'tempoCozimento', rotulo: 'Cozimento', aba: 'pao', grupo: 'Ajustes', unidade: 'min', passo: 5, casas: 0 },

  // --- Starter -----------------------------------------------------------
  { chave: 'hidratacaoMae', rotulo: 'Hidratação do starter-mãe', aba: 'starter', grupo: 'Starter-mãe', unidade: '%', fator: 100, passo: 5, casas: 0, dica: '100% significa partes iguais de água e farinha no pote.' },
  { chave: 'propAtivacaoStarter', rotulo: 'Proporção — starter', aba: 'starter', grupo: 'Ativação', unidade: '', passo: 1, casas: 1 },
  { chave: 'propAtivacaoFarinha', rotulo: 'Proporção — farinha', aba: 'starter', grupo: 'Ativação', unidade: '', passo: 1, casas: 1 },
  { chave: 'propAtivacaoAgua', rotulo: 'Proporção — água', aba: 'starter', grupo: 'Ativação', unidade: '', passo: 1, casas: 1 },

  // --- Custos ------------------------------------------------------------
  { chave: 'precoFarinha', rotulo: 'Farinha branca', aba: 'custos', grupo: 'Preço por quilo', unidade: 'R$/kg', passo: 0.1, casas: 2 },
  { chave: 'precoIntegral', rotulo: 'Farinha integral', aba: 'custos', grupo: 'Preço por quilo', unidade: 'R$/kg', passo: 0.1, casas: 2 },
  { chave: 'precoCenteio', rotulo: 'Farinha de centeio', aba: 'custos', grupo: 'Preço por quilo', unidade: 'R$/kg', passo: 0.1, casas: 2 },
  { chave: 'precoSal', rotulo: 'Sal', aba: 'custos', grupo: 'Preço por quilo', unidade: 'R$/kg', passo: 0.1, casas: 2 },
  { chave: 'precoMelado', rotulo: 'Melado', aba: 'custos', grupo: 'Preço por quilo', unidade: 'R$/kg', passo: 1, casas: 2 },
  { chave: 'precoExtras', rotulo: 'Extras', aba: 'custos', grupo: 'Preço por quilo', unidade: 'R$/kg', passo: 1, casas: 2 },

  { chave: 'precoKwh', rotulo: 'Preço do kWh', aba: 'custos', grupo: 'Energia', unidade: 'R$', passo: 0.01, casas: 4 },
  { chave: 'potenciaForno', rotulo: 'Potência do forno', aba: 'custos', grupo: 'Energia', unidade: 'kW', passo: 0.1, casas: 2 },

  { chave: 'embalagemExterna', rotulo: 'Embalagem externa', aba: 'custos', grupo: 'Embalagem (por pão)', unidade: 'R$', passo: 0.01, casas: 2 },
  { chave: 'embalagemInterna', rotulo: 'Embalagem interna', aba: 'custos', grupo: 'Embalagem (por pão)', unidade: 'R$', passo: 0.01, casas: 2 },
  { chave: 'etiqueta', rotulo: 'Etiqueta', aba: 'custos', grupo: 'Embalagem (por pão)', unidade: 'R$', passo: 0.01, casas: 2 },
];

export const CAMPO_POR_CHAVE = Object.fromEntries(CAMPOS.map((c) => [c.chave, c]));

/** Valor guardado → número mostrado no formulário. */
export function paraExibicao(campo, valor) {
  return valor * (campo.fator ?? 1);
}

/** Número digitado no formulário → valor guardado. */
export function paraArmazenamento(campo, valor) {
  return valor / (campo.fator ?? 1);
}

/** Formata com vírgula decimal e sem zeros à direita: 70,0 → "70"; 2,50 → "2,5". */
function enxugar(numero, casas) {
  let texto = numero.toFixed(casas);
  if (texto.includes('.')) texto = texto.replace(/0+$/, '').replace(/\.$/, '');
  return texto.replace('.', ',');
}

/** Valor guardado → texto legível com unidade, para o diff e os retratos. */
export function formatarValor(campo, valor) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
  const numero = paraExibicao(campo, Number(valor));
  const texto = enxugar(numero, campo.casas ?? 0);
  if (!campo.unidade) return texto;
  if (campo.unidade === '%') return `${texto}%`;
  if (campo.unidade.startsWith('R$')) {
    const sufixo = campo.unidade === 'R$/kg' ? '/kg' : '';
    return `R$ ${texto}${sufixo}`;
  }
  return `${texto} ${campo.unidade}`;
}
