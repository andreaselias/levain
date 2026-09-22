# Ativação por incremento — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar as três proporções de ativação (starter, farinha, água) por duas entradas — incremento por parte de starter e hidratação do ativado pronto — sem que nenhuma receita salva mude de número.

**Architecture:** `src/calc.js` é uma função pura que recebe as entradas e devolve os resultados das três abas de uma vez; a interface é só recorte desse objeto. A troca é uma reparametrização bijetiva: `p = (rFl+rWa)/rSt` e a hidratação-alvo é a própria fórmula que `calc.js` usava para derivá-la. Por isso a conversão em `src/migrar.js` é exata, e os testes ancorados na planilha de origem servem de guarda-costas.

**Tech Stack:** JavaScript ES modules, sem dependências. Testes com `node --test`. Bundle de uma página só, gerado por `node build.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-22-ativacao-por-incremento-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | O que muda |
|---|---|---|
| `src/calc.js` | Motor de cálculo puro | Campos padrão, seção 2 (starter ativado), seção 6 (ativação), objeto de retorno |
| `src/campos.js` | Metadados dos campos — desenha formulário, diff do diário e retratos | Três campos saem, dois entram |
| `src/migrar.js` | Converte formatos antigos de receita | Conversor de ativação, novo caminho v3→v4 |
| `src/app.js` | Interface | Rótulo da métrica, nota de deriva, conserto do botão de passo |
| `test/calc.test.mjs` | Testes do motor | Cenários de ativação, guardas, hidratação realizada |
| `test/migrar.test.mjs` | Testes de migração | v3→v4 grama a grama |

Nenhum arquivo novo. `src/store.js` não referencia os campos de ativação e não é tocado.

---

### Task 1: A conta da ativação em `calc.js`

**Files:**
- Modify: `src/calc.js:82-90` (padrões), `src/calc.js:249-270` (seção 2), `src/calc.js:371-399` (seção 6), `src/calc.js:517` (retorno)
- Test: `test/calc.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

Substituir o teste existente `'ativação do starter cobre a massa e repõe o pote'` (por volta de `test/calc.test.mjs:128`) por este, e acrescentar o seguinte logo abaixo dele:

```js
// A planilha dimensionava a ativação só pela necessidade da massa: 18/54/54,
// 126 ativados, 6 de sobra. Aqui o ativado também repõe a mãe que sai do pote,
// e por isso estes números divergem dela de propósito.
test('ativação do starter cobre a massa e repõe o pote', () => {
  const { starter } = calcular(ENTRADAS_PADRAO);
  perto(starter.hidratacaoRealAtivado, 1, 'hidratação real do ativado');
  assert.equal(starter.maeParaAtivar, 20, 'starter-mãe');
  assert.equal(starter.farinhaAtivar, 60, 'farinha');
  assert.equal(starter.aguaAtivar, 60, 'água');
  assert.equal(starter.totalAtivado, 140, 'total ativado');
  assert.equal(starter.sobra, 20, 'volta ao pote os mesmos 20 g que saíram');
  perto(starter.farinhaNoStarter, 60, 'farinha embutida');
  perto(starter.aguaNoStarter, 60, 'água embutida');
});

// A promessa do campo `propIncremento` é literal: p partes de alimento por
// parte de mãe. Sem o passo da balança para mascarar, farinha e água do
// incremento têm que somar exatamente isso.
test('o incremento soma exatamente p vezes a mãe', () => {
  for (const p of [1, 3, 6, 0.5, 12]) {
    const r = calcular({
      ...ENTRADAS_PADRAO,
      propIncremento: p,
      arredondamentoAtivacao: 0,
    });
    perto(
      r.starter.farinhaAtivar + r.starter.aguaAtivar,
      r.starter.maeParaAtivar * p,
      `incremento com p=${p}`
    );
  }
});

// A hidratação do ativado deixa de ser descoberta e passa a ser obedecida.
test('a hidratação pedida para o ativado é a que sai', () => {
  for (const alvo of [0.6, 0.85, 1, 1.25]) {
    const r = calcular({
      ...ENTRADAS_PADRAO,
      hidratacaoAtivado: alvo,
      arredondamentoAtivacao: 0,
    });
    perto(r.starter.hidratacaoRealAtivado, alvo, `alvo ${alvo}`);
  }
});

// O pote molhado ou seco muda o que a mãe carrega, e o incremento compensa
// para o ativado cair no alvo mesmo assim.
test('o incremento compensa a hidratação do pote', () => {
  for (const hMae of [0.5, 1, 1.6]) {
    const r = calcular({
      ...ENTRADAS_PADRAO,
      hidratacaoMae: hMae,
      hidratacaoAtivado: 0.85,
      arredondamentoAtivacao: 0,
    });
    perto(r.starter.hidratacaoRealAtivado, 0.85, `pote a ${hMae}`);
  }
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test 2>&1 | grep -E "^(not ok|# (fail|pass))"`
Expected: falhas nos quatro testes acima — `hidratacaoRealAtivado` é `undefined` e `propIncremento` não existe.

- [ ] **Step 3: Trocar os campos padrão**

Em `src/calc.js`, substituir o bloco `// Starter` (linhas 82-90):

