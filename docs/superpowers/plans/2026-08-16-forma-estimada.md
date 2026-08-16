# Fôrma estimada — crescimento e formato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar ajustáveis os dois números que hoje estão fixos na estimativa de fôrma — quanto o pão cresce e que formato ele tem — corrigindo de passagem a geometria, que aplica as proporções depois da raiz cúbica e infla a caixa em 1,87×.

**Architecture:** Uma tabela de formatos e um parâmetro de volume específico entram no motor puro (`calc.js`); `campos.js` aprende a descrever campo de opções, o que faz o seletor aparecer sozinho no formulário, no diff do diário e nos retratos; o diário ganha uma medida de altura que calibra o volume específico, espelhando o que já existe para a perda no forno.

**Tech Stack:** JavaScript ES modules sem dependências. Testes em `node:test`. `build.mjs` inlina `src/` num `index.html` autocontido.

**Spec:** `docs/superpowers/specs/2026-08-16-forma-estimada-design.md`

---

## Contexto que o executor precisa antes de começar

**O motor é puro e testado; a UI não é.** `src/calc.js`, `src/store.js`, `src/campos.js` e `src/migrar.js` têm testes em `test/*.test.mjs` rodando em Node. `src/app.js` toca DOM e o projeto não tem jsdom nem qualquer dependência — **as tarefas de `app.js` são verificadas à mão, abrindo o app no navegador**. Isso está explícito em cada uma delas. Não invente um harness de DOM.

**O build tem um guard sobre imports.** `build.mjs:151` estoura se sobrar um `import` ou `export` depois de remover os de linha única. Toda linha de `import` que você tocar precisa continuar cabendo **numa linha só**. Declarações `export const` de várias linhas são fine — o guard só remove a palavra `export` do começo da linha.

**Rodar os testes:** `npm test`. **Rodar um arquivo só:** `node --test test/calc.test.mjs`.

**Idioma:** o código, os comentários e os rótulos são em português. Comentários explicam *por que*, não *o quê* — siga o tom dos arquivos existentes.

---

## File Structure

| arquivo | responsabilidade | o que muda |
|---|---|---|
| `src/calc.js` | motor puro: normalização das entradas, cálculo, calibrações | tabela `FORMATOS`, lista `TEXTOS`, duas entradas novas, geometria corrigida, saída `volumeForma`, `calibrarVolumeEspecifico` |
| `src/campos.js` | definição única dos campos — alimenta formulário, diff e retratos | tipo `opcoes`, os dois campos novos, `formatarValor` com ramo de texto |
| `src/migrar.js` | conversão de estado salvo antigo | `escalares()` para de coagir campo de texto para número |
| `src/store.js` | receitas, diário, diff, persistência | `diffEntradas` com ramo de texto, `alturaReal` no registro |
| `src/app.js` | UI | `<select>`, quarta métrica, campo de altura na fornada, botão de calibrar crescimento |
| `src/styles.css` | estilo | regra para `select` dentro de `.campo-controle` |
| `test/calc.test.mjs` | testes do motor | geometria nova, calibração, normalização |
| `test/store.test.mjs` | testes do diário | diff de campo de opções, `alturaReal` |
| `test/migrar.test.mjs` | testes de migração | estado antigo ganha os padrões novos |

---

### Task 1: Formatos e as duas entradas novas

Só vocabulário e normalização. A geometria continua a antiga nesta tarefa — o teste que trava as dimensões atuais **tem que continuar passando no fim dela**. É de propósito: separa "os campos existem e sobrevivem à normalização" de "a conta mudou".

**Files:**
- Modify: `src/calc.js` (antes de `ENTRADAS_PADRAO`, dentro de `ENTRADAS_PADRAO`, ao lado de `LISTAS`, dentro de `calcular`)
- Modify: `src/migrar.js:34-41`
- Test: `test/calc.test.mjs`, `test/migrar.test.mjs`

- [ ] **Step 1: Escreva os testes que falham**

Em `test/calc.test.mjs`, acrescente ao fim do arquivo:

```js
test('formato sobrevive à normalização e cai no padrão quando é lixo', () => {
  assert.equal(calcular({ ...ENTRADAS_PADRAO, formato: 'boule' }).pao.formato, 'boule');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, formato: 'inventado' }).pao.formato, 'batard');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, formato: 42 }).pao.formato, 'batard');
  assert.equal(calcular({ ...ENTRADAS_PADRAO, formato: undefined }).pao.formato, 'batard');
});

test('a tabela de formatos tem os quatro formatos, com proporções positivas', () => {
  assert.deepEqual(
    FORMATOS.map((f) => f.chave),
    ['batard', 'boule', 'baguete', 'retangular']
  );
  for (const f of FORMATOS) {
    assert.ok(f.razaoC > 0 && f.razaoA > 0, `${f.chave}: razões positivas`);
    assert.ok(f.preenchimento > 0 && f.preenchimento <= 1, `${f.chave}: preenchimento entre 0 e 1`);
    assert.ok(f.rotulo.length > 0, `${f.chave}: tem rótulo`);
  }
});
```

