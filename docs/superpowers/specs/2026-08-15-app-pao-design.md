# Aplicativo de Pão — Design

Data: 2026-08-15
Origem: `~/Downloads/Tabela_de_pao.xlsx`, aba única `Calculadora de pão`

## Objetivo

Transformar a planilha de sourdough numa aplicação que roda no celular, offline,
instalável na tela de início. Além de reproduzir a planilha fielmente, o app
ganha duas capacidades que a planilha não tem: **múltiplas receitas nomeadas** e
um **diário de fornadas** que registra o que mudou entre uma tentativa e outra.

## Formato

Um único arquivo `index.html` autocontido — HTML, CSS e JS embutidos, sem
dependências externas e sem servidor. O usuário abre pelo navegador do celular e
usa "Adicionar à Tela de Início": vira um ícone que abre em tela cheia e
funciona sem internet.

O arquivo único é **gerado**, não escrito à mão. O código-fonte vive separado
para poder ser testado:

```
src/calc.js      motor de cálculo puro (sem DOM, sem estado) — testável em Node
src/store.js     receitas, diário, persistência, diff, export/import
src/app.js       UI: abas, renderização, eventos
src/styles.css   estilo
src/index.template.html  esqueleto com marcadores de injeção
build.mjs        inlina tudo em index.html
test/calc.test.mjs   testes do motor contra os valores da planilha
index.html       artefato gerado — é o que roda no celular
```

O passo de build existe por uma razão só: permitir que o motor de cálculo seja
testado no Node contra os valores conhecidos da planilha. Sem isso não há como
provar que o app calcula certo.

## Arquitetura

### Um motor, quatro janelas

As abas **não** são calculadoras independentes. Há dependências reais entre elas:

- a hidratação do starter ativado (aba Starter) entra na fórmula da farinha e da
  água (aba Pão);
- os pesos dos ingredientes (aba Pão) entram no custo (aba Custos);
- o número de fornadas (aba Pão) entra no custo de energia (aba Custos).

Por isso existe **uma única função pura** `calcular(entradas) → resultados` que
resolve tudo de uma vez, na ordem correta de dependência. A cada tecla
digitada, o app roda a função inteira e redesenha. As abas são apenas recortes
de visualização do mesmo objeto de resultado. Não há estado derivado guardado em
lugar nenhum, o que elimina a classe de bug "mudei aqui e a outra aba ficou
desatualizada".

Ordem de resolução dentro de `calcular`:

1. hidratação do starter ativado (depende só dos parâmetros do starter)
2. peso-alvo da massa
3. farinha total, e a partir dela cada ingrediente
4. métricas derivadas (hidratação real, peso assado, dimensões, fornadas)
5. ativação do starter (depende do peso de starter, calculado no passo 3)
6. custos (dependem dos pesos e das fornadas)

## Referência de fórmulas

Esta seção é normativa. Qualquer divergência entre o app e a planilha é um bug,
salvo as exceções documentadas na seção "Comportamentos preservados".

### Notação

| Símbolo | Célula | Significado | Padrão |
|---|---|---|---|
| `W` | B1 | peso assado desejado por pão (g) | 500 |
| `N` | B2 | número de pães | 2 |
| `pInt` | C5 | % farinha integral | 0,10 |
| `pRye` | C6 | % farinha de centeio | 0,00 |
| `pHyd` | C7 | hidratação | 0,70 |
| `pSt` | C8 | % starter | 0,20 |
| `pSalt` | C9 | % sal | 0,02 |
| `pMol` | C10 | % melado | 0,00 |
| `extras` | B11 | extras (g) | 0 |
| `R` | B13 | fator de arredondamento (g) | 10 |
| `loss` | B16 | perda estimada no forno | 0,11 |
| `hMae` | C17 | hidratação do starter-mãe | 1,00 |
| `tPre` | B22 | pré-aquecimento (min) | 45 |
| `tBake` | B23 | cozimento (min) | 40 |
| `rSt`,`rFl`,`rWa` | C46,C47,C48 | proporção de ativação starter : farinha : água | 1 : 3 : 3 |

`round(x)` = arredondamento do Excel: metade para longe do zero.
`roundUp(x)` = teto em valor absoluto.
`snap(x) = round(x / R) * R`.

### 1. Starter ativado

```
hAct = (rFl + rSt/(1+hMae)) == 0  ou  rSt <= 0
       ? 0
       : (rWa + rSt*hMae/(1+hMae)) / (rFl + rSt/(1+hMae))
```