```js
  // Starter
  hidratacaoMae: 1,
  // Partes de alimento por parte de mãe: 10 g de mãe com 6 pedem 60 g de
  // farinha mais água. Equivale à proporção 1 : 3 : 3 que havia antes.
  propIncremento: 6,
  // Hidratação do ativado PRONTO, já contando a água que veio dentro da mãe.
  // É entrada, não resultado: o incremento é repartido para chegar nela.
  hidratacaoAtivado: 1,
  // Passo da balança para o que se pesa ao alimentar o pote. Separado do
  // arredondamento da massa porque a escala é outra: 10 g numa ativação de
  // 54 g destruiria a proporção.
  arredondamentoAtivacao: 1,
```

- [ ] **Step 4: Trocar a seção 2**

Substituir `src/calc.js:249-270` inteiro (de `// --- 2. Starter ativado` até a linha `const divisorAtivado = 1 + hAct;`):

```js
  // --- 2. Starter ativado --------------------------------------------------
  // Precisa vir antes da farinha: a hidratação do starter entra no denominador.
  // Ela não é mais derivada das proporções — é o que o usuário pediu, e o
  // incremento é que se ajusta para entregá-la.
  const p = e.propIncremento;
  const divisorMae = 1 + e.hidratacaoMae;
  const hAct = e.hidratacaoAtivado;
  const divisorAlvo = 1 + hAct;

  if (divisorMae <= 0) {
    avisos.push('A hidratação do starter-mãe precisa ser maior que -100%.');
  }
  if (divisorAlvo <= 0) {
    avisos.push('A hidratação do ativado precisa ser maior que -100%.');
  }
  // Zero é o valor que o resto da conta já sabe tratar como "não dá": as
  // guardas de `divisorAtivado === 0` zeram a massa em vez de produzir gramas
  // negativas.
  const divisorAtivado = divisorAlvo > 0 ? divisorAlvo : 0;
```

- [ ] **Step 5: Trocar a seção 6**

Substituir `src/calc.js:371-400` (de `// --- 6. Ativação do starter` até a linha do `const sobra = ...`):

```js
  // --- 6. Ativação do starter ---------------------------------------------
  // Tudo que se pesa ao alimentar o pote cai no passo da balança: as contas
  // sozinhas produzem valores como 46,667 g, que ninguém mede.
  const passoAtivacao = e.arredondamentoAtivacao;
  const snapAtivacao = (x) => (passoAtivacao > 0 ? excelRound(x / passoAtivacao) * passoAtivacao : x);

  let maeParaAtivar = 0;
  let farinhaAtivar = 0;
  let aguaAtivar = 0;
  if (p <= 0) {
    // Sem alimento o pote não se repõe, e `starter / p` dividiria por zero.
    // Vale a mãe inteira indo para a massa.
    avisos.push('Sem incremento, o pote não se repõe: a mãe vai inteira para a massa.');
    maeParaAtivar = roundUp(starter);
  } else if (divisorMae > 0 && divisorAlvo > 0) {
    // O ativado cobre a massa e ainda repõe a mãe que saiu do pote — sem isso
    // o pote encolhe a cada fornada. Quer-se `totalAtivado = starter + mae`;
    // como o ativado é `mae × (1 + p)`, isolar a mãe deixa `mae × p = starter`.
    maeParaAtivar = roundUp(starter / p);

    // O incremento é o que falta para o ativado inteiro bater na hidratação
    // pedida, descontado o que a mãe já trouxe. As duas parcelas somam
    // `maeParaAtivar × p` por construção.
    const totalExato = maeParaAtivar * (1 + p);
    const farinhaDaMae = maeParaAtivar / divisorMae;
    const aguaDaMae = (maeParaAtivar * e.hidratacaoMae) / divisorMae;
    farinhaAtivar = totalExato / divisorAlvo - farinhaDaMae;
    aguaAtivar = (totalExato * hAct) / divisorAlvo - aguaDaMae;

    farinhaAtivar = snapAtivacao(farinhaAtivar);
    aguaAtivar = snapAtivacao(aguaAtivar);
  }
  const totalAtivado = maeParaAtivar + farinhaAtivar + aguaAtivar;
  const sobra = Math.max(totalAtivado - starter, 0);

  // O que o ativado de fato ficou depois do passo da balança, que desvia do
  // alvo. Espelha o par `hidratacao` / `hidratacaoReal` da aba Pão.
  const farinhaRealAtivado = divisorMae > 0 ? maeParaAtivar / divisorMae + farinhaAtivar : farinhaAtivar;
  const aguaRealAtivado =
    divisorMae > 0 ? (maeParaAtivar * e.hidratacaoMae) / divisorMae + aguaAtivar : aguaAtivar;
  const hidratacaoRealAtivado = farinhaRealAtivado > 0 ? aguaRealAtivado / farinhaRealAtivado : 0;
```

- [ ] **Step 6: Trocar a chave do retorno**

Em `src/calc.js:517`, dentro de `return { starter: { ... } }`, substituir:

```js
      hidratacaoAtivado: fin(hAct),
```

por:

```js
      hidratacaoRealAtivado: fin(hidratacaoRealAtivado),
```

- [ ] **Step 7: Apagar os testes das proporções que deixaram de existir**

Em `test/calc.test.mjs`, apagar o teste `'proporção de starter zero na ativação zera a ativação com aviso'` inteiro (por volta da linha 694). No modelo novo a mãe é sempre 1 parte; não há como expressar "sem mãe", então o caso degenerado que ele guardava sumiu junto com o campo.

Substituir o teste `'ativação sem farinha nem água avisa que o pote não se repõe'` por:

