# Ativação por incremento — a hidratação do ativado vira entrada

Data: 2026-09-22
Altera: `src/calc.js`, `src/campos.js`, `src/migrar.js`, `src/app.js`,
`test/calc.test.mjs`, `test/migrar.test.mjs`

## Problema

A aba Starter pede três proporções — starter, farinha e água — e **mostra** a
hidratação do ativado como resultado. Em `calc.js:267`:

```js
hAct = (rWa + (rSt * e.hidratacaoMae) / divisorMae) / farinhaDaProporcao;
```

Quem quer um ativado a 85% não tem onde digitar 85. O caminho é resolver a
proporção de água de trás para frente — com o pote a 100%, `1 : 3 : 2,475` — e
2,475 nem cabe na casa decimal do campo, que mostra "2,5" guardando 2,475.

Pior: o campo que *parece* responder pela hidratação do starter é "Hidratação do
starter-mãe", e ele descreve o pote, não o ativado. Pôr 85 ali com as proporções
padrão dá 97,7%, porque a mãe é 1 parte de 7 na mistura e as outras 6 chegam a
100% por construção. O usuário gira um botão que quase não move o número que ele
está olhando.

Há ainda uma segunda queixa embutida: as três proporções descrevem farinha e
água separadamente, quando o jeito corrente de escrever alimentação de fermento
natural é uma razão só contra o starter — "alimento 1:3" — mais a hidratação.

## Decisão

Trocar as três proporções por duas entradas:

| Campo | Papel |
|---|---|
| `propIncremento` | Partes de incremento por parte de starter. 3 → 10 g de mãe pedem 30 g de alimento. |
| `hidratacaoAtivado` | Hidratação desejada do **ativado pronto**, não do incremento. |

`hidratacaoMae` fica: a conta precisa saber o que há dentro da mãe para repartir
o incremento. `arredondamentoAtivacao` fica, sem mudança.

Os 85% descrevem o ativado pronto — decisão do usuário, registrada aqui porque a
alternativa (os 85% descreverem o incremento) é igualmente defensável e dá outro
número. Com o pote a 100%, incremento 3 e alvo 85%, o incremento sai a 80,5% e o
ativado a 85,0%; na outra leitura seria incremento a 85% e ativado a 88,5%.

A reparametrização é bijetiva, então nenhuma receita salva muda de número.

## A conta

Com `M` = mãe tirada do pote, `p` = `propIncremento`, `hAlvo` =
`hidratacaoAtivado`, `hMae` = `hidratacaoMae`:

```
divisorMae  = 1 + hMae
divisorAlvo = 1 + hAlvo

ativado total   = M × (1 + p)
farinha do total = M(1+p) / divisorAlvo
água do total    = M(1+p) × hAlvo / divisorAlvo

farinha da mãe   = M / divisorMae
água da mãe      = M × hMae / divisorMae

farinhaAtivar = farinha do total − farinha da mãe
aguaAtivar    = água do total    − água da mãe
```

As duas parcelas do incremento somam `M × p` por construção, que é a promessa do
campo: *p* partes de alimento por parte de starter.

### Dimensionar a mãe

A regra de `2026-08-29-reposicao-do-pote-design.md` continua: o ativado cobre a
massa e repõe o que saiu do pote, `totalAtivado = starter + M`. Como
`totalAtivado = M(1+p)`:

```
M × p = starter   →   maeParaAtivar = roundUp(starter / p)
```

Isso é a mesma conta de hoje escrita mais curto: `starter · rSt / (rFl + rWa)`
com `p = (rFl + rWa) / rSt` é `starter / p`.

### O que chega na massa

Hoje `hAct` sai das proporções; agora **é** `hAlvo`. O bloco `calc.js:257-269`
encolhe para uma atribuição, e `divisorAtivado = 1 + hAlvo` segue alimentando
`denom` e `farinhaTotal` como antes. A ordem do arquivo não muda: a ativação
continua precisando vir antes da farinha.

`farinhaNoStarter` e `aguaNoStarter` continuam derivadas do **alvo exato**, não
do valor realizado depois do passo da balança. É deliberado: fazer a massa
depender do arredondamento da ativação criaria um acoplamento que hoje não
existe.

### Hidratação realizada

O passo da balança desvia o resultado do alvo. Entra uma saída nova:

```js
farinhaRealAtivado = maeParaAtivar / divisorMae + farinhaAtivar
aguaRealAtivado    = maeParaAtivar * hMae / divisorMae + aguaAtivar
hidratacaoRealAtivado = aguaRealAtivado / farinhaRealAtivado   // 0 se não há farinha
```