Com os padrões: `(3 + 0,5) / (3 + 0,5) = 1,0`.

### 2. Farinha total

```
alvoMassa = W * N / (1 - loss)
denom     = 1 + pSt + pSalt + pMol + pHyd*(1 + pSt/(1+hAct)) - pSt*hAct/(1+hAct)
farinhaTotal = snap(alvoMassa / denom)
```

O denominador é a soma dos percentuais expressa em função da farinha
*adicionada*, descontando que parte da farinha e da água já chegam dentro do
starter. Com os padrões: `denom = 1,89`, `alvoMassa = 1123,5955`,
`farinhaTotal = snap(594,495) = 590`.

### 3. Ingredientes

```
farinhaBranca = snap(farinhaTotal * (1 - pInt - pRye))
integral      = snap(farinhaTotal * pInt)
centeio       = snap(farinhaTotal * pRye)
starter       = snap(farinhaTotal * pSt)
agua          = snap((farinhaTotal + starter/(1+hAct)) * pHyd - starter*hAct/(1+hAct))
sal           = snap(farinhaTotal * pSalt)
melado        = snap(farinhaTotal * pMol)
```

Cada linha arredonda independentemente, então `farinhaBranca + integral +
centeio` pode não bater exatamente com `farinhaTotal`. Isso é da planilha e é
preservado.

### 4. Métricas

```
pesoTotal      = farinhaBranca + integral + centeio + agua + starter + sal + melado
pesoPorPao     = round(pesoTotal / N)
hidratacaoReal = (agua + starter*hAct/(1+hAct))
                 / (farinhaBranca + integral + centeio + starter/(1+hAct))
pesoAssado     = pesoPorPao * (1 - loss)
largura        = ((pesoAssado * 2,7) / 0,75) ^ (1/3)
comprimento    = largura * 2,2
altura         = largura * 0,85
fornadas       = roundUp(N / 2)
```

`pesoTotal` **não** inclui `extras` (na planilha é `SUM(B4:B10)`, que para no
melado).

### 5. Ativação do starter

```
maeParaAtivar = (rSt <= 0 ou rSt+rFl+rWa <= 0) ? 0 : roundUp(starter * rSt / (rSt+rFl+rWa))
farinhaAtivar = rSt <= 0 ? 0 : maeParaAtivar * rFl / rSt
aguaAtivar    = rSt <= 0 ? 0 : maeParaAtivar * rWa / rSt
farinhaNoStarter = starter / (1+hAct)
aguaNoStarter    = starter * hAct / (1+hAct)
totalAtivado  = maeParaAtivar + farinhaAtivar + aguaAtivar
sobra         = max(totalAtivado - starter, 0)
```

### 6. Custos

Preços de farinha, sal, melado e extras são **por quilo**; embalagens e etiqueta
são por unidade.

```
custoEnergia = ((tPre + tBake*fornadas) / 60) * 0,6 * precoKwh
embalagem    = embExterna + embInterna + etiqueta
custoProducao = embalagem * N
              + ( precoFarinha * (farinhaBranca + farinhaNoStarter)
                + precoIntegral * integral
                + precoCenteio  * centeio
                + precoSal      * sal
                + precoMelado   * melado
                + precoExtras   * extras ) / 1000
              + custoEnergia
custoPorPao         = custoProducao / N - embalagem
custoPorPaoEmbalado = custoProducao / N
```

O `0,6` é a potência assumida do forno em kW e está embutido na planilha; no app
vira um parâmetro editável com padrão 0,6, porque é a única constante mágica que
o usuário plausivelmente precisa mudar ao trocar de forno.

## Comportamentos preservados

Estes são desvios de "o que seria ideal", mantidos porque é o comportamento que
o usuário já conhece e cujos números ele confere de cabeça:

1. **Extras não entra no peso.** Só no custo. Adicionar 50 g de nozes não muda o
   peso dos pães calculado, apenas o preço.
2. **A farinha do starter é cobrada ao preço da farinha branca**, mesmo que o
   starter seja alimentado com integral.
3. **A água não tem custo.**
4. **Arredondamento por ingrediente**, não do total (ver §3).

Os itens 1 e 2 aparecem como nota discreta na interface, na aba onde importam,
para que o usuário saiba que é intencional e não um bug.

## Modelo de dados