```js
test('incremento zero avisa que o pote não se repõe', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, propIncremento: 0 });
  todosFinitos(r);
  // Mãe pura direto na massa: dá para fazer o pão, mas não sobra nada para o
  // pote, e a conta da reposição dividiria por zero.
  assert.equal(r.starter.maeParaAtivar, r.pao.starter, 'a mãe pura é o próprio ativado');
  assert.equal(r.starter.sobra, 0, 'não sobra nada para o pote');
  assert.ok(
    r.avisos.some((a) => /rep(õe|or)/i.test(a)),
    `esperava aviso sobre a reposição, vieram ${JSON.stringify(r.avisos)}`
  );
});
```

Em `CENARIOS_DE_ATIVACAO` (por volta de `test/calc.test.mjs:352`), trocar os cenários que usavam as proporções antigas:

```js
const CENARIOS_DE_ATIVACAO = [
  { nome: 'padrão 1:6 a 100%', entradas: {} },
  { nome: 'incremento 3,33', entradas: { propIncremento: 10 / 3 } },
  { nome: 'incremento 4', entradas: { propIncremento: 4 } },
  { nome: 'starter alto', entradas: { pctStarter: 0.35 } },
  { nome: 'starter baixo', entradas: { pctStarter: 0.05 } },
  { nome: 'mãe a 80%', entradas: { hidratacaoMae: 0.8 } },
  { nome: 'ativado a 85%', entradas: { hidratacaoAtivado: 0.85 } },
];
```

- [ ] **Step 8: Rodar os testes**

Run: `npm test 2>&1 | tail -8`
Expected: `pass 143`, `fail 0`. Os três testes ancorados na planilha (`pesagem dos ingredientes`, `farinha total e peso-alvo`, `métricas derivadas`) precisam passar sem alteração — é a prova de que a reparametrização não mexeu em nada.

- [ ] **Step 9: Commit**

```bash
git add src/calc.js test/calc.test.mjs
git commit -m "Troca as proporções de ativação por incremento e hidratação-alvo

A hidratação do ativado era derivada das três proporções e não tinha onde
ser digitada. Agora é entrada, e o incremento é repartido para entregá-la.
maeParaAtivar = roundUp(starter / p) é a mesma conta de antes escrita curto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Guarda de alcançabilidade

**Files:**
- Modify: `src/calc.js` (helper novo perto de `fin`, e dentro da seção 6)
- Test: `test/calc.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `test/calc.test.mjs`, logo depois do teste `'o incremento compensa a hidratação do pote'`:

```js
// Incremento só acrescenta. Com o pote a 200% e incremento pequeno, não há
// como chegar a 40% — seria preciso tirar água da mãe.
test('hidratação inalcançável zera a parcela negativa e avisa', () => {
  const r = calcular({
    ...ENTRADAS_PADRAO,
    hidratacaoMae: 2,
    propIncremento: 0.5,
    hidratacaoAtivado: 0.4,
    arredondamentoAtivacao: 0,
  });
  todosFinitos(r);
  assert.equal(r.starter.aguaAtivar, 0, 'a água do incremento não pode ser negativa');
  perto(
    r.starter.farinhaAtivar,
    r.starter.maeParaAtivar * 0.5,
    'a farinha leva o incremento inteiro'
  );
  assert.ok(
    r.avisos.some((a) => /alcança/i.test(a)),
    `esperava aviso de faixa alcançável, vieram ${JSON.stringify(r.avisos)}`
  );
  // Entrega o mais seco possível, que ainda é mais molhado que o pedido.
  assert.ok(
    r.starter.hidratacaoRealAtivado > 0.4,
    `o realizado ${r.starter.hidratacaoRealAtivado} tinha que ficar acima do alvo inalcançável`
  );
});

test('hidratação altíssima zera a farinha e avisa', () => {
  const r = calcular({
    ...ENTRADAS_PADRAO,
    propIncremento: 0.5,
    hidratacaoAtivado: 30,
    arredondamentoAtivacao: 0,
  });
  todosFinitos(r);
  assert.equal(r.starter.farinhaAtivar, 0, 'a farinha do incremento não pode ser negativa');
  perto(r.starter.aguaAtivar, r.starter.maeParaAtivar * 0.5, 'a água leva o incremento inteiro');
  assert.ok(r.avisos.some((a) => /alcança/i.test(a)), 'esperava aviso de faixa alcançável');
});

// Dentro da faixa, nada de aviso nem de recorte.
test('alvo dentro da faixa não dispara a guarda', () => {
  const r = calcular({ ...ENTRADAS_PADRAO, hidratacaoAtivado: 0.85 });
  assert.equal(r.avisos.filter((a) => /alcança/i.test(a)).length, 0, 'não devia avisar');
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test 2>&1 | grep -E "^not ok"`
Expected: os dois primeiros falham — hoje `aguaAtivar` sai negativo e não há aviso.

- [ ] **Step 3: Acrescentar o formatador de percentual**

Em `src/calc.js`, logo depois de `const fin = (x) => ...` (linha 138):

```js
/** Percentual legível para dentro dos avisos: 0,0769 → "7,7%". */
function pctTexto(x) {
  return `${(x * 100).toFixed(1).replace('.', ',')}%`;
}
```

- [ ] **Step 4: Acrescentar a guarda**

Na seção 6, entre o cálculo de `aguaAtivar` e as duas chamadas de `snapAtivacao`, inserir:

```js
    // Incremento só acrescenta: não há como tirar água nem farinha da mãe.
    // Fora da faixa alcançável, a parcela negativa zera e a outra leva o
    // incremento inteiro — o ativado mantém as p partes prometidas, na
    // hidratação mais próxima que dá, e `hidratacaoRealAtivado` mostra onde
    // de fato parou. A massa continua calculando com o alvo, então a receita
    // fica inconsistente até o alvo voltar para dentro da faixa: é o aviso
    // que carrega esse peso.
    if (farinhaAtivar < 0 || aguaAtivar < 0) {
      const minimo = e.hidratacaoMae / (1 + p * divisorMae);
      const maximo = e.hidratacaoMae + p * divisorMae;
      avisos.push(
        `Com o pote a ${pctTexto(e.hidratacaoMae)} e incremento ${p}, a hidratação do ativado só alcança de ${pctTexto(minimo)} a ${pctTexto(maximo)}. Os números da massa só fecham depois de o alvo voltar para dentro dessa faixa.`
      );
      const incremento = maeParaAtivar * p;
      if (aguaAtivar < 0) {
        aguaAtivar = 0;
        farinhaAtivar = incremento;
      } else {
        farinhaAtivar = 0;
        aguaAtivar = incremento;
      }
    }
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test 2>&1 | tail -8`
Expected: `pass 146`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/calc.js test/calc.test.mjs
git commit -m "Avisa quando a hidratação do ativado é inalcançável

Incremento só acrescenta, então com pote molhado e incremento pequeno um alvo
baixo pediria água negativa. A parcela negativa zera, a outra leva o incremento
inteiro, e o aviso nomeia a faixa possível.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Migração v3 → v4

**Files:**
- Modify: `src/migrar.js:15` (versão), `src/migrar.js:23-33` (`CAMPOS_MORTOS`), `src/migrar.js:47-119` (conversores)
- Test: `test/migrar.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `test/migrar.test.mjs`:

```js
// ---------------------------------------------------------------------------
// v3 → v4: as três proporções viram incremento + hidratação do ativado
// ---------------------------------------------------------------------------

const ENTRADAS_V3_BASE = {
  pesoAssadoDesejado: 500,
  numeroPaes: 2,
  hidratacao: 0.7,
  pctStarter: 0.2,
  pctSal: 0.02,
  farinhas: [
    { id: 'f-branca', nome: 'Farinha branca', preco: 4.46 },
    { id: 'f-integral', nome: 'Farinha integral', preco: 11 },
  ],
  composicaoPao: [
    { farinhaId: 'f-branca', pct: 0 },
    { farinhaId: 'f-integral', pct: 0.1 },
  ],
  composicaoStarter: [{ farinhaId: 'f-branca', pct: 0 }],
  liquidos: [],
  solidos: [],
  fatorArredondamento: 10,
  perdaForno: 0.11,
  volumeEspecifico: 2.7,
  formato: 'batard',
  paesPorFornada: 2,
  tempoPreAquecimento: 45,
  tempoCozimento: 40,
  hidratacaoMae: 1,
  propAtivacaoStarter: 1,
  propAtivacaoFarinha: 3,
  propAtivacaoAgua: 3,
  arredondamentoAtivacao: 1,
  precoSal: 2.5,
  precoKwh: 0.8653,
  potenciaForno: 0.6,
  embalagemExterna: 1.44,
  embalagemInterna: 0.63,
  etiqueta: 0.04,
};

/** Uma receita v3 completa, com as proporções que o formato guardava. */
const v3 = (proporcoes) => ({ ...ENTRADAS_V3_BASE, ...proporcoes });

/**
 * Retratos tirados com o motor ANTIGO, antes da reparametrização, rodando as
 * proporções de cada caso. São o critério de aceitação da migração: se algum
 * número destes mudar, a conversão não foi exata e receitas salvas de gente de
 * verdade mudaram sozinhas.
 */
const OURO_V3 = [
  {
    prop: { propAtivacaoStarter: 1, propAtivacaoFarinha: 3, propAtivacaoAgua: 3 },
    p: 6, hAlvo: 1,
    mae: 20, far: 60, ag: 60, total: 140, sobra: 20, paoAgua: 400,
  },
  {
    prop: { propAtivacaoStarter: 1, propAtivacaoFarinha: 3, propAtivacaoAgua: 2.55, hidratacaoMae: 0.85 },
    p: 5.55, hAlvo: 0.85,
    mae: 22, far: 66, ag: 56, total: 144, sobra: 24, paoAgua: 400,
  },
  {
    prop: { propAtivacaoStarter: 3, propAtivacaoFarinha: 5, propAtivacaoAgua: 5 },
    p: 10 / 3, hAlvo: 1,
    mae: 36, far: 60, ag: 60, total: 156, sobra: 36, paoAgua: 400,
  },
  {
    prop: { propAtivacaoStarter: 1, propAtivacaoFarinha: 2, propAtivacaoAgua: 2 },
    p: 4, hAlvo: 1,
    mae: 30, far: 60, ag: 60, total: 150, sobra: 30, paoAgua: 400,
  },
  {
    prop: { propAtivacaoStarter: 2, propAtivacaoFarinha: 6, propAtivacaoAgua: 4, hidratacaoMae: 1.2 },
    p: 5, hAlvo: 0.7368421053,
    mae: 24, far: 72, ag: 48, total: 144, sobra: 24, paoAgua: 410,
  },
];