Na linha 3 do mesmo arquivo, troque o import (mantendo-o **numa linha só**):

```js
import { calcular, ENTRADAS_PADRAO, FORMATOS } from '../src/calc.js';
```

Em `test/migrar.test.mjs`, acrescente ao fim:

```js
test('estado antigo ganha os padrões de formato e crescimento', () => {
  const migrado = migrarEntradas(V1);
  assert.equal(migrado.formato, 'batard', 'formato padrão');
  perto(migrado.volumeEspecifico, 2.7, 'volume específico padrão');
});

test('migração preserva o formato já escolhido, sem virar número', () => {
  const migrado = migrarEntradas({ ...V1, formato: 'boule', volumeEspecifico: 2.2 });
  assert.equal(migrado.formato, 'boule');
  perto(migrado.volumeEspecifico, 2.2, 'volume específico preservado');
});
```

- [ ] **Step 2: Rode e confirme que falham**

Run: `npm test`
Expected: FAIL — `FORMATOS` não está exportado (`SyntaxError` na importação de `calc.test.mjs`) e os testes de migração acusam `undefined`.

- [ ] **Step 3: Adicione a tabela de formatos em `src/calc.js`**

Logo **antes** de `export const ENTRADAS_PADRAO`:

```js
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
```

- [ ] **Step 4: Acrescente as duas entradas em `ENTRADAS_PADRAO`**

Dentro do bloco `// Ajustes`, logo depois de `perdaForno: 0.11,`:

```js
  // Quanto o pão cresce, em cm³ por grama de pão assado. É o que mais varia
  // com a receita — centeio pesado fica em 2,0-2,4, branco bem fermentado
  // passa de 3,5 — e o diário calibra a partir de um pão medido de verdade.
  volumeEspecifico: 2.7,
  formato: 'batard',
```

- [ ] **Step 5: Declare `TEXTOS` ao lado de `LISTAS`**

Logo depois da linha `export const LISTAS = [...]`:

```js
/**
 * Campos escalares que guardam texto, não número. Existem para serem pulados
 * pelos laços que coagem tudo com `num()` — sem isso, 'boule' vira o padrão
 * numérico silenciosamente.
 */
export const TEXTOS = ['formato'];
```

- [ ] **Step 6: Normalize o formato em `calcular()`**

Em `src/calc.js:154-157`, troque o laço por:

```js
  const e = {};
  for (const [chave, padrao] of Object.entries(ENTRADAS_PADRAO)) {
    if (LISTAS.includes(chave) || TEXTOS.includes(chave)) continue;
    e[chave] = num(bruto[chave], padrao);
  }
  // Formato desconhecido cai no padrão: o resto da conta lê as razões da tabela
  // e não tem como seguir sem elas.
  e.formato = FORMATO_POR_CHAVE[bruto.formato] ? bruto.formato : ENTRADAS_PADRAO.formato;
```

- [ ] **Step 7: Devolva o formato no resultado**

No objeto `pao` retornado por `calcular` (`src/calc.js:475-494`), logo antes de `largura: fin(largura),`:

```js
      formato: e.formato,
```

- [ ] **Step 8: Pare de coagir texto em `src/migrar.js`**

Troque a linha 13 (mantendo **numa linha só**):

```js
import { ENTRADAS_PADRAO, LISTAS, TEXTOS } from './calc.js';
```

E o corpo de `escalares()` (`src/migrar.js:34-41`):

```js
function escalares(v) {
  const saida = {};
  for (const [chave, padrao] of Object.entries(ENTRADAS_PADRAO)) {
    if (LISTAS.includes(chave)) continue;
    // A validação do valor é de `calcular`; aqui só se preserva o que veio,
    // porque a migração não conhece o vocabulário de cada campo de texto.
    saida[chave] = TEXTOS.includes(chave) ? (v[chave] ?? padrao) : num(v[chave], padrao);
  }
  return saida;
}
```

- [ ] **Step 9: Rode os testes**

Run: `npm test`
Expected: PASS — inclusive `métricas derivadas reproduzem a planilha`, que ainda trava as dimensões antigas. Se ele falhou, você mexeu na geometria antes da hora; desfaça.

- [ ] **Step 10: Commit**

```bash
git add src/calc.js src/migrar.js test/calc.test.mjs test/migrar.test.mjs
git commit -m "Acrescenta formato e volume específico como entradas da receita"
```

---

### Task 2: A geometria corrigida e o volume da fôrma