```
Receita {
  id, nome, criadaEm, atualizadaEm,
  entradas: { ...todos os campos das §§1-6... }
}

RegistroDiario {
  id, receitaId, quando,          // editável
  observacao,                     // texto livre
  snapshot: { ...entradas... },   // retrato completo no momento do registro
  pesoRealAssado,                 // g, opcional
  notas: { crescimento, miolo, casca, acidez },   // 1-5, opcional
  processo: { fermentacaoH, geladeiraH, temperaturaC }  // opcional
}
```

O **diff** não é armazenado: é calculado na hora, comparando `snapshot` com o
`snapshot` do registro anterior da mesma receita. Isso mantém o dado canônico
único — se o formato de exibição do diff mudar, o histórico inteiro se
beneficia sem migração.

Persistência em `localStorage`, chave única com todo o estado serializado.
Escrita com debounce de 300 ms para não gravar a cada tecla.

## Interface

Mobile-first. Barra de abas fixa na base (alcance do polegar), barra de receita
no topo. Números de pesagem em tipo grande — são lidos com as mãos na massa.

**🫧 Starter** — entradas: hidratação do starter-mãe, proporção de ativação
(três campos). Saídas: starter-mãe a retirar do pote, farinha, água, total
ativado, sobra, hidratação resultante.

**🍞 Pão** — entradas: peso assado desejado, nº de pães, os seis percentuais,
extras, fator de arredondamento, perda no forno, tempos de forno. Saídas: lista
de pesagem em destaque, peso total, peso por pão cru, peso assado estimado,
hidratação real, dimensões da fôrma, nº de fornadas.

**💰 Custos** — entradas: preços por kg, R$/kWh, potência do forno, embalagens,
etiqueta. Saídas: custo de energia, custo de produção, custo por pão, custo por
pão embalado.

**📓 Diário** — linha do tempo invertida, filtro "esta receita" / "todas", botão
**Registrar fornada**. Cada registro mostra data, o diff automático contra o
registro anterior, a observação, o retrato de parâmetros recolhido e os campos
opcionais de resultado.

**Calibração da perda no forno.** Quando o registro tem `pesoRealAssado`, o app
mostra `estimado X g · real Y g` e oferece um botão que calcula a perda
verdadeira — `1 - pesoRealAssado / pesoPorPao` — e grava na receita mediante
confirmação. É o que substitui o chute de 11% por medição.

## Backup

Exportar e importar todo o estado em JSON, dois botões nas configurações. O
`localStorage` é apagado quando o usuário limpa os dados do navegador; um diário
construído ao longo de meses não pode depender só disso. A importação pede
confirmação antes de sobrescrever.

## Verificação

O motor é testado no Node contra os valores que a planilha produz com os
parâmetros padrão. Estes números são o critério de aceitação:

| Grandeza | Esperado |
|---|---|
| farinha branca | 530 |
| farinha integral | 60 |
| farinha centeio | 0 |
| água | 400 |
| starter | 120 |
| sal | 10 |
| melado | 0 |
| farinha total | 590 |
| peso total | 1120 |
| peso por pão (cru) | 560 |
| peso-alvo da massa | 1123,595506 |
| hidratação real | 0,7076923077 |
| peso assado estimado | 498,4 |
| largura / comprimento / altura | 12,15141476 / 26,73311248 / 10,32870255 |
| fornadas | 1 |
| hidratação do starter ativado | 1 |
| mãe / farinha / água para ativação | 18 / 54 / 54 |
| total ativado / sobra | 126 / 6 |
| custo de energia | 0,735505 |
| custo de produção | 8,271905 |
| custo por pão | 2,0259525 |
| custo por pão embalado | 4,1359525 |

Comparações com tolerância de 1e-6 para os valores fracionários e igualdade
exata para os pesos em gramas.

Casos de borda cobertos por teste: `R = 0` (não deve dividir por zero — trata
como "sem arredondamento"), `loss = 1`, `rSt = 0`, `N = 0`, percentuais que
zeram o denominador. Em todos, o app deve exibir um aviso em vez de `NaN` ou
`Infinity`.

Verificação manual antes de entregar: abrir o `index.html` no navegador, conferir
que os números batem com a tabela acima, criar uma segunda receita, registrar
uma fornada, recarregar a página e confirmar que tudo persistiu.

## Fora de escopo

- Foto do pão nos registros. Cabe tecnicamente (IndexedDB comporta centenas de
  MB), mas exige compressão, miniaturas e tratamento na exportação. Fica para
  uma segunda rodada, se fizer falta.
- Sincronização entre aparelhos, contas, servidor.
- Notificações de horário de dobra.