test('a migração v3 → v4 não muda um grama', () => {
  for (const ouro of OURO_V3) {
    const migrada = migrarEntradas(v3(ouro.prop));
    const rotulo = JSON.stringify(ouro.prop);

    // As chaves mortas somem, as novas chegam com o valor convertido.
    assert.ok(!('propAtivacaoFarinha' in migrada), `${rotulo}: proporção antiga apagada`);
    assert.ok(!('propAtivacaoStarter' in migrada), `${rotulo}: proporção antiga apagada`);
    assert.ok(!('propAtivacaoAgua' in migrada), `${rotulo}: proporção antiga apagada`);
    perto(migrada.propIncremento, ouro.p, `${rotulo}: incremento`);
    perto(migrada.hidratacaoAtivado, ouro.hAlvo, `${rotulo}: hidratação do ativado`);

    // E o que importa de verdade: o ticket e a massa saem iguais aos do motor
    // antigo.
    const r = calcular(migrada);
    assert.equal(r.starter.maeParaAtivar, ouro.mae, `${rotulo}: starter-mãe`);
    assert.equal(r.starter.farinhaAtivar, ouro.far, `${rotulo}: farinha da ativação`);
    assert.equal(r.starter.aguaAtivar, ouro.ag, `${rotulo}: água da ativação`);
    assert.equal(r.starter.totalAtivado, ouro.total, `${rotulo}: total ativado`);
    assert.equal(r.starter.sobra, ouro.sobra, `${rotulo}: volta ao pote`);
    assert.equal(r.pao.agua, ouro.paoAgua, `${rotulo}: água da massa`);
    assert.equal(r.pao.starter, 120, `${rotulo}: starter na massa`);
    assert.equal(r.pao.farinhaTotal, 590, `${rotulo}: farinha total`);
  }
});

test('migrar duas vezes dá o mesmo que migrar uma', () => {
  const uma = migrarEntradas(v3({ propAtivacaoStarter: 1, propAtivacaoFarinha: 3, propAtivacaoAgua: 2.55 }));
  const duas = migrarEntradas(uma);
  assert.deepEqual(duas, uma, 'a migração é idempotente');
});

test('v3 com proporção de starter zerada cai no padrão sem NaN', () => {
  const migrada = migrarEntradas(v3({ propAtivacaoStarter: 0, propAtivacaoFarinha: 3, propAtivacaoAgua: 3 }));
  assert.ok(Number.isFinite(migrada.propIncremento), 'incremento finito');
  assert.ok(Number.isFinite(migrada.hidratacaoAtivado), 'hidratação finita');
  const r = calcular(migrada);
  assert.ok(Number.isFinite(r.pao.agua), 'a conta sobrevive');
});

// Antes, v1 e v2 caíam em `escalares`, que só copia chaves presentes no padrão:
// uma receita antiga com proporção 1:4:4 perdia o 4:4 e virava o 3:3 do padrão
// em silêncio. A conversão tem que valer nos três formatos.
test('v1 com proporções fora do padrão também converte', () => {
  const migrada = migrarEntradas({
    ...V1,
    propAtivacaoStarter: 1,
    propAtivacaoFarinha: 4,
    propAtivacaoAgua: 4,
  });
  perto(migrada.propIncremento, 8, 'v1 converte o incremento');
  // 1:4:4 com a mãe a 100% dá (4 + 0,5) / (4 + 0,5) = 1.
  perto(migrada.hidratacaoAtivado, 1, 'v1 converte a hidratação');
  assert.ok(!('propAtivacaoAgua' in migrada), 'a chave antiga não sobrevive');
});
```

Este arquivo já importa tudo de que precisa (`calcular`, `migrarEntradas`, `perto`, `V1`); nenhum import novo.

- [ ] **Step 2: Rodar para ver falhar**

Run: `node --test test/migrar.test.mjs 2>&1 | grep -E "^not ok"`
Expected: falham — `propIncremento` sai `undefined` porque nada converte.

- [ ] **Step 3: Escrever o conversor**

Em `src/migrar.js`, acrescentar logo depois de `CAMPOS_MORTOS` (linha 33):

```js
/**
 * v3 guardava a ativação como três proporções — starter, farinha, água — e
 * derivava a hidratação do ativado delas. v4 inverte: diz-se quanto alimento
 * entra por parte de starter e que hidratação se quer no ativado pronto.
 *
 * A troca é bijetiva, então a conversão é exata: `p` junta farinha e água numa
 * razão só contra o starter, e a hidratação é a própria fórmula que `calc.js`
 * usava para derivá-la. Vale para v1 e v2 também — os três formatos guardavam
 * essas mesmas chaves.
 */
function converterAtivacao(v) {
  const rSt = num(v.propAtivacaoStarter, 1);
  const rFl = num(v.propAtivacaoFarinha, 3);
  const rWa = num(v.propAtivacaoAgua, 3);
  const hMae = num(v.hidratacaoMae, ENTRADAS_PADRAO.hidratacaoMae);
  const divisorMae = 1 + hMae;
  const farinhaDaProporcao = rFl + rSt / divisorMae;

  // Entrada degenerada cai no padrão em vez de propagar NaN para a receita.
  if (!(rSt > 0) || !(divisorMae > 0) || farinhaDaProporcao === 0) {
    return {
      propIncremento: ENTRADAS_PADRAO.propIncremento,
      hidratacaoAtivado: ENTRADAS_PADRAO.hidratacaoAtivado,
    };
  }
  return {
    propIncremento: (rFl + rWa) / rSt,
    hidratacaoAtivado: (rWa + (rSt * hMae) / divisorMae) / farinhaDaProporcao,
  };
}
```

Acrescentar as três chaves a `CAMPOS_MORTOS`:

```js
const CAMPOS_MORTOS = [
  'pctIntegral',
  'pctCenteio',
  'pctMelado',
  'extras',
  'precoFarinha',
  'precoIntegral',
  'precoCenteio',
  'precoMelado',
  'precoExtras',
  // v3: as três proporções viraram propIncremento + hidratacaoAtivado
  'propAtivacaoStarter',
  'propAtivacaoFarinha',
  'propAtivacaoAgua',
];
```

- [ ] **Step 4: Ligar o conversor nos três caminhos**

Em `deV1`, logo antes de `for (const morto of CAMPOS_MORTOS)`:

```js
  Object.assign(saida, converterAtivacao(v));