**Files:**
- Modify: `src/calc.js:319-321` (a conta), `src/calc.js:475-494` (o retorno)
- Test: `test/calc.test.mjs:63-71`

- [ ] **Step 1: Ajuste o teste existente e escreva os novos**

Em `test/calc.test.mjs`, o teste `métricas derivadas reproduzem a planilha` trava as dimensões antigas. Troque as três linhas de dimensão:

```js
test('métricas derivadas reproduzem a planilha', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  perto(pao.hidratacaoReal, 0.7076923077, 'hidratação real');
  perto(pao.pesoAssado, 498.4, 'peso assado por pão');
  // Valor de referência da geometria corrigida: ∛(498,4 × 2,7 ÷ 0,55 ÷ 1,87).
  // Tolerância mais folgada que a do resto porque é raiz cúbica calculada à
  // mão — as identidades abaixo é que provam que a conta está certa.
  pertoCom(pao.largura, 10.9374, 1e-3, 'largura');
  assert.equal(pao.fornadas, 1, 'fornadas');
});

test('a caixa fecha com o volume da fôrma — a raiz cúbica está no lugar certo', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  // Era exatamente isto que a fórmula antiga violava: ela aplicava as
  // proporções DEPOIS da raiz, e a caixa saía 1,87× maior que o volume usado
  // para calculá-la.
  perto(pao.comprimento * pao.largura * pao.altura, pao.volumeForma, 'caixa = volume da fôrma');
  perto(pao.volumeForma * 0.55, pao.pesoAssado * 2.7, 'o pão ocupa 55% da fôrma');
});

test('as dimensões guardam as proporções do formato escolhido', () => {
  const batard = calcular(ENTRADAS_PADRAO).pao;
  perto(batard.comprimento / batard.largura, 2.2, 'batard, comprimento');
  perto(batard.altura / batard.largura, 0.85, 'batard, altura');

  const boule = calcular({ ...ENTRADAS_PADRAO, formato: 'boule' }).pao;
  perto(boule.comprimento / boule.largura, 1, 'boule, comprimento');
  perto(boule.altura / boule.largura, 0.7, 'boule, altura');
  perto(boule.comprimento * boule.largura * boule.altura, boule.volumeForma, 'boule, caixa');
});

test('mais crescimento dá pão maior, e o volume da fôrma acompanha', () => {
  const magro = calcular({ ...ENTRADAS_PADRAO, volumeEspecifico: 2.1 }).pao;
  const cheio = calcular({ ...ENTRADAS_PADRAO, volumeEspecifico: 3.4 }).pao;
  assert.ok(cheio.altura > magro.altura, 'altura cresce com o volume específico');
  perto(cheio.volumeForma / magro.volumeForma, 3.4 / 2.1, 'volume da fôrma é proporcional');
});

test('peso assado zero não produz dimensão negativa nem NaN', () => {
  const { pao } = calcular({ ...ENTRADAS_PADRAO, numeroPaes: 0 });
  for (const chave of ['largura', 'comprimento', 'altura', 'volumeForma']) {
    assert.equal(pao[chave], 0, `${chave} zerado`);
  }
});
```

Acrescente o helper de tolerância variável logo depois de `perto`, no topo do arquivo:

```js
function pertoCom(atual, esperado, tol, msg) {
  assert.ok(
    Number.isFinite(atual) && Math.abs(atual - esperado) < tol,
    `${msg}: esperado ~${esperado} (±${tol}), recebido ${atual}`
  );
}
```

- [ ] **Step 2: Rode e confirme que falham**

Run: `node --test test/calc.test.mjs`
Expected: FAIL — `largura` ainda vale ~12,15 e `volumeForma` é `undefined`.

- [ ] **Step 3: Escreva a geometria nova**

Em `src/calc.js`, troque as três linhas (319-321) por:

```js
  // A ordem importa: o volume é dividido pelas razões ANTES da raiz cúbica.
  // Fazer o contrário — que era o que esta conta fazia — infla a caixa pelo
  // produto das razões e faz o volume específico significar outra coisa.
  const f = FORMATO_POR_CHAVE[e.formato];
  const volumeForma = pesoAssado > 0 ? (pesoAssado * e.volumeEspecifico) / f.preenchimento : 0;
  const largura = volumeForma > 0 ? Math.cbrt(volumeForma / (f.razaoC * f.razaoA)) : 0;
  const comprimento = largura * f.razaoC;
  const altura = largura * f.razaoA;
```

- [ ] **Step 4: Devolva o volume**

No objeto `pao` retornado, logo depois de `altura: fin(altura),`:

```js
      volumeForma: fin(volumeForma),
```

- [ ] **Step 5: Rode os testes**

Run: `npm test`
Expected: PASS, todos os arquivos.

