# Fôrma estimada — crescimento e formato

Data: 2026-08-16
Altera: `src/calc.js`, `src/campos.js`, `src/store.js`, `src/app.js`,
`src/migrar.js`, `test/calc.test.mjs`

## Problema

A seção "Fôrma estimada" deriva as três dimensões do pão de uma linha só, em
`calc.js:319-321`:

```js
const largura = pesoAssado > 0 ? Math.cbrt((pesoAssado * 2.7) / 0.75) : 0;
const comprimento = largura * 2.2;
const altura = largura * 0.85;
```

São três constantes escondidas, cada uma respondendo por uma coisa diferente:
**2,7** é o volume específico em cm³/g, ou seja quanto o pão cresce; **0,75** é
a folga da fôrma; **2,2 : 1 : 0,85** é a proporção do batard.

O que motiva a mudança é a primeira delas. O volume específico é justamente o
que varia com a receita — centeio pesado fica na casa de 2,0–2,4, branco bem
fermentado passa de 3,5 — e é o único dos três que não tem como ser ajustado.
Uma receita com muito centeio recebe hoje a estimativa de um pão que ela nunca
vai produzir.

Há um segundo defeito, de geometria. As proporções são aplicadas **depois** da
raiz cúbica, então o retângulo final fica 2,2 × 0,85 = 1,87 vezes maior que o
volume que entrou na conta. O "2,7" escrito no código se comporta na prática
como ~4,0 cm³/g. As dimensões saem plausíveis por compensação entre os erros,
não por acerto — e é por isso que o conserto da geometria tem que vir junto com
a exposição do parâmetro: sem ele, o número que o usuário digita não significa o
que promete.

## Decisão

Dois parâmetros novos — **quanto cresce** e **que formato tem** — mais o
conserto da geometria, mais calibração pelo diário a partir da altura de um pão
medido de verdade.

O que a seção descreve é o **pão assado**, com folga em volta: a conta parte de
`pesoAssado` e `preenchimento` dá a sobra. Serve para escolher cocotte, fôrma ou
cesta grande o bastante. Não é a cesta de fermentação, que conteria a massa crua
e partiria de `massaPorPao`.

## A geometria

```
V_pão   = pesoAssado × volumeEspecífico        cm³ do pão assado
V_fôrma = V_pão ÷ preenchimento                folga + o pão não ser um tijolo
largura = ∛( V_fôrma ÷ (razãoC × razãoA) )
compr.  = razãoC × largura
altura  = razãoA × largura
```

A divisão por `razãoC × razãoA` antes da raiz é o conserto. Com ela,
`volumeEspecífico` passa a valer cm³ por grama de pão assado, de fato.

`V_fôrma` também vira saída: a quarta métrica da seção, em litros. Fôrmas e
cestas são vendidas por volume, não por dimensão, então é o número mais
acionável dos quatro.

## Os parâmetros

**`volumeEspecifico`** — campo em *Ajustes*, aba Pão. Unidade `cm³/g`, passo
0,1, uma casa, padrão **2,7**. Dica: "Quanto o pão cresce por grama. Centeio
pesado 2,0–2,4; misto 2,6–3,0; branco bem fermentado 3,2–3,8. O diário calibra
este valor a partir da altura de um pão medido de verdade."

**`formato`** — seletor, também em *Ajustes*, padrão `batard`. A tabela vive em
`calc.js`:

| chave      | rótulo           | razãoC | razãoA | preenchimento |
|------------|------------------|--------|--------|---------------|
| `batard`   | Batard           | 2,2    | 0,85   | 0,55          |
| `boule`    | Boule            | 1,0    | 0,70   | 0,60          |
| `baguete`  | Baguete / filão  | 6,0    | 0,90   | 0,55          |
| `retangular` | Fôrma retangular | 3,2  | 1,00   | 0,80          |

A largura é sempre a unidade das proporções. `preenchimento` é alto na fôrma
retangular porque ali a massa encosta na parede.

A fôrma retangular é o caso invertido de verdade — quem tem a fôrma tem o
comprimento e a largura fixos, e só a altura varia. Modelar isso direito exigiria
cadastrar as fôrmas do usuário, o que está fora deste escopo. Ela sai pelo mesmo
caminho dos outros formatos, como *fôrma recomendada*.

## Campo não-numérico: o que isso quebra

`formato` é o primeiro campo não-numérico do app. `campos.js` é a definição
única que alimenta formulário, diff do diário e retratos de parâmetros, e hoje
só sabe descrever número.

A entrada em `CAMPOS` ganha `tipo: 'opcoes'` com a lista de rótulos, e
`formatarValor()` ganha um desvio no topo que devolve o rótulo da opção em vez
de passar pela formatação numérica. É esse desvio que faz o diário escrever
"Formato: Batard → Boule" em vez de `—`.

Quatro lugares coagem para número e precisam de um ramo:

| lugar | hoje | conserto |
|---|---|---|
| `calc.js:154` `normalizar()` | `e[chave] = num(bruto[chave], padrao)` — `'boule'` vira o padrão numérico | lista `TEXTOS = ['formato']` exportada ao lado de `LISTAS`, pulada no mesmo laço |
| `migrar.js:36` `escalares()` | mesmo laço | mesma lista, já que o arquivo importa `LISTAS` de `calc.js` |
| `store.js:239` `diffEntradas()` | `Number(…)` e `if (!Number.isFinite) continue` — pula o campo calado | ramo de texto antes do numérico |
| `app.js:1425` listener de `input` | casa só `input[data-campo]` | casar também `select[data-campo]`; `aplicarEntrada` aceita string |

Mais `campoEntrada` (`app.js:154`), que desenha `<select>` quando
`tipo === 'opcoes'`. O handler `passo` (`app.js:1355`) não é afetado: select não
tem botões ±.

## Calibração pela altura

Espelho de `calibrarPerda`. A altura é a dimensão que responde ao crescimento —
o comprimento quem define é o shaping — e é uma medida só, de régua.

- `criarRegistro` (`store.js:78`) e `normalizarRegistro` (`store.js:302`) ganham
  `alturaReal: dados.alturaReal ?? null`.
- No formulário de fornada (`app.js:953`), campo `f-altura`: "Altura do pão
  assado, em cm — estimado 9,3 cm", lido por `numeroOuNulo('f-altura')` em
  `app.js:1039`.
- `calc.js` ganha `calibrarVolumeEspecifico(pesoAssado, alturaReal, formato)`,
  invertendo a geometria:

  ```
  largura = alturaReal ÷ razãoA
  V_fôrma = razãoC × razãoA × largura³
  v       = V_fôrma × preenchimento ÷ pesoAssado
  ```

  Devolve `null` fora da faixa 1,5–5,0 cm³/g, como `calibrarPerda` devolve
  `null` para perda ≥ 1.
- **O peso usado é o real quando existir.** Se o registro tem
  `pesoRealAssado`, a calibração do crescimento parte dele, não do estimado.
  Senão o erro da perda no forno entraria no volume específico e os dois
  parâmetros passariam a se contaminar.
- `app.js:556` hoje só desenha a linha de calibração quando há peso real. Vira
  duas linhas independentes, cada uma com seu botão — "calibrar crescimento →
  3,1 cm³/g" — e o handler `calibrar` (`app.js:1328`) ganha um irmão.

## Migração

Os dois campos entram em `ENTRADAS_PADRAO` com valor padrão, e estado v3 salvo
carrega sem bump de `VERSAO_ESTADO`.

Quem preenche o buraco depende de quão velho é o estado, e vale ser preciso
porque os dois caminhos são diferentes. Estado v1 e v2 passa por `escalares()`,
que copia campo a campo a partir do padrão. Estado que já é v3 —
que é o caso de qualquer fornada gravada recentemente — `migrarEntradas`
devolve **intacto**, sem chamar `escalares()`; ali quem preenche é o spread
`{ ...ENTRADAS_PADRAO, ...base }` de `clonarEntradas`, por onde toda receita e
todo snapshot de fornada passam antes de serem guardados.

Essa distinção não é acadêmica: é o spread do `clonarEntradas` que impede uma
fornada antiga de exibir "Formato: — → Batard" no diff a primeira vez que o
diário é aberto depois da atualização, e é por isso que existe um teste
travando essa ordem em `test/store.test.mjs`.

A regra do `migrar.js` — "quem já usava o app não pode ver número mudar" — é
quebrada aqui de propósito, porque a geometria estava errada. Batard, 500 g,
volume específico 2,7:

| | hoje | depois |
|---|---|---|
| Comprimento | 26,8 cm | 24,1 cm |
| Largura | 12,2 cm | 10,9 cm |
| Altura | 10,3 cm | 9,3 cm |
| Volume | — | 2,45 L |

O `preenchimento` de 0,55 do batard foi escolhido sabendo disso. O valor 0,40
reproduziria as dimensões atuais na vírgula; ficou de fora por deixar a caixa
folgada demais.

## Testes

- `test/calc.test.mjs:67` trava `largura ≈ 12,15141476`, valor que corresponde
  ao `pesoAssado` da receita padrão. Passa a esperar o equivalente na geometria
  nova — ≈ 10,9 — com comprimento, altura e volume junto, todos recalculados a
  partir da fórmula, não copiados da saída do código.
- Ida e volta da calibração: dado um `volumeEspecifico`, a altura que ele
  produz, devolvida a `calibrarVolumeEspecifico`, recupera o valor original.
- `calibrarVolumeEspecifico` devolve `null` para altura zero, negativa e para
  resultado fora da faixa sã.
- Troca de formato muda as três dimensões mantendo o volume da fôrma coerente
  com `pesoAssado × volumeEspecífico ÷ preenchimento`.
- `diffEntradas` registra a troca de formato com os rótulos, não com as chaves.
- `normalizar` e `escalares` preservam `formato` como texto e caem no padrão
  quando recebem lixo.