```

Em `deV2`, no mesmo lugar, a mesma linha.

Acrescentar `deV3` logo depois de `deV2`:

```js
/**
 * v3 → v4: troca as proporções de ativação e preserva todo o resto como veio.
 * O spread cru, em vez de `escalares`, é de propósito: retrato de diário pode
 * ser parcial, e remontá-lo pelo padrão apagaria a distinção entre "campo que
 * a fornada não tinha" e "campo que ela tinha igual ao padrão".
 */
function deV3(v) {
  const saida = { ...v, ...converterAtivacao(v) };
  for (const morto of CAMPOS_MORTOS) delete saida[morto];
  return saida;
}
```

Trocar `migrarEntradas` inteira:

```js
/** As três proporções de ativação são a marca de que o objeto ainda é v3. */
function temProporcoesAntigas(v) {
  return (
    Object.hasOwn(v, 'propAtivacaoStarter') ||
    Object.hasOwn(v, 'propAtivacaoFarinha') ||
    Object.hasOwn(v, 'propAtivacaoAgua')
  );
}

export function migrarEntradas(entradas) {
  const v = entradas && typeof entradas === 'object' ? entradas : {};
  if (Array.isArray(v.composicaoPao)) return temProporcoesAntigas(v) ? deV3(v) : v;
  if (Array.isArray(v.farinhas)) return deV2(v);
  return deV1(v);
}
```

Subir a versão em `src/migrar.js:15`:

```js
export const VERSAO_ESTADO = 4;
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test 2>&1 | tail -8`
Expected: `pass 150`, `fail 0`. Em especial `test/store.test.mjs` continua verde — o teste `'fornada antiga sem formato herda o padrão'` monta a receita a partir de `ENTRADAS_PADRAO`, que já não tem as proporções antigas, então `migrarEntradas` a reconhece como v4 e não mexe.

- [ ] **Step 6: Commit**

```bash
git add src/migrar.js test/migrar.test.mjs
git commit -m "Migra a ativação de três proporções para incremento + alvo

A conversão é exata nos dois sentidos, então nenhuma receita salva muda de
número. Vale para v1 e v2 também: os três formatos guardavam as mesmas chaves,
e antes só o padrão sobrevivia quando as proporções fugiam dele.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Campos do formulário

**Files:**
- Modify: `src/campos.js:44-48`
- Test: `test/store.test.mjs` (só rodar; o diff do diário lê `CAMPOS` sozinho)

- [ ] **Step 1: Trocar os campos**

Em `src/campos.js`, substituir o bloco `// --- Starter ---` (linhas 43-48):

```js
  // --- Starter -------------------------------------------------------------
  { chave: 'hidratacaoMae', rotulo: 'Hidratação do starter-mãe', aba: 'starter', grupo: 'Starter-mãe', unidade: '%', fator: 100, passo: 5, casas: 0, dica: '100% significa partes iguais de água e farinha no pote.' },
  { chave: 'propIncremento', rotulo: 'Incremento por parte de starter', aba: 'starter', grupo: 'Ativação', unidade: '', passo: 0.5, casas: 2, dica: 'Quanto alimento entra por parte de mãe. 3 significa 30 g de farinha mais água para cada 10 g tirados do pote.' },
  { chave: 'hidratacaoAtivado', rotulo: 'Hidratação do ativado', aba: 'starter', grupo: 'Ativação', unidade: '%', fator: 100, passo: 5, casas: 1, dica: 'Hidratação do ativado pronto, já contando a água que veio dentro da mãe. O incremento se reparte para chegar nela.' },
  { chave: 'arredondamentoAtivacao', rotulo: 'Passo da balança', aba: 'starter', grupo: 'Ativação', unidade: 'g', passo: 0.5, casas: 1, dica: 'Arredonda o que você pesa para alimentar o pote. As partes continuam somando o total exato. Zero desliga.' },
```

`casas: 2` em `propIncremento` não é enfeite: uma receita migrada de `1 : 3 : 2,55` guarda `p = 5,55`, e uma casa só mostraria 5,6.

- [ ] **Step 2: Rodar os testes**

Run: `npm test 2>&1 | tail -8`
Expected: `pass 150`, `fail 0`.

- [ ] **Step 3: Commit**

```bash
git add src/campos.js
git commit -m "Põe incremento e hidratação do ativado no formulário

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Tela do starter

**Files:**
- Modify: `src/app.js:419` (métrica), `src/app.js:416-429` (nota de deriva)

- [ ] **Step 1: Renomear a métrica**

Em `src/app.js:419`, substituir:

```js
        ${metrica('Hidratação do ativado', pct(r.starter.hidratacaoAtivado), true)}
```

por:

```js
        ${metrica('Hidratação real do ativado', pct(r.starter.hidratacaoRealAtivado), true)}
