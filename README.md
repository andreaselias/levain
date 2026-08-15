# Levain

Calculadora de pão de fermentação natural, derivada da planilha `Tabela_de_pao.xlsx`.
Roda no celular, offline, sem instalar nada de loja.

Quatro abas sobre um motor de cálculo só:

- **🫧 Starter** — hidratação do starter-mãe, proporção de ativação, e quanto tirar do pote
- **🍞 Pão** — percentuais de padeiro e a lista de pesagem em gramas
- **💰 Custos** — preços, energia, embalagem, custo por pão
- **📓 Diário** — uma entrada por fornada, com o que mudou desde a anterior

## Instalar no celular

Abra `index.html` no navegador do celular e use **Adicionar à Tela de Início**
(Safari: botão de compartilhar; Chrome: menu ⋮). Vira um ícone que abre em tela
cheia e funciona sem internet.

Para levar o arquivo até o celular: AirDrop, e-mail para você mesmo, ou hospedar
em qualquer lugar que sirva arquivos estáticos.

## Como funciona

O app **não** é três calculadoras separadas — as abas dependem umas das outras. A
hidratação do starter ativado entra na fórmula da farinha e da água; os pesos
entram no custo. Por isso há uma única função pura `calcular(entradas)` que
resolve tudo na ordem certa a cada tecla digitada, e as abas são só recortes do
resultado.

Os dados ficam no `localStorage` do aparelho. Nada sai dali — não há servidor,
conta nem sincronização. **Exporte de vez em quando** (☰ → Backup): limpar os
dados do navegador apaga o diário.

### Calibrar a perda no forno

A planilha chuta 11% de perda de peso no forno. No diário, informe o peso real de
um pão assado e o app resolve a perda verdadeira e grava na receita. É o que troca
o chute por medição.

## Desenvolvimento

```sh
npm test     # 45 testes do motor e do armazenamento
npm run build
```

O build gera dois arquivos autocontidos, com CSS, JS e ícones embutidos:

| Arquivo | Para quê |
|---|---|
| `index.html` | documento completo — abrir no celular, instalar na tela de início |
| `artifact.html` | mesmo conteúdo sem `<head>`, para publicar como Artifact |

O JavaScript vira um script clássico de propósito: módulos ES são bloqueados por
CORS quando a página abre via `file://`, que é justamente o caso de uso.

### Estrutura

```
src/calc.js       motor puro — sem DOM, sem estado, testável no Node
src/campos.js     rótulo, aba, unidade e formatação de cada entrada
src/store.js      receitas, diário, diff, export/import, persistência
src/app.js        interface
src/styles.css    estilo
build.mjs         empacota tudo; também desenha o ícone PNG
```

`src/calc.js` reproduz a planilha ao pé da letra, inclusive o arredondamento do
Excel — que normaliza para 15 dígitos significativos antes de arredondar. Sem
isso a água sai 390 g em vez de 400 g, porque `(590+60)×0,7` vale
`454,99999999999994` em ponto flutuante.

Quatro comportamentos da planilha foram preservados de propósito, mesmo não sendo
o ideal, porque são os números que já se conhece de cor:

1. **Extras** entra no custo, não no peso da massa
2. A farinha de dentro do starter é cobrada ao preço da **farinha branca**
3. A **água não tem custo**
4. Cada ingrediente arredonda por conta própria, não o total

Os dois primeiros aparecem como nota na interface, para não parecerem bug.

O projeto e a referência completa de fórmulas estão em
[`docs/superpowers/specs/`](docs/superpowers/specs/).