- [ ] **Step 6: Commit**

```bash
git add src/calc.js test/calc.test.mjs
git commit -m "Conserta a geometria da fôrma e devolve o volume"
```

---

### Task 3: Calibrar o crescimento a partir da altura medida

**Files:**
- Modify: `src/calc.js` (depois de `calibrarPerda`, fim do arquivo)
- Test: `test/calc.test.mjs`

- [ ] **Step 1: Escreva os testes que falham**

Em `test/calc.test.mjs`, ao fim do arquivo:

```js
test('a calibração do crescimento é a volta exata da ida', () => {
  for (const chave of ['batard', 'boule', 'baguete', 'retangular']) {
    for (const v of [2.1, 2.7, 3.4]) {
      const { pao } = calcular({ ...ENTRADAS_PADRAO, formato: chave, volumeEspecifico: v });
      const devolvido = calibrarVolumeEspecifico(pao.pesoAssado, pao.altura, chave);
      perto(devolvido, v, `${chave} a ${v} cm³/g`);
    }
  }
});

test('a calibração usa o peso que recebe, não o da receita', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  const comPesoMaior = calibrarVolumeEspecifico(pao.pesoAssado * 1.1, pao.altura, 'batard');
  perto(comPesoMaior, 2.7 / 1.1, 'mesmo volume repartido em mais grama dá menos cm³/g');
});

test('a calibração recusa medida impossível', () => {
  const { pao } = calcular(ENTRADAS_PADRAO);
  assert.equal(calibrarVolumeEspecifico(pao.pesoAssado, 0, 'batard'), null, 'altura zero');
  assert.equal(calibrarVolumeEspecifico(pao.pesoAssado, -5, 'batard'), null, 'altura negativa');
  assert.equal(calibrarVolumeEspecifico(0, 9.3, 'batard'), null, 'peso zero');
  assert.equal(calibrarVolumeEspecifico(pao.pesoAssado, 9.3, 'inventado'), null, 'formato desconhecido');
  assert.equal(calibrarVolumeEspecifico(pao.pesoAssado, 3, 'batard'), null, 'baixo demais para ser pão');
  assert.equal(calibrarVolumeEspecifico(pao.pesoAssado, 25, 'batard'), null, 'alto demais para ser pão');
  assert.equal(calibrarVolumeEspecifico(pao.pesoAssado, 'nada', 'batard'), null, 'altura não numérica');
});
```

E acrescente `calibrarVolumeEspecifico` ao import da linha 3 (**numa linha só**):

```js
import { calcular, calibrarVolumeEspecifico, ENTRADAS_PADRAO, FORMATOS } from '../src/calc.js';
```

- [ ] **Step 2: Rode e confirme que falham**

Run: `node --test test/calc.test.mjs`
Expected: FAIL — `calibrarVolumeEspecifico is not a function`.

- [ ] **Step 3: Implemente**

Em `src/calc.js`, logo depois de `calibrarPerda`:

```js
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
export function calibrarVolumeEspecifico(pesoAssado, alturaReal, chaveFormato) {
  const f = FORMATO_POR_CHAVE[chaveFormato];
  const peso = Number(pesoAssado);
  const altura = Number(alturaReal);
  if (!f || !(peso > 0) || !(altura > 0)) return null;

  const largura = altura / f.razaoA;
  const volumeForma = f.razaoC * f.razaoA * largura ** 3;
  const volumeEspecifico = (volumeForma * f.preenchimento) / peso;

  // Fora desta faixa não é pão: ou a régua mediu outra coisa, ou o peso
  // anotado é de outra fornada.
  if (!Number.isFinite(volumeEspecifico) || volumeEspecifico < 1.5 || volumeEspecifico > 5) return null;
  return volumeEspecifico;
}
```

- [ ] **Step 4: Rode os testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc.js test/calc.test.mjs
git commit -m "Calibra o volume específico pela altura de um pão medido"
```

---

### Task 4: `campos.js` aprende campo de opções

Esta é a tarefa que faz o seletor aparecer sozinho no diff do diário e nos retratos de parâmetros — os dois leem `CAMPOS` e `formatarValor`.

**Files:**
- Modify: `src/campos.js` (import novo, dois campos em `CAMPOS`, `formatarValor`)
- Test: `test/store.test.mjs`

- [ ] **Step 1: Escreva os testes que falham**

Em `test/store.test.mjs`, ao fim do arquivo:

```js
test('campo de opções é formatado pelo rótulo, não pelo número', () => {
  const campo = CAMPO_POR_CHAVE.formato;
  assert.equal(campo.tipo, 'opcoes');
  assert.equal(formatarValor(campo, 'batard'), 'Batard');
  assert.equal(formatarValor(campo, 'retangular'), 'Fôrma retangular');
  assert.equal(formatarValor(campo, 'inventado'), '—', 'opção desconhecida');
  assert.equal(formatarValor(campo, null), '—', 'ausente');
});