```

- [ ] **Step 2: Acrescentar a nota de deriva**

`saidasStarter` recebe só o resultado `r`, e a nota precisa comparar duas entradas. Trocar a assinatura e a chamada.

Em `src/app.js`, na linha da definição (por volta de 389):

```js
function saidasStarter(r, entradas) {
```

Em `src/app.js:779`, dentro de `atualizar()`, trocar a chamada:

```js
      ? saidasStarter(r, ativa.entradas)
```

E, dentro da segunda `<section>` de `saidasStarter`, logo depois do bloco `${composicao.length ? ... : ''}`, acrescentar:

```js
      ${entradas.hidratacaoAtivado !== entradas.hidratacaoMae
        ? `<p class="nota-rodape">A sobra volta para o pote com a hidratação do ativado, diferente da que o pote tem. A cada fornada o pote caminha nessa direção — para ele ficar parado, iguale as duas.</p>`
        : ''}
```

- [ ] **Step 3: Conferir no navegador**

```bash
npm run build && python3 -m http.server 8731 >/dev/null 2>&1 &
```

Abrir `http://localhost:8731/index.html`, ir na aba Starter e conferir:
- a métrica diz "Hidratação real do ativado" e mostra 100,0%
- pôr 85 em "Hidratação do ativado" muda o ticket (era 20/60/60) e faz aparecer a nota da deriva
- pôr 100 de volta faz a nota sumir

Encerrar o servidor: `pkill -f "http.server 8731"`

- [ ] **Step 4: Commit**

```bash
git add src/app.js index.html artifact.html
git commit -m "Mostra a hidratação realizada e avisa da deriva do pote

A métrica virou resultado de verdade: depois do passo da balança o ativado
desvia do alvo, e é esse valor que interessa conferir. A nota aparece quando
alvo e pote divergem, porque a sobra volta para o pote e o arrasta.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: O botão de passo quantiza o valor guardado

**Files:**
- Modify: `src/app.js:1473-1490`

- [ ] **Step 1: Reproduzir o defeito**

Com o app aberto em `http://localhost:8731/index.html`, no console:

```js
const c = document.querySelector('input[data-campo="propIncremento"]');
c.value = '5,55'; c.dispatchEvent(new Event('input', { bubbles: true }));
document.querySelector('.aba[data-aba="pao"]').click();
document.querySelector('.aba[data-aba="starter"]').click();
document.querySelector('[data-acao="passo"][data-campo="propIncremento"][data-sinal="1"]').click();
document.querySelector('input[data-campo="propIncremento"]').value;
```

Expected hoje: `"6,1"` — o 5,55 foi lido do texto já truncado para 5,6. Esperado depois: `"6,05"`.

- [ ] **Step 2: Ler o valor guardado em vez do texto**

Em `src/app.js`, dentro da ação `passo`, substituir a linha `const atual = paraNumero(entrada.value);` e o cálculo seguinte:

```js
    // O texto do campo já vem cortado por `casas`; partir dele regrava o valor
    // truncado e come a precisão de quem digitou 5,55 ou veio da migração. O
    // valor guardado é a fonte, e o texto só o substitui quando não há nada
    // guardado ainda.
    const guardado = chaveCampo
      ? receitaAtiva(estado).entradas[chaveCampo]
      : itemPorId(lista, id)?.[attr];
    const atual = Number.isFinite(Number(guardado))
      ? paraExibicao(molde, Number(guardado))
      : paraNumero(entrada.value);
    const proximo = Math.max(0, (Number.isFinite(atual) ? atual : 0) + Number(sinal) * (molde.passo ?? 1));
```

- [ ] **Step 3: Acrescentar `paraExibicao` aos imports**

Em `src/app.js:12`, acrescentar `paraExibicao` à lista importada de `./campos.js`:

```js
import { CAMPOS, CAMPO_POR_CHAVE, ESCALAS, GRUPOS_DE_ESCALA, MOLDE, formatarEntrada, formatarValor, paraArmazenamento, paraExibicao } from './campos.js';
```

- [ ] **Step 4: Conferir no navegador**

Repetir o roteiro do Step 1.
Expected: `"6,05"`.

Conferir também que o passo comum não regrediu: clicar `+` em "Hidratação" na aba Pão leva 70 para 71.

- [ ] **Step 5: Rodar os testes**

Run: `npm test 2>&1 | tail -8`
Expected: `pass 150`, `fail 0`. `app.js` não tem cobertura automatizada; a verificação é a do Step 4.

- [ ] **Step 6: Commit**

```bash
git add src/app.js index.html artifact.html
git commit -m "Botão de passo parte do valor guardado, não do texto do campo

O texto já vem cortado pela casa decimal do campo, então somar a partir dele
regravava o truncado. Com valores migrados como 5,55 isso deixou de ser raro.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Fechamento

**Files:**
- Modify: `index.html`, `artifact.html` (gerados)

- [ ] **Step 1: Reconstruir o bundle**

Run: `npm run build`
Expected: sem erro. `index.html` e `artifact.html` reescritos.

- [ ] **Step 2: Conferir que o bundle está em dia**

```bash
git status --porcelain index.html artifact.html
```

Expected: vazio se os commits anteriores já incluíram o build; qualquer coisa listada vira um commit.

- [ ] **Step 3: Suíte inteira**

Run: `npm test 2>&1 | tail -8`
Expected: `pass 150`, `fail 0`.

- [ ] **Step 4: Verificação de ponta a ponta no navegador**

Servir e abrir a aba Starter. Com os padrões, conferir que o ticket é **20 / 60 / 60 → 140 g** e a hidratação real do ativado é **100,0%** — idêntico ao que havia antes da mudança inteira.

Depois pôr incremento **3** e hidratação do ativado **85%** e conferir que o ticket se mexe e que a hidratação real fica em 85% ± meio ponto.

- [ ] **Step 5: Commit, se houver o que commitar**

```bash
git add -A && git commit -m "Reconstrói o bundle

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Cobertura do spec

| Requisito do spec | Task |
|---|---|
| Dois campos novos, três saem | 1, 4 |
| `maeParaAtivar = roundUp(starter / p)` | 1 |
| Incremento reparte para bater no alvo | 1 |
| `hAct` vira entrada e alimenta `divisorAtivado` | 1 |
| `farinhaNoStarter` / `aguaNoStarter` seguem o alvo exato | 1 (consequência de `divisorAtivado = 1 + hAlvo`) |
| `hidratacaoRealAtivado` | 1 |
| Guarda `p <= 0` | 1 |
| Guardas `divisorMae <= 0` e `divisorAlvo <= 0` | 1 |
| Guarda de alcançabilidade e aviso com a faixa | 2 |
| Massa segue o alvo mesmo quando recortado | 2 (comentário e aviso) |
| Migração v3 → v4 exata, com v1 e v2 juntos | 3 |
| `VERSAO_ESTADO` = 4 | 3 |
| Padrões 6 e 100% | 1 |
| Nota de deriva do pote | 5 |
| Métrica renomeada | 5 |
| Conserto do botão de passo | 6 |

---

## Achados das revisões, registrados para não se perderem

Nenhum destes entra no escopo destas sete tarefas. Ficam anotados porque
apareceram na revisão e não têm dono.

**`propIncremento` denormal derruba a ativação em silêncio.** Com
`propIncremento: 5e-310`, `starter / p` estoura para `Infinity`, a subtração
vira `NaN`, e `fin()` mapeia o objeto `starter` inteiro para zeros — sem aviso
nenhum, indistinguível de "não há o que ativar". Com `1e-300` a mãe sai a
1,2e+302 g, número finito e absurdo, também sem aviso. `fin()` só peneira
`NaN` e `Infinity`, não magnitude implausível. O mesmo vale para
`hidratacaoMae` chegando perto de -100% sem cruzar.

Nenhum campo do formulário produz isso: os steppers são quantizados por `passo`
e `casas`. Só um backup montado à mão ou uma chamada direta a `calcular()`
alcança. É o assunto de quem for endurecer a validação de entrada algum dia,
não desta leva.

**`'o total ativado e a sobra usam os valores já arredondados'` não exercita
arredondamento fracionário.** Com `propIncremento: 10/3` cai em 60/60 exatos —
mas a proporção 3:5:5 que havia antes também caía, então não é regressão
introduzida aqui. Defeito pré-existente do teste, não da mudança.

**A migração tem uma exceção combinada: oito receitas mudam de número.** A
conversão é exata em 98.552 das 98.560 combinações varridas (razões 1-4 : 1-8 :
1-8, pote de 50% a 200%, starter de 10% a 35%, passo de balança de 0,1 a 25 g).
As oito que sobram estão congeladas no teste `'a migração muda de número só nas
divergências já conhecidas'`, que falha se aparecer uma nova ou se alguma sumir.

O mecanismo: onde o valor exato pré-arredondamento cai em cima de um empate do
passo da balança, um erro de última casa decide o empate para o outro lado e a
ativação sai um passo diferente. Não é "p dízima em binário" — várias das
divergentes têm p inteiro; o erro nasce no cálculo de `hidratacaoAtivado`.

Duas medições anteriores estavam erradas e ficam registradas como tal: a
primeira varreu só o pote em {50, 100, 150, 200}% e concluiu 3 divergências,
todas no passo de 10 g. O pote anda de 5 em 5% no formulário, 175% é valor
comum, e é justamente onde a maioria das divergências mora. Grade escolhida por
quem quer um resultado produz esse resultado.

A fórmula da hidratação usa fração única — `(rWa·dMae + rSt·hMae) / (rFl·dMae +
rSt)` — e não a forma com divisões aninhadas. São a mesma álgebra, mas a
aninhada arredonda no meio e erra o último bit em 38% das razões; a fração
única bate com o valor exato em racionais. Isso levou as divergências de 11
para 8, que é o piso: verificado contra aritmética exata, nenhuma fórmula que
calcule a hidratação verdadeira faz melhor.

Zero não é alcançável. O resíduo nasce do cancelamento em
`totalExato/divisorAlvo − farinhaDaMae` dentro de `calc.js`, não da conversão.
Existe um par `(p, h)` a ±1 ulp que conserta cada caso, mas a direção do ajuste
alterna sem regra — seria constante mágica, e disso não se sai.

**A massa nunca diverge.** Em nenhuma das 98.560 combinações algum valor de
`pao.*` mudou: farinha, água, sal e peso do pão saem idênticos. A exceção é só
do que se pesa para alimentar o pote — `farinhaAtivar`, `aguaAtivar` e os
derivados `totalAtivado` e `sobra`, por um passo de balança.

**Correção de uma afirmação anterior deste registro:** dizer que "a resposta
antiga era arbitrária do outro lado" estava errado. `excelRound` é convenção
especificada — metade para longe do zero, com `precisao15` ali justamente para
bater com a planilha. Sob a regra do próprio código, 80 g é a resposta definida
e 70 g é violação dela. As duas erram 5 g do valor exato, mas só uma segue a
regra da casa.
