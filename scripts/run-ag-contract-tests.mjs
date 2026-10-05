// Runs existing TypeScript node:test suites without adding a test dependency.
// Each tested contract is intentionally pure and has no relative imports.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const directory = resolve("lib/discovery/accelerated-growth");
const contracts = ["stage-checkpoint-contract", "atomic-persistence-contract"];
function toDataUrl(source, filename) {
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  if (compiled.diagnostics?.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(compiled.diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }));
  }
  return `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
}
for (const name of contracts) {
  const moduleSource = await readFile(resolve(directory, `${name}.ts`), "utf8");
  const moduleUrl = toDataUrl(moduleSource, `${name}.ts`);
  const testSource = await readFile(resolve(directory, `${name}.test.ts`), "utf8");
  const importPath = `"./${name}"`;
  if (!testSource.includes(importPath)) throw new Error(`Expected contract import missing: ${name}`);
  await import(toDataUrl(testSource.replace(importPath, JSON.stringify(moduleUrl)), `${name}.test.ts`));
}

const adapterSource = await readFile(resolve(directory, "atomic-persistence-adapter.ts"), "utf8");
const plannerSource = await readFile(resolve(directory, "atomic-persistence-contract.ts"), "utf8");
const plannerUrl = toDataUrl(plannerSource, "atomic-persistence-contract.ts");
const adapterUrl = toDataUrl(
  adapterSource.replace('"./atomic-persistence-contract"', JSON.stringify(plannerUrl)),
  "atomic-persistence-adapter.ts"
);
const adapterTests = await readFile(resolve(directory, "atomic-persistence-adapter.test.ts"), "utf8");
await import(toDataUrl(
  adapterTests.replace('"./atomic-persistence-adapter"', JSON.stringify(adapterUrl)),
  "atomic-persistence-adapter.test.ts"
));

const intentSource = await readFile(resolve(directory, "immutable-intent-capture.ts"), "utf8");
const intentUrl = toDataUrl(
  intentSource.replace('"./atomic-persistence-adapter"', JSON.stringify(adapterUrl)),
  "immutable-intent-capture.ts"
);
const intentTests = await readFile(resolve(directory, "immutable-intent-capture.test.ts"), "utf8");
await import(toDataUrl(
  intentTests.replace('"./immutable-intent-capture"', JSON.stringify(intentUrl)),
  "immutable-intent-capture.test.ts"
));

const watchSource = await readFile(resolve(directory, "watchlist-intent-capture.ts"), "utf8");
const watchUrl = toDataUrl(watchSource, "watchlist-intent-capture.ts");
const watchTests = await readFile(resolve(directory, "watchlist-intent-capture.test.ts"), "utf8");
await import(toDataUrl(
  watchTests.replace('"./watchlist-intent-capture"', JSON.stringify(watchUrl)),
  "watchlist-intent-capture.test.ts"
));