test('o volume específico é formatado com a unidade', () => {
  assert.equal(formatarValor(CAMPO_POR_CHAVE.volumeEspecifico, 2.7), '2,7 cm³/g');
});
```

- [ ] **Step 2: Rode e confirme que falham**

Run: `node --test test/store.test.mjs`
Expected: FAIL — `CAMPO_POR_CHAVE.formato` é `undefined`.

- [ ] **Step 3: Importe a tabela de formatos**

No topo de `src/campos.js`, antes de `export const CAMPOS` (o arquivo hoje não tem imports; esta é a primeira linha do arquivo depois do comentário de cabeçalho, e precisa caber **numa linha só**):

```js
import { FORMATOS } from './calc.js';
```

- [ ] **Step 4: Acrescente os dois campos**

Em `CAMPOS`, no grupo `Ajustes` da aba `pao`, logo depois da entrada de `perdaForno`:

```js
  { chave: 'volumeEspecifico', rotulo: 'Volume específico', aba: 'pao', grupo: 'Ajustes', unidade: 'cm³/g', passo: 0.1, casas: 1, dica: 'Quanto o pão cresce por grama. Centeio pesado 2,0–2,4; misto 2,6–3,0; branco bem fermentado 3,2–3,8. O diário calibra este valor a partir da altura de um pão medido de verdade.' },
  { chave: 'formato', rotulo: 'Formato', aba: 'pao', grupo: 'Ajustes', tipo: 'opcoes', opcoes: FORMATOS.map((f) => ({ valor: f.chave, rotulo: f.rotulo })), dica: 'Define as proporções da fôrma estimada e a folga em volta do pão.' },
