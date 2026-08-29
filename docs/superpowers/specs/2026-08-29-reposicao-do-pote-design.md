# Reposição do pote — o ativado cobre a massa e o próximo ciclo

Data: 2026-08-29
Altera: `src/calc.js`, `src/app.js`, `test/calc.test.mjs`

## Problema

A ativação é dimensionada só pela necessidade da receita. Em `calc.js:381`:

```js
maeParaAtivar = roundUp((starter * rSt) / somaProp);
```

Com os padrões (proporção 1 : 3 : 3, receita pedindo 120 g de starter) isso dá
mãe 18 g + farinha 54 g + água 54 g = **126 g ativados**. A massa leva 120 e
sobram 6 g.

Esses 6 g são resto de arredondamento, não uma reserva. Quem seguir o ticket ao
pé da letra tira 18 g do pote e devolve 6 — o pote encolhe a cada fornada e em
poucos ciclos acaba. A conta responde "quanto ativar para o pão" quando a
pergunta de quem mantém um starter vivo é "quanto ativar para o pão **e** para
continuar tendo starter".

## Decisão

O ativado passa a cobrir a necessidade da massa mais a reposição do que saiu do
pote. A reserva não é um parâmetro: é exatamente a mãe consumida na ativação, o
que devolve o pote ao tamanho que tinha.

Nenhuma entrada nova. Todas as saídas envolvidas são derivadas, então não há
migração — receitas salvas passam a mostrar números maiores no ticket assim que
abrem.

## A conta

Quer-se `totalAtivado = starter + maeParaAtivar`. Como o ativado é
`maeParaAtivar × somaProp / rSt`, isolar dá:

```
maeParaAtivar = roundUp(starter * rSt / (rFl + rWa))
```

O denominador perde o `rSt`: é a única mudança de fórmula. `farinhaAtivar`,
`aguaAtivar`, `totalAtivado` e `sobra` continuam como estão e crescem por
consequência.

Com os padrões: mãe 20 g + farinha 60 g + água 60 g = **140 g**, dos quais 120
vão para a massa e 20 voltam ao pote — os mesmos 20 que saíram dele.

### Guarda

Com `rFl + rWa = 0` — ativação sem alimento, mãe pura direto na massa — repor é
impossível, e a fórmula nova dividiria por zero. Nesse caso vale o
comportamento de hoje (`maeParaAtivar = starter`, ativado igual à necessidade,
sem sobra) e entra um aviso dizendo que sem farinha nem água na ativação o pote
não se repõe.

A guarda de `rSt <= 0`, que já existe, continua valendo e tem precedência: sem
mãe na proporção não há ativação nenhuma.

## A tela

Na aba Starter, seção "O que o starter carrega": a métrica **Sobra** vira
**Volta ao pote**. Com a conta nova o número deixa de ser resto e passa a ser a
reposição, então o rótulo antigo mentiria.

A nota de rodapé do ticket, que hoje explica a sobra como efeito do
arredondamento para cima, passa a dizer que o ativado cobre a massa e a
reposição do pote.

Nenhuma linha nova no ticket. As três linhas de lá são o que se pesa, e o total
já é a soma delas — uma quarta linha de reposição contaria o mesmo starter duas
vezes.

## O que não muda

**Custos.** A farinha cobrada continua sendo `farinhaNoStarter`, a que está
embutida no starter que entra na massa. Ela depende de `starter` (necessidade da
receita), não de quanto se ativa, então o custo da fornada fica igual. A farinha
a mais que se pesa para alimentar o pote é manutenção do starter, não insumo do
pão.

**A aba Pão.** `r.pao.starter` segue 120 g: o que muda é quanto se ativa, não
quanto vai na massa.

## Testes

Dois testes ancoram a ativação na planilha de origem —
`test/calc.test.mjs:126` ("ativação do starter reproduz a planilha") e `:422`
("arredondar a ativação não mexe nos valores da planilha"). Os dois passam de
18/54/54 → 126, sobra 6 para 20/60/60 → 140, sobra 20. O desvio é deliberado: a
planilha não previa repor o pote. Os comentários dos testes registram isso.

Entram dois testes novos:

1. Em várias combinações de proporção e passo de balança,
   `totalAtivado - starter >= maeParaAtivar` — o pote sempre volta ao que era.
2. Com `propAtivacaoFarinha` e `propAtivacaoAgua` zerados, sai aviso, os valores
   seguem finitos e o comportamento antigo se mantém.
