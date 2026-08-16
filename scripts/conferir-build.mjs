/**
 * Confere se o index.html commitado ainda corresponde ao código em src/.
 *
 * Compara só o miolo — o conteúdo de <style> e <script> —, que é exatamente o
 * que sai de src/. Os ícones ficam de fora de propósito: eles são PNG
 * comprimidos com zlib, e a saída do zlib muda conforme a versão da biblioteca.
 * Dois ícones podem ser visualmente idênticos e byte a byte diferentes só por
 * terem sido gerados em máquinas diferentes. Comparar o arquivo inteiro fazia a
 * publicação falhar sem que nada de real estivesse errado.
 *
 * Uso: node scripts/conferir-build.mjs <commitado.html> <recem-construido.html>
 */

import fs from 'node:fs';

function miolo(html) {
  const estilo = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? null;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? null;
  if (estilo === null || script === null) {
    throw new Error('Não achei <style> ou <script> no HTML — o formato do build mudou?');
  }
  return { estilo, script };
}

const [caminhoCommitado, caminhoNovo] = process.argv.slice(2);
if (!caminhoCommitado || !caminhoNovo) {
  console.error('Uso: node scripts/conferir-build.mjs <commitado.html> <novo.html>');
  process.exit(2);
}

const commitado = miolo(fs.readFileSync(caminhoCommitado, 'utf8'));
const novo = miolo(fs.readFileSync(caminhoNovo, 'utf8'));

const divergentes = ['estilo', 'script'].filter((parte) => commitado[parte] !== novo[parte]);

if (divergentes.length === 0) {
  console.log('O build commitado corresponde ao código em src/.');
  process.exit(0);
}

const concordancia = divergentes.length === 1 ? 'não bate' : 'não batem';
console.error(`O build commitado está defasado: ${divergentes.join(' e ')} ${concordancia} com src/.`);
console.error("Rode 'npm run build' e faça commit de index.html e artifact.html.");

for (const parte of divergentes) {
  const antes = commitado[parte].split('\n');
  const depois = novo[parte].split('\n');
  const primeira = antes.findIndex((linha, i) => linha !== depois[i]);
  console.error(`\n  ${parte}: primeira diferença na linha ${primeira + 1}`);
  console.error(`    commitado: ${(antes[primeira] ?? '(fim do arquivo)').trim().slice(0, 120)}`);
  console.error(`    src/:      ${(depois[primeira] ?? '(fim do arquivo)').trim().slice(0, 120)}`);
}
process.exit(1);