Espelha o par que a aba Pão já tem — `hidratacao` entra, `hidratacaoReal` sai.
A métrica da tela passa a se chamar "Hidratação real do ativado" e aponta para
`r.starter.hidratacaoRealAtivado`; a chave antiga `hidratacaoAtivado` sai do
resultado, porque agora esse nome é da entrada.

## Guardas

1. **`p <= 0`** — o pote não se repõe e a divisão estoura. Mantém o aviso que já
   existe, reescrito: *"Sem incremento, o pote não se repõe: a mãe vai inteira
   para a massa."* `maeParaAtivar = roundUp(starter)`, como hoje.
2. **`divisorMae <= 0`** — aviso atual, sem mudança.
3. **`divisorAlvo <= 0`** — novo: *"A hidratação do ativado precisa ser maior que
   -100%."*
4. **Alcançabilidade.** Incremento só acrescenta; não dá para tirar água da mãe.
   A faixa possível é

   ```
   mínimo = hMae / (1 + p(1 + hMae))      incremento todo de farinha
   máximo = hMae + p(1 + hMae)            incremento todo de água
   ```

   Com o padrão (pote 100%, `p` = 6): de 7,7% a 1300%. Com `p` = 3: de 14,3% a
   700%. Fora da faixa, a parcela negativa vai a zero e **a outra recebe o
   incremento inteiro** — assim o ativado ainda tem as *p* partes prometidas e
   entrega a hidratação mais próxima possível. `maeParaAtivar` não muda.
   `hidratacaoRealAtivado` mostra honestamente o que saiu.

   Nesse caso a massa **continua** calculando com `hAlvo`, não com o valor
   realizado — a regra do parágrafo anterior não abre exceção. Isso torna a
   receita internamente inconsistente enquanto o alvo estiver fora da faixa, e é
   o aviso que carrega o peso: ele nomeia a faixa e diz que os números da massa
   só fecham depois de o alvo voltar para dentro dela. A alternativa — a massa
   seguir o valor realizado — resolveria a inconsistência criando o acoplamento
   com o arredondamento que a decisão anterior recusou, e só num canto que o
   usuário já foi instruído a sair.

## Deriva do pote

A sobra volta para o pote. Com alvo ≠ mãe, o pote caminha para a hidratação do
ativado a cada fornada — o app modela as duas como independentes e fixas, o que
deixa de valer na prática.

Não vira conta: vira uma `nota-rodape` em `saidasStarter` quando
`hidratacaoAtivado ≠ hidratacaoMae`, sugerindo igualar as duas. É informação,
não aviso de erro — a configuração é legítima para quem refresca o pote à parte.

## Migração v3 → v4

`migrar.js:9` manda não deixar número mudar, e aqui dá para cumprir exatamente:

```
propIncremento    = (rFl + rWa) / rSt
hidratacaoAtivado = (rWa + rSt·hMae/divisorMae) / (rFl + rSt/divisorMae)
```

que é a própria fórmula de `calc.js:267`. O padrão `1 : 3 : 3` com pote a 100%
vira `p = 6`, alvo `100%` — e `M(1+p)/divisorAlvo − M/divisorMae = 3M` reproduz
os mesmos 3 partes de farinha e 3 de água.

Detalhes:

- Discriminador, no estilo estrutural que o arquivo já usa: `composicaoPao` é
  array **e** `propAtivacaoFarinha` existe → v3, converter. Array e sem o campo →
  já é v4.
- `deV3` lê as três proporções do objeto cru **antes** de chamar `escalares`,
  que só copia chaves presentes em `ENTRADAS_PADRAO`.
- As três chaves entram em `CAMPOS_MORTOS`, e `deV3` passa a aplicar a lista
  como `deV1`/`deV2` já fazem.
- Entradas degeneradas (`rSt <= 0`, `divisorMae <= 0`, denominador zero) caem no
  padrão em vez de propagar `NaN`.
- `VERSAO_ESTADO` vai a 4.
- Vale igual para os retratos do diário: `migrarEstado` já passa cada
  `registros[].snapshot` pela mesma função, então o diff de fornadas antigas
  continua legível. Retrato parcial, sem as proporções, cai no padrão — que é o
  comportamento de hoje.

## Padrões

```js
propIncremento: 6,      // equivale ao 1 : 3 : 3 de hoje
hidratacaoAtivado: 1,   // 100%
```

