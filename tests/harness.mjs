const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(condition, message) {
  if (!condition) throw new Error(message || "Falha na asserção");
}

export function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(message || `Esperado ${e}, obtido ${a}`);
  }
}

export async function runAll() {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed++;
      console.error(`FALHA  ${name}`);
      console.error(`       ${err.message}`);
    }
  }
  console.log(`\n${passed} passaram, ${failed} falharam, de ${tests.length} testes.`);
  if (failed > 0) process.exitCode = 1;
}
