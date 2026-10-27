// Regression guard for the Temporal codec bug class: a raw JS Date assigned as
// an ORM-bound field value fails at runtime against the real database
// ('RUNTIME.ENCODE_FAILED ... received: a Date'). Two such writes shipped in
// payments.service.ts (verifiedAt: new Date()) and were caught by the real-run
// suite; this scan fails the unit run if the pattern returns.
//
// Allowed on these lines: toTemporalInstant/toPlainDate/toPlainTime wrappers,
// and read conversions (new Date(String(...)) that only format API output).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

function collectTypeScriptFiles(root: string, into: string[] = []): string[] {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'test') continue;
      collectTypeScriptFiles(full, into);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      into.push(full);
    }
  }
  return into;
}

test('no raw JS Date is assigned as an ORM-bound field value', () => {
  const offenders: string[] = [];
  for (const root of ['src', 'scripts']) {
    for (const file of collectTypeScriptFiles(root)) {
      if (file.endsWith(join('utils', 'date-time.ts'))) continue; // the wrappers themselves
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        // The bug shape: `field: new Date(...)` (or a codec-wrapper around it)
        // inside an object literal passed to the ORM.
        const match = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*(toTemporalInstant\(|toPlainDate\(|toPlainTime\()?new Date\(/.exec(line);
        if (!match) return;
        const wrapped = Boolean(match[1]);
        const readConversion = /new Date\(String\(/.test(line);
        if (!wrapped && !readConversion) {
          offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `raw Date field values must pass through toTemporalInstant/toPlainDate/toPlainTime:\n${offenders.join('\n')}`,
  );
});