```

- [ ] **Step 5: Ensine `formatarValor` a ler opção**

Em `src/campos.js`, no começo de `formatarValor`, **antes** da guarda de número:

```js
export function formatarValor(campo, valor) {
  // Precisa vir antes da guarda numérica: 'boule' não é finito e cairia no
  // travessão, apagando a troca de formato do diff do diário.
  if (campo.tipo === 'opcoes') {
    return campo.opcoes.find((o) => o.valor === valor)?.rotulo ?? '—';
  }
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
  ...
```

- [ ] **Step 6: Rode os testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/campos.js test/store.test.mjs
git commit -m "Ensina campos.js a descrever campo de opções"
```

---

### Task 5: O diff do diário registra a troca de formato

**Files:**
- Modify: `src/store.js:238-249`
- Test: `test/store.test.mjs`

- [ ] **Step 1: Escreva os testes que falham**

Em `test/store.test.mjs`, ao fim do arquivo:

```js
test('trocar de formato aparece no diff, com os rótulos', () => {
  const mudancas = diffEntradas(
    { ...ENTRADAS_PADRAO, formato: 'batard' },
    { ...ENTRADAS_PADRAO, formato: 'boule' }
  );
  const linha = mudancas.find((m) => m.chave === 'formato');
  assert.ok(linha, 'a troca de formato entrou no diff');
  assert.equal(linha.rotulo, 'Formato');
  assert.equal(linha.de, 'Batard');
  assert.equal(linha.para, 'Boule');
});

test('formato igual não polui o diff', () => {
  const mudancas = diffEntradas(
    { ...ENTRADAS_PADRAO, formato: 'boule', hidratacao: 0.7 },
    { ...ENTRADAS_PADRAO, formato: 'boule', hidratacao: 0.75 }
  );
  assert.equal(mudancas.filter((m) => m.chave === 'formato').length, 0);
});
```

- [ ] **Step 2: Rode e confirme que falham**

Run: `node --test test/store.test.mjs`
Expected: FAIL — o diff não traz a linha `formato`, porque o laço a pula ao não achar número finito.

- [ ] **Step 3: Acrescente o ramo de texto**

Em `src/store.js`, dentro do `for (const campo of CAMPOS)` de `diffEntradas`, **antes** das linhas que fazem `Number(...)`:

```js
  for (const campo of CAMPOS) {
    // Campo de opções compara por identidade e é escrito pelo rótulo. O ramo
    // numérico abaixo o descartaria calado, porque 'boule' não é finito.
    if (campo.tipo === 'opcoes') {
      const de = anterior[campo.chave];
      const para = atual[campo.chave];
      if (de === para) continue;
      mudancas.push({
        chave: campo.chave,
        rotulo: campo.rotulo,
        de: formatarValor(campo, de),
        para: formatarValor(campo, para),
      });
      continue;
    }

    const de = Number(anterior[campo.chave]);
    ...
```

- [ ] **Step 4: Rode os testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store.js test/store.test.mjs
git commit -m "Registra a troca de formato no diff do diário"
```

---

### Task 6: A altura medida no registro de fornada

Só o campo no modelo de dados. O formulário que o preenche vem na Task 9.

**Files:**
- Modify: `src/store.js:78-99` (`criarRegistro`), `src/store.js:294-311` (`normalizarRegistro`)
- Test: `test/store.test.mjs`

- [ ] **Step 1: Escreva os testes que falham**

Em `test/store.test.mjs`, ao fim do arquivo:

```js
test('o registro guarda a altura medida, e nulo quando não foi medida', () => {
  const receita = novaReceita('Teste');
  assert.equal(criarRegistro(receita, {}, { agora: T0 }).alturaReal, null);
  assert.equal(criarRegistro(receita, { alturaReal: 9.4 }, { agora: T0 }).alturaReal, 9.4);
});

test('a altura medida sobrevive ao export/import', () => {
  const estado = estadoInicial();
  const receita = estado.receitas[0];
  estado.registros.push(criarRegistro(receita, { alturaReal: 9.4, pesoRealAssado: 505 }, { agora: T0 }));

  const { ok, estado: voltou } = importar(exportar(estado));
  assert.ok(ok, 'importou');
  assert.equal(voltou.registros[0].alturaReal, 9.4);
});
```

- [ ] **Step 2: Rode e confirme que falham**

Run: `node --test test/store.test.mjs`
Expected: FAIL — `alturaReal` é `undefined`, não `null`.

- [ ] **Step 3: Acrescente o campo nos dois lugares**

Em `criarRegistro` (`src/store.js`), logo depois de `pesoRealAssado: dados.pesoRealAssado ?? null,`:

```js
    alturaReal: dados.alturaReal ?? null,
```

Em `normalizarRegistro`, logo depois de `pesoRealAssado: bruto.pesoRealAssado ?? null,`:

```js
    alturaReal: bruto.alturaReal ?? null,
```

- [ ] **Step 4: Rode os testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store.js test/store.test.mjs
git commit -m "Guarda a altura medida no registro de fornada"
```

---

### Task 7: O seletor na tela

**A partir daqui não há teste automatizado** — `app.js` toca DOM e o projeto não tem harness. Cada tarefa traz o roteiro de verificação manual, e ele é obrigatório antes do commit.

**Files:**
- Modify: `src/app.js:154-163` (`campoEntrada`), `src/app.js:1116-1123` (`aplicarEntrada`), `src/app.js:1420-1432` (listener de `input`)
- Modify: `src/styles.css` (depois da regra `.campo-controle input:focus`, linha ~789)

- [ ] **Step 1: Desenhe o `<select>`**

Em `src/app.js`, troque `campoEntrada` por:

```js
/** O seletor mora na mesma moldura dos numéricos, só que sem os botões de passo. */
function controleOpcoes(campo, valor) {
  const opcoes = campo.opcoes
    .map((o) => `<option value="${o.valor}"${o.valor === valor ? ' selected' : ''}>${escapar(o.rotulo)}</option>`)
    .join('');
  return `<span class="campo-controle">
    <select data-campo="${campo.chave}" aria-label="${escapar(campo.rotulo)}">${opcoes}</select>
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
```

- [ ] **Step 2: Deixe `aplicarEntrada` aceitar texto**

Em `src/app.js`, troque o corpo de `aplicarEntrada`:

```js
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
```

- [ ] **Step 3: Escute a troca no seletor**

No listener de `input` (`src/app.js`), logo depois do bloco `if (alvo.matches?.('input[data-campo]')) { ... }`:

```js
    if (alvo.matches?.('select[data-campo]')) {
      aplicarEntrada(alvo.dataset.campo, alvo.value);
      return;
    }
```

- [ ] **Step 4: Estilize**

Em `src/styles.css`, depois da regra `.campo-controle input:focus`:

```css
/* Sem botões de passo ao lado, o seletor precisa da própria folga interna
   para não encostar na moldura. */
.campo-controle select {
  border: none;
  background: none;
  font-family: inherit;
  font-size: 0.95rem;
  color: var(--crosta);
  height: 30px;
  padding: 0 4px 0 8px;
}

.campo-controle select:focus {
  outline: none;
}
```

- [ ] **Step 5: Verifique à mão**

Run: `npm run build && open index.html`

Confira, na aba **Pão**, grupo **Ajustes**:
1. Aparecem "Volume específico" com `[− 2,7 cm³/g +]` e "Formato" com um seletor mostrando *Batard*.
2. Trocar o seletor para *Boule* muda as três dimensões da seção "Fôrma estimada" na hora.
3. Recarregar a página mantém *Boule* selecionado — o valor persistiu.
4. Os botões ± do "Volume específico" andam de 0,1 em 0,1 e as dimensões acompanham.
5. Console do navegador sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/styles.css index.html artifact.html
git commit -m "Põe o seletor de formato e o volume específico no formulário"
```

---

### Task 8: O volume da fôrma como quarta métrica

**Files:**
- Modify: `src/app.js:59` (formatadores), `src/app.js:307-314` (a seção)

- [ ] **Step 1: Acrescente o formatador**

Em `src/app.js`, logo depois de `const cm = ...` (linha 59):

```js
// Fôrma e cesta se compram por volume, e ninguém compra em centímetro cúbico.
const litros = (v) => `${fmtNum(v / 1000, 2)}${uni('L')}`;
```

- [ ] **Step 2: Acrescente a métrica**

Troque a seção "Fôrma estimada". Repare que a classe `tres` sai: com quatro métricas, o grid automático de `.metricas` distribui melhor que a coluna tripla fixa.

```js
    <section class="secao">
      <h2 class="secao-titulo">Fôrma estimada</h2>
      <div class="metricas">
        ${metrica('Comprimento', cm(r.pao.comprimento))}
        ${metrica('Largura', cm(r.pao.largura))}
        ${metrica('Altura', cm(r.pao.altura))}
        ${metrica('Volume', litros(r.pao.volumeForma))}
      </div>
    </section>`;
```

- [ ] **Step 3: Verifique à mão**

Run: `npm run build && open index.html`

Confira:
1. A seção "Fôrma estimada" mostra quatro métricas, com **Volume 2,45 L** na receita padrão.
2. As quatro células ficam alinhadas, sem célula cinza sobrando.
3. Numa janela estreita (ou no simulador de celular) elas quebram em duas linhas de duas, sem estourar a largura.
4. Trocar o formato para *Baguete / filão* mantém o volume e alonga o comprimento.

- [ ] **Step 4: Commit**

```bash
git add src/app.js index.html artifact.html
git commit -m "Mostra o volume da fôrma junto das dimensões"
```

---

### Task 9: A altura medida no formulário de fornada

**Files:**
- Modify: `src/app.js:952-955` (o campo), `src/app.js:1036-1044` (a gravação)

- [ ] **Step 1: Acrescente o campo ao formulário**

Em `src/app.js`, logo depois do `<label>` do peso real:

```js
    <label class="campo-livre">
      <span>Altura do pão assado, em cm — estimado ${fmtNum(r.pao.altura, 1)} cm</span>
      <input type="text" inputmode="decimal" id="f-altura" placeholder="meça o pão mais alto">
    </label>
```

- [ ] **Step 2: Grave o valor**

Na chamada de `criarRegistro` dentro do salvamento da fornada, logo depois de `pesoRealAssado: numeroOuNulo('f-peso'),`:

```js
      alturaReal: numeroOuNulo('f-altura'),
```

- [ ] **Step 3: Verifique à mão**

Run: `npm run build && open index.html`

Confira:
1. Aba **Diário** → **Registrar fornada**: o campo de altura aparece abaixo do de peso, com o valor estimado no rótulo.
2. Registrar uma fornada com peso 505 e altura 9,4 salva sem erro.
3. Registrar uma fornada deixando a altura em branco também salva.
4. Exportar o estado (botão de export) e conferir no JSON que o registro tem `"alturaReal": 9.4`, e `null` no que ficou em branco.

- [ ] **Step 4: Commit**

```bash
git add src/app.js index.html artifact.html
git commit -m "Anota a altura do pão assado ao registrar a fornada"
```

---

### Task 10: O botão de calibrar o crescimento

**Files:**
- Modify: `src/app.js:11` (import), `src/app.js:555-566` (`blocoPesagem`), `src/app.js:630-634` (a chamada), `src/app.js:1328-1346` (o handler)

- [ ] **Step 1: Importe a calibração**

Troque a linha 11 de `src/app.js` (**numa linha só**):

```js
import { calcular, calibrarPerda, calibrarVolumeEspecifico, ENTRADAS_PADRAO } from './calc.js';
```

- [ ] **Step 2: Separe as duas medidas em blocos independentes**

`blocoPesagem` hoje devolve `''` quando não há peso — o que apagaria também a altura. Troque-o por dois blocos, cada um com sua condição:

```js
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

/**
 * Espelho de `blocoPesagem` para a altura. São independentes de propósito:
 * mede-se um sem o outro, e a linha que existe tem que aparecer sozinha.
 */
function blocoAltura(registro) {
  if (!(Number(registro.alturaReal) > 0)) return '';
  const r = calcular(registro.snapshot);
  // Com um pão pesado, o peso real é melhor base que o estimado: senão o erro
  // da perda no forno entraria na conta do crescimento.
  const peso = Number(registro.pesoRealAssado) > 0 ? Number(registro.pesoRealAssado) : r.pao.pesoAssado;
  const volume = calibrarVolumeEspecifico(peso, Number(registro.alturaReal), r.pao.formato);
  return `<div class="pesagem-real">
    <span class="sep">estimado</span> ${fmtNum(r.pao.altura, 1)} cm
    <span class="sep">·</span>
    <span class="sep">real</span> <span class="real">${fmtNum(Number(registro.alturaReal), 1)} cm</span>
    ${volume === null ? '' : `<button class="calibrar" data-acao="calibrar-crescimento" data-id="${registro.id}">calibrar crescimento → ${fmtNum(volume, 1)} cm³/g</button>`}
  </div>`;
}
```

- [ ] **Step 3: Desenhe o bloco novo**

Onde hoje há `${blocoPesagem(registro)}` (linha ~632), acrescente logo abaixo:

```js
    ${blocoAltura(registro)}
```

- [ ] **Step 4: Escreva o handler**

Em `src/app.js`, logo depois do handler `calibrar`:

```js
  async 'calibrar-crescimento'(el) {
    const registro = estado.registros.find((r) => r.id === el.dataset.id);
    if (!registro) return;
    const r = calcular(registro.snapshot);
    const peso = Number(registro.pesoRealAssado) > 0 ? Number(registro.pesoRealAssado) : r.pao.pesoAssado;
    const volume = calibrarVolumeEspecifico(peso, Number(registro.alturaReal), r.pao.formato);
    if (volume === null) return;

    const ativa = receitaAtiva(estado);
    const ok = await confirmar({
      titulo: 'Calibrar o crescimento?',
      mensagem: `Troca de ${fmtNum(ativa.entradas.volumeEspecifico, 1)} para ${fmtNum(volume, 1)} cm³/g na receita "${ativa.nome}", medido a partir da altura deste pão.`,
      rotulo: 'Calibrar',
    });
    if (!ok) return;
    ativa.entradas = { ...ativa.entradas, volumeEspecifico: volume };
    marcarAlterada();
    salvar();
    render();
  },
```

- [ ] **Step 5: Verifique à mão**

Run: `npm run build && open index.html`

Confira:
1. O registro de fornada com altura 9,4 mostra a linha `estimado 9,3 cm · real 9,4 cm` com o botão `calibrar crescimento → 2,7 cm³/g`.
2. Clicar abre a confirmação nomeando a receita, e confirmar muda o "Volume específico" na aba Pão.
3. Um registro só com peso, sem altura, mostra a linha de perda e **não** mostra a de altura. E vice-versa.
4. Um registro com altura absurda (grave um com 30 cm) mostra a linha sem botão nenhum.
5. Console do navegador sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/app.js index.html artifact.html
git commit -m "Calibra o crescimento pelo botão do diário"
```

---

### Task 11: Verificação final

**Files:** nenhum, salvo o que a verificação apontar.

- [ ] **Step 1: Suíte inteira**

Run: `npm test`
Expected: PASS, sem teste pulado.

- [ ] **Step 2: Build limpo**

Run: `npm run build && git status --short`
Expected: `index.html` e `artifact.html` já commitados nas tarefas anteriores, então `git status` sai limpo. Se aparecer diferença, o build de alguma tarefa não foi commitado — commite agora.

- [ ] **Step 3: Estado antigo carrega**

Pegue um export salvo de antes desta mudança (ou produza um removendo `formato` e `volumeEspecifico` do JSON de um export atual), importe no app e confira:
1. Importa sem erro.
2. A receita mostra "Batard" e 2,7 cm³/g.
3. As dimensões estão nos valores novos — 24,1 × 10,9 × 9,3 cm na receita padrão, não os 26,8 × 12,2 × 10,3 de antes. **Essa mudança é esperada**: era o bug de geometria.

- [ ] **Step 4: Passeio no celular**

Abra `index.html` no simulador de celular do navegador (ou no aparelho). Confira que o seletor de formato é tocável, que o grid de quatro métricas quebra em duas linhas e que nada estoura a largura da tela.

- [ ] **Step 5: Commit final, se houve conserto**

```bash
git add -A
git commit -m "Ajusta o que a verificação final apontou"
```

---

## O que este plano deliberadamente não faz

- **Não cadastra as fôrmas do usuário.** A fôrma retangular sai como *fôrma recomendada*, pelas mesmas proporções dos outros formatos. Modelar o caso invertido — você tem a fôrma, quer saber se a massa cabe — é outra feature, decidida fora do escopo durante o desenho.
- **Não estima a cesta de fermentação.** A conta parte do pão assado. A cesta contém massa crua e partiria de `massaPorPao`.
- **Não calibra as proporções do formato.** Só o volume específico é calibrável; as razões da tabela são fixas.