Mantém a receita de fábrica com os mesmos números. Quem quiser o 1:3 do exemplo
troca para 3.

## Campos

```js
{ chave: 'propIncremento', rotulo: 'Incremento por parte de starter',
  aba: 'starter', grupo: 'Ativação', unidade: '', passo: 0.5, casas: 2,
  dica: 'Quanto alimento entra por parte de starter. 3 significa 30 g de farinha mais água para cada 10 g de mãe.' },

{ chave: 'hidratacaoAtivado', rotulo: 'Hidratação do ativado',
  aba: 'starter', grupo: 'Ativação', unidade: '%', fator: 100, passo: 5, casas: 1,
  dica: 'Hidratação do starter ativado pronto, já contando a água que veio dentro da mãe.' },
```

`entradasStarter` não muda: ela desenha `grupoDeCampos('starter', 'Ativação')`,
que lê o que `CAMPOS` disser.

`casas: 2` em `propIncremento` não é enfeite — uma receita migrada de `1 : 3 :
2,55` guarda `p = 5,55`, e uma casa só mostraria 5,6.

## Correção acoplada: o botão de passo quantiza o valor guardado

`app.js:1482` lê o valor atual do **texto do campo**:

```js
const atual = paraNumero(entrada.value);
```

Como o campo é formatado com `casas`, um valor guardado mais fino que isso já
chega truncado ao botão, que grava o truncado de volta. Hoje é raro; com valores
migrados como `5,55` ou `97,71%` passa a ser comum. Entra no escopo porque a
migração é que cria a exposição.

> **Correção, posterior à implementação:** o parágrafo acima está errado no
> mecanismo, e os exemplos que ele escolhe não demonstram defeito nenhum.
> Medido: `5,55`, `10/3` e `0,7368…` dão exatamente o mesmo resultado com e sem
> o conserto. Todo par `passo`/`casas` do projeto está alinhado na mesma grade
> decimal, e arredondar um passo alinhado comuta com arredondar antes de somar.
> A divergência real aparece só na fronteira de arredondamento — `pctSal`
> guardado em `0,01375` exibe `1,38` e um clique de `−` dá `1,28` pelo texto
> contra `1,27` pelo valor guardado — em 0,26% de 100 mil combinações varridas.
> O conserto continua certo, por outra razão: o valor de partida do botão não
> deve depender de quanta precisão a última renderização por acaso preservou.
> Ver o registro no plano.

Correção: ler o valor guardado — `paraExibicao(molde, entradas[chave])` para
campo simples, o atributo do item para lista — e só cair no texto do campo se
não houver valor guardado.

## Testes

Em `test/calc.test.mjs`:

- `CENARIOS_DE_ATIVACAO` passa para os campos novos; os dois testes de
  arredondamento (gramas inteiras, partes somando o total) seguem valendo.
- O incremento soma exatamente `p × maeParaAtivar` com o passo da balança
  desligado.
- `hidratacaoRealAtivado` bate com `hidratacaoAtivado` quando
  `arredondamentoAtivacao` é 0, e desvia dentro de meio grama quando é 1.
- Faixa alcançável: alvo abaixo do mínimo zera a água, entrega o incremento
  inteiro em farinha e emite aviso.
- `propIncremento = 0` cai no caminho da mãe inteira, com aviso.
- Os dois testes ancorados na planilha de origem continuam passando com
  `propIncremento: 6, hidratacaoAtivado: 1` — é o guarda-costas de que a
  reparametrização não mexeu em nada.

Em `test/migrar.test.mjs`:

- v3 → v4 sobre o padrão e sobre `1:3:2,55`, `3:5:5`, `1:2:2`, cada um com
  `calcular` antes e depois devolvendo resultado idêntico grama a grama.
- v3 degenerado (`propAtivacaoStarter: 0`) cai no padrão sem `NaN`.
- Retrato de diário sem as proporções migra sem perder os campos que tinha.

O conserto do botão de passo não tem teste automatizado — `app.js` não é
coberto. Verificação manual no navegador: guardar `5,55`, trocar de aba, clicar
`+` e conferir que vai para `6,05` e não `6,1`.

## Fora de escopo

- Mexer no `fatorArredondamento` padrão de 10 g.
- Modelar a deriva do pote ao longo de várias fornadas — só a nota.
- A nota de rodapé de `app.js:338`, que diz que a hidratação real passa do valor
  pedido quando na verdade a conta a faz bater exatamente. Defeito separado.
